const { requireAuth } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const { successResponse, errorResponse } = require('../utils/response');
const db = require('../database/db');
const push = require('../services/support-push.service');
const notifications = require('../repositories/notification.repository');
const fs = require('fs');
const attachmentStorage = require('../services/support-attachment.service');

async function conversationFor(userId, create = false) {
    let conversation = (await db.query(`SELECT * FROM support_conversations WHERE user_id = ?`, [userId]))[0];
    if (!conversation && create) {
        if (db.USE_POSTGRES) conversation = (await db.query(`INSERT INTO support_conversations (user_id) VALUES (?) RETURNING *`, [userId]))[0];
        else {
            await db.query(`INSERT INTO support_conversations (user_id) VALUES (?)`, [userId]);
            conversation = (await db.query(`SELECT * FROM support_conversations WHERE user_id = ?`, [userId]))[0];
        }
    }
    return conversation;
}

async function insertMessage(conversationId, senderId, senderRole, message) {
    if (db.USE_POSTGRES) {
        return (await db.query(
            `INSERT INTO support_messages (conversation_id, sender_id, sender_role, message)
             VALUES (?, ?, ?, ?) RETURNING *`,
            [conversationId, senderId, senderRole, message]
        ))[0];
    }
    await db.query(
        `INSERT INTO support_messages (conversation_id, sender_id, sender_role, message) VALUES (?, ?, ?, ?)`,
        [conversationId, senderId, senderRole, message]
    );
    const inserted = (await db.query(`SELECT last_insert_rowid() AS id`))[0];
    return (await db.query(`SELECT * FROM support_messages WHERE id = ?`, [inserted.id]))[0];
}

async function messagesForConversation(conversationId) {
    const messages = await db.query(
        `SELECT * FROM support_messages WHERE conversation_id = ? ORDER BY id ASC`,
        [conversationId]
    );
    const attachments = await db.query(
        `SELECT id, message_id, original_name, mime_type, byte_size, created_at
         FROM support_attachments WHERE conversation_id = ? ORDER BY id ASC`,
        [conversationId]
    );
    const byMessage = new Map();
    for (const attachment of attachments) {
        const list = byMessage.get(Number(attachment.message_id)) || [];
        list.push(attachment);
        byMessage.set(Number(attachment.message_id), list);
    }
    return messages.map(message => ({
        ...message,
        attachments: byMessage.get(Number(message.id)) || []
    }));
}

