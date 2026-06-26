const pool = require('../config/database');
const ContactGroup = require('./ContactGroup');

class OptOut {
  static normalizePhone(raw) {
    return ContactGroup.normalizePhone(raw);
  }

  static async add(userId, phoneNumber, { reason = null, source = 'manual' } = {}) {
    const phone = this.normalizePhone(phoneNumber);
    if (!phone) return null;
    try {
      await pool.execute(
        `INSERT INTO opt_out_list (user_id, phone_number, reason, source)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE reason = VALUES(reason), source = VALUES(source)`,
        [userId, phone, reason, source],
      );
      return phone;
    } catch {
      return null;
    }
  }

  static async remove(userId, phoneNumber) {
    const phone = this.normalizePhone(phoneNumber);
    if (!phone) return false;
    const [r] = await pool.execute(
      'DELETE FROM opt_out_list WHERE user_id = ? AND phone_number = ?',
      [userId, phone],
    );
    return r.affectedRows > 0;
  }

  static async isOptedOut(userId, phoneNumber) {
    const phone = this.normalizePhone(phoneNumber);
    if (!phone) return false;
    const [rows] = await pool.execute(
      'SELECT 1 FROM opt_out_list WHERE user_id = ? AND phone_number = ? LIMIT 1',
      [userId, phone],
    );
    return rows.length > 0;
  }

  static async getOptedOutSet(userId, phones) {
    if (!phones.length) return new Set();
    const normalized = phones.map((p) => this.normalizePhone(p)).filter(Boolean);
    if (!normalized.length) return new Set();
    const placeholders = normalized.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT phone_number FROM opt_out_list WHERE user_id = ? AND phone_number IN (${placeholders})`,
      [userId, ...normalized],
    );
    return new Set(rows.map((r) => r.phone_number));
  }

  static async findAllByUserId(userId, { search, limit = 50, offset = 0 } = {}) {
    let query = 'SELECT * FROM opt_out_list WHERE user_id = ?';
    const params = [userId];
    if (search && String(search).trim()) {
      const digits = String(search).replace(/\D/g, '');
      if (digits) {
        query += ' AND phone_number LIKE ?';
        params.push(`%${digits}%`);
      }
    }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async countByUserId(userId, { search } = {}) {
    let query = 'SELECT COUNT(*) AS total FROM opt_out_list WHERE user_id = ?';
    const params = [userId];
    if (search && String(search).trim()) {
      const digits = String(search).replace(/\D/g, '');
      if (digits) {
        query += ' AND phone_number LIKE ?';
        params.push(`%${digits}%`);
      }
    }
    const [rows] = await pool.execute(query, params);
    return Number(rows[0]?.total ?? 0);
  }
}

module.exports = OptOut;
