const db = require('../database/db');

async function createNotification(data) {
    const sql = db.USE_POSTGRES
        ? `INSERT INTO notifications (user_id, title, message, type, action_link, created_by)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
        : `INSERT INTO notifications (user_id, title, message, type, action_link, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`;

    const result = await db.query(sql, [
        data.user_id,
        data.title,
        data.message,
        data.type || 'INFO',
        data.action_link || null,
        data.created_by || null
    ]);

    if (db.USE_POSTGRES) return result[0];
    const inserted = await db.query(`SELECT last_insert_rowid() AS id`);
    return findById(inserted[0].id);
}

async function findById(id) {
    const rows = await db.query(`SELECT * FROM notifications WHERE id = ?`, [id]);
    return rows[0];
}

async function getForUser(userId) {
    return db.query(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
        [userId]
    );
}

async function getUnreadCount(userId) {
    const rows = await db.query(
        `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`,
        [userId]
    );
    return Number(rows[0]?.count || 0);
}

async function markRead(id, userId) {
    await db.query(
        `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
        [id, userId]
    );
    const rows = await db.query(
        `SELECT * FROM notifications WHERE id = ? AND user_id = ?`,
        [id, userId]
    );
    return rows[0] || null;
}

async function markAllRead(userId) {
    await db.query(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [userId]);
}

module.exports = { createNotification, getForUser, getUnreadCount, markRead, markAllRead };
