const notificationRepository = require('../repositories/notification.repository');
const userRepository = require('../repositories/user.repository');

async function sendNotification(admin, data) {
    const title = String(data.title || '').trim();
    const message = String(data.message || '').trim();
    if (!title || !message) throw new Error('Title and message are required');

    const users = await userRepository.getAllUsers();
    const requestedIds = Array.isArray(data.user_ids)
        ? new Set(data.user_ids.map(Number))
        : new Set();
    const recipients = data.send_to_all
        ? users.filter(user => user.role !== 'ADMIN')
        : users.filter(user => requestedIds.has(Number(user.id)));

    if (!recipients.length) throw new Error('Select at least one notification recipient');

    const created = [];
    for (const recipient of recipients) {
        created.push(await notificationRepository.createNotification({
            user_id: recipient.id,
            title,
            message,
            type: String(data.type || 'INFO').toUpperCase(),
            action_link: data.action_link,
            created_by: admin.id
        }));
    }
    return { recipient_count: created.length, notifications: created };
}

module.exports = {
    sendNotification,
    listForUser: notificationRepository.getForUser,
    getUnreadCount: notificationRepository.getUnreadCount,
    markRead: notificationRepository.markRead,
    markAllRead: notificationRepository.markAllRead
};
