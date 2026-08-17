const db = require('../database/db');

async function createTransfer(data) {
    const insertSql = db.USE_POSTGRES
        ? `
       INSERT INTO transfers (
    sender_id,
    transfer_type,
    recipient_user_id,
    recipient_account_number,
    recipient_name,
    recipient_bank,
    amount,
    currency,
    status,
    description,
    approved_by,
    verification_code_id,
    clearance_fee_amount,
    clearance_status

)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
        `
        : `
       INSERT INTO transfers (
    sender_id,
    transfer_type,
    recipient_user_id,
    recipient_account_number,
    recipient_name,
    recipient_bank,
    amount,
    currency,
    status,
    description,
    approved_by,
    verification_code_id,
    clearance_fee_amount,
    clearance_status
    
)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

    const result = await db.query(
        insertSql,
        [
            data.sender_id,
            data.transfer_type,
            data.recipient_user_id || null,
            data.recipient_account_number || null,
            data.recipient_name || null,
            data.recipient_bank || null,
            data.amount,
            data.currency || 'USD',
            data.status || 'PENDING',
            data.description || '',
            data.approved_by || null,
            data.verification_code_id || null,
            data.clearance_fee_amount ?? null,
            data.clearance_status || null
        ]
    );

    if (db.USE_POSTGRES) {
        return result[0];
    }

    const inserted = await db.query(`SELECT last_insert_rowid() AS id`);

    return await getTransferById(inserted[0].id);
}

async function getTransfers() {

    return await db.query(`
        SELECT *
        FROM transfers
        ORDER BY id DESC
        LIMIT 500
    `);
}

async function getUserTransfers(userId) {
    return await db.query(
        `SELECT * FROM transfers
         WHERE sender_id = ? OR recipient_user_id = ?
         ORDER BY id DESC
         LIMIT 200`,
        [userId, userId]
    );
}

async function getTransferById(
    transferId
) {

    const transfers =
        await db.query(
            `
            SELECT *
            FROM transfers
            WHERE id = ?
            `,
            [transferId]
        );

    return transfers[0];
}

async function updateTransferStatus(
    transferId,
    status
) {

    await db.query(
        `
        UPDATE transfers
        SET status = ?,
            clearance_status = CASE
                WHEN ? = 'COMPLETED' AND clearance_status IN ('AWAITING_PAYMENT', 'AWAITING_CONFIRMATION') THEN 'CLEARED'
                WHEN ? IN ('RESTRICTED', 'REJECTED', 'DECLINED', 'FAILED', 'REVERSED') AND clearance_status IN ('AWAITING_PAYMENT', 'AWAITING_CONFIRMATION') THEN 'CANCELLED'
                ELSE clearance_status
            END
        WHERE id = ?
        `,
        [status, status, status, transferId]
    );

    return await getTransferById(
        transferId
    );
}

async function updateClearanceFee(transferId, amount) {
    await db.query(
        `UPDATE transfers SET clearance_fee_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [amount, transferId]
    );
    return getTransferById(transferId);
}

async function submitClearanceReceipt(transferId, receipt) {
    await db.query(
        `UPDATE transfers
         SET clearance_receipt = ?, clearance_status = 'AWAITING_CONFIRMATION',
             clearance_submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [receipt, transferId]
    );
    return getTransferById(transferId);
}

module.exports = {
    createTransfer,
    getTransfers,
    getUserTransfers,
    getTransferById,
    updateTransferStatus,
    updateClearanceFee,
    submitClearanceReceipt
};
