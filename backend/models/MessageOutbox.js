const pool = require('../config/database');

class MessageOutbox {
  static async enqueue({
    userId,
    accountId,
    phone,
    kind = 'chat',
    body = null,
    mediaUrl = null,
    caption = null,
    filename = null,
  }) {
    const [result] = await pool.execute(
      `INSERT INTO message_outbox
        (user_id, account_id, phone, kind, body, media_url, caption, filename, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
      [userId, accountId, phone, kind, body, mediaUrl, caption, filename],
    );
    return result.insertId;
  }

  static async claimQueued(userId, accountId, limit = 20) {
    const cap = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const [rows] = await pool.execute(
      `SELECT * FROM message_outbox
       WHERE user_id = ? AND account_id = ? AND status = 'queued'
       ORDER BY id ASC LIMIT ${cap}`,
      [userId, accountId],
    );
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    await pool.execute(
      `UPDATE message_outbox SET status = 'sending' WHERE id IN (${placeholders}) AND status = 'queued'`,
      ids,
    );
    return rows;
  }

  static async markSent(id, waMessageId) {
    await pool.execute(
      `UPDATE message_outbox
       SET status = 'sent', wa_message_id = ?, sent_at = CURRENT_TIMESTAMP, error_message = NULL
       WHERE id = ?`,
      [waMessageId || null, id],
    );
  }

  static async markFailed(id, errorMessage) {
    await pool.execute(
      `UPDATE message_outbox SET status = 'failed', error_message = ? WHERE id = ?`,
      [String(errorMessage || 'send failed').slice(0, 1000), id],
    );
  }

  static async requeue(id) {
    await pool.execute(
      `UPDATE message_outbox SET status = 'queued', error_message = NULL WHERE id = ?`,
      [id],
    );
  }
}

module.exports = MessageOutbox;