async function supportRoutes(req, res, body) {
    try {
        const attachmentMatch = req.url.match(/^\/api\/v1\/support\/attachments\/(\d+)$/);
        if (req.method === 'GET' && attachmentMatch) {
            if (!await requireAuth(req, res)) return true;
            const attachment = (await db.query(
                `SELECT a.*, c.user_id AS conversation_user_id
                 FROM support_attachments a
                 JOIN support_conversations c ON c.id = a.conversation_id
                 WHERE a.id = ?`,
                [Number(attachmentMatch[1])]
            ))[0];
            if (!attachment) return errorResponse(res, 'Support attachment not found', 404);
            const isAdmin = String(req.user.role || '').toUpperCase() === 'ADMIN';
            if (!isAdmin && Number(attachment.conversation_user_id) !== Number(req.user.id)) {
                return errorResponse(res, 'Support attachment access denied', 403);
            }
            const filePath = attachmentStorage.resolveAttachmentPath(attachment.storage_key);
            let stat;
            try {
                stat = await fs.promises.stat(filePath);
            } catch (error) {
                if (error.code === 'ENOENT') return errorResponse(res, 'Support attachment file is unavailable', 404);
                throw error;
            }
            res.writeHead(200, {
                'Content-Type': attachment.mime_type,
                'Content-Length': stat.size,
                'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`,
                'Cache-Control': 'private, max-age=300',
                'Access-Control-Allow-Origin': '*'
            });
            const stream = fs.createReadStream(filePath);
            stream.on('error', () => { if (!res.writableEnded) res.end(); });
            stream.pipe(res);
            return true;
        }
        if (req.method === 'GET' && req.url === '/api/v1/push/public-key') {
            if (!await requireAuth(req, res)) return true;
            return successResponse(res, { public_key: (await push.keys()).publicKey }, 'Push key fetched');
        }
        if (req.method === 'POST' && req.url === '/api/v1/push/subscribe') {
            if (!await requireAuth(req, res)) return true;
            const subscription = body.subscription || body;
            if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) throw new Error('Invalid push subscription');
            await db.query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`, [req.user.id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);
            return successResponse(res, null, 'Phone alerts enabled', 201);
        }
        if (req.method === 'GET' && req.url === '/api/v1/support/conversation') {
            if (!await requireAuth(req, res)) return true;
            const conversation = await conversationFor(req.user.id);
            const messages = conversation ? await messagesForConversation(conversation.id) : [];
            if (conversation) await db.query(`UPDATE support_messages SET is_read = 1 WHERE conversation_id = ? AND sender_role = 'ADMIN'`, [conversation.id]);
            return successResponse(res, { conversation, messages }, 'Support conversation fetched');
        }
        if (req.method === 'POST' && req.url === '/api/v1/support/messages') {
            if (!await requireAuth(req, res)) return true;
            const message = String(body.message || '').trim();
            const preparedAttachment = attachmentStorage.prepareAttachment(body.attachment);
            if ((!message && !preparedAttachment) || message.length > 4000) throw new Error('Enter a message up to 4,000 characters or attach an image');
            const conversation = await conversationFor(req.user.id, true);
            let storedKey = '';
            try {
                await db.withTransaction(async () => {
                    const createdMessage = await insertMessage(
                        conversation.id,
                        req.user.id,
                        'USER',
                        message || 'Image attachment'
                    );
                    if (preparedAttachment) {
                        storedKey = await attachmentStorage.saveAttachment(preparedAttachment);
                        await db.query(
                            `INSERT INTO support_attachments
                             (message_id, conversation_id, uploader_id, storage_key, original_name, mime_type, byte_size)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [createdMessage.id, conversation.id, req.user.id, storedKey,
                                preparedAttachment.original_name, preparedAttachment.mime_type, preparedAttachment.byte_size]
                        );
                    }
                });
            } catch (error) {
                if (storedKey) await attachmentStorage.deleteAttachment(storedKey).catch(() => undefined);
                throw error;
            }
            await db.query(`UPDATE support_conversations SET status = 'OPEN', last_message_at = CURRENT_TIMESTAMP WHERE id = ?`, [conversation.id]);
            const notificationMessage = message || 'Image attachment';
            const admins = await db.query(`SELECT id FROM users WHERE UPPER(role) = 'ADMIN'`);
            for (const admin of admins) {
                await notifications.createNotification({
                    user_id: admin.id,
                    title: `Support message from ${req.user.first_name} ${req.user.last_name}`,
                    message: notificationMessage.slice(0, 180),
                    type: 'INFO',
                    action_link: `/admin?support=${conversation.id}`,
                    created_by: req.user.id
                });
            }
            await push.sendToRole('ADMIN', { title: `Support: ${req.user.first_name} ${req.user.last_name}`, body: notificationMessage.slice(0, 120), url: `/?support=${conversation.id}` });
            return successResponse(res, null, 'Message sent', 201);
        }
        if (req.method === 'GET' && req.url === '/api/v1/admin/support/conversations') {
            if (!await requireAdmin(req, res)) return true;
            const rows = await db.query(`SELECT c.*, u.first_name, u.last_name, u.email, u.account_number, (SELECT message FROM support_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message, (SELECT COUNT(*) FROM support_messages m WHERE m.conversation_id = c.id AND m.sender_role = 'USER' AND m.is_read = 0) AS unread_count FROM support_conversations c JOIN users u ON u.id = c.user_id ORDER BY c.last_message_at DESC`);
            return successResponse(res, rows, 'Support conversations fetched');
        }
        const adminThread = req.url.match(/^\/api\/v1\/admin\/support\/conversations\/(\d+)$/);
        if (adminThread && req.method === 'GET') {
            if (!await requireAdmin(req, res)) return true;
            const id = Number(adminThread[1]);
            const conversation = (await db.query(`SELECT c.*, u.first_name, u.last_name, u.email, u.account_number FROM support_conversations c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, [id]))[0];
            if (!conversation) throw new Error('Conversation not found');
            await db.query(`UPDATE support_messages SET is_read = 1 WHERE conversation_id = ? AND sender_role = 'USER'`, [id]);
            return successResponse(res, { conversation, messages: await messagesForConversation(id) }, 'Conversation fetched');
        }
        if (adminThread && req.method === 'POST') {
            if (!await requireAdmin(req, res)) return true;
            const id = Number(adminThread[1]);
            const message = String(body.message || '').trim();
            if (!message || message.length > 4000) throw new Error('Enter a message up to 4,000 characters');
            const conversation = (await db.query(`SELECT * FROM support_conversations WHERE id = ?`, [id]))[0];
            if (!conversation) throw new Error('Conversation not found');
            await db.query(`INSERT INTO support_messages (conversation_id, sender_id, sender_role, message) VALUES (?, ?, 'ADMIN', ?)`, [id, req.user.id, message]);
            await db.query(`UPDATE support_conversations SET status = 'OPEN', last_message_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
            await notifications.createNotification({ user_id: conversation.user_id, title: 'New support reply', message: message.slice(0, 180), type: 'INFO', action_link: '/support', created_by: req.user.id });
            return successResponse(res, null, 'Reply sent', 201);
        }
        if (adminThread && req.method === 'PATCH') {
            if (!await requireAdmin(req, res)) return true;
            const status = String(body.status || '').toUpperCase();
            if (!['OPEN', 'PENDING', 'CLOSED'].includes(status)) throw new Error('Invalid conversation status');
            await db.query(`UPDATE support_conversations SET status = ? WHERE id = ?`, [status, Number(adminThread[1])]);
            return successResponse(res, null, 'Conversation updated');
        }
    } catch (error) { return errorResponse(res, error.message, 400); }
    return false;
}
module.exports = supportRoutes;
