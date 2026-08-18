const pool = require('../config/database');
const ContactGroup = require('./ContactGroup');

class InboxMessage {
  static normalizePhone(raw) {
    return ContactGroup.normalizePhone(raw);
  }

  static async create(data) {
    const {
      userId,
      accountId,
      phoneNumber,
      contactName,
      body,
      direction = 'in',
      waMessageId,
    } = data;
    const phone = this.normalizePhone(phoneNumber) || String(phoneNumber).replace(/\D/g, '');
    const [result] = await pool.execute(
      `INSERT INTO inbox_messages
       (user_id, account_id, phone_number, contact_name, body, direction, wa_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, accountId, phone, contactName || null, body, direction, waMessageId || null],
    );
    return result.insertId;
  }

  static async findAllByUserId(userId, {
    accountId,
    search,
    unreadOnly,
    limit = 30,
    offset = 0,
  } = {}) {
    let query = `
      SELECT m.* FROM inbox_messages m
      WHERE m.user_id = ?`;
    const params = [userId];

    if (accountId) {
      query += ' AND m.account_id = ?';
      params.push(accountId);
    }
    if (unreadOnly === '1' || unreadOnly === true) {
      query += ' AND m.is_read = 0 AND m.direction = \'in\'';
    }
    if (search && String(search).trim()) {
      query += ' AND (m.body LIKE ? OR m.phone_number LIKE ? OR m.contact_name LIKE ?)';
      const q = `%${String(search).trim()}%`;
      params.push(q, q, q);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async countByUserId(userId, opts = {}) {
    let query = 'SELECT COUNT(*) AS total FROM inbox_messages WHERE user_id = ?';
    const params = [userId];
    if (opts.accountId) {
      query += ' AND account_id = ?';
      params.push(opts.accountId);
    }
    if (opts.unreadOnly) {
      query += ' AND is_read = 0 AND direction = \'in\'';
    }
    if (opts.search && String(opts.search).trim()) {
      query += ' AND (body LIKE ? OR phone_number LIKE ? OR contact_name LIKE ?)';
      const q = `%${String(opts.search).trim()}%`;
      params.push(q, q, q);
    }
    const [rows] = await pool.execute(query, params);
    return Number(rows[0]?.total ?? 0);
  }

  static async getConversation(userId, accountId, phoneNumber, { limit = 50, offset = 0 } = {}) {
    const phone = this.normalizePhone(phoneNumber) || phoneNumber;
    const [rows] = await pool.execute(
      `SELECT * FROM inbox_messages
       WHERE user_id = ? AND account_id = ? AND phone_number = ?
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`,
      [userId, accountId, phone, limit, offset],
    );
    return rows;
  }

  static async markRead(userId, ids) {
    if (!ids.length) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const [r] = await pool.execute(
      `UPDATE inbox_messages SET is_read = 1
       WHERE user_id = ? AND id IN (${placeholders})`,
      [userId, ...ids],
    );
    return r.affectedRows;
  }

  static async unreadCount(userId, accountId = null) {
    let query =
      'SELECT COUNT(*) AS total FROM inbox_messages WHERE user_id = ? AND is_read = 0 AND direction = \'in\'';
    const params = [userId];
    if (accountId) {
      query += ' AND account_id = ?';
      params.push(accountId);
    }
    const [rows] = await pool.execute(query, params);
    return Number(rows[0]?.total ?? 0);
  }
}

module.exports = InboxMessage;
