const pool = require('../config/database');

class AutoReply {
  static async create(userId, data) {
    const { accountId, keyword, matchType = 'contains', replyText, enabled = true } = data;
    const [result] = await pool.execute(
      `INSERT INTO auto_replies (user_id, account_id, keyword, match_type, reply_text, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        accountId || null,
        keyword != null ? String(keyword).trim() || null : null,
        matchType,
        String(replyText),
        enabled ? 1 : 0,
      ],
    );
    return result.insertId;
  }

  static async findAllByUserId(userId, { accountId, limit = 50, offset = 0 } = {}) {
    let query = 'SELECT * FROM auto_replies WHERE user_id = ?';
    const params = [userId];
    if (accountId) {
      query += ' AND (account_id IS NULL OR account_id = ?)';
      params.push(accountId);
    }
    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async countByUserId(userId) {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM auto_replies WHERE user_id = ?',
      [userId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  static async findById(id, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM auto_replies WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return rows[0] || null;
  }

  static async update(id, userId, data) {
    const row = await this.findById(id, userId);
    if (!row) return null;
    await pool.execute(
      `UPDATE auto_replies SET
        account_id = ?, keyword = ?, match_type = ?, reply_text = ?, enabled = ?
       WHERE id = ? AND user_id = ?`,
      [
        data.accountId !== undefined ? (data.accountId || null) : row.account_id,
        data.keyword !== undefined ? (String(data.keyword).trim() || null) : row.keyword,
        data.matchType ?? row.match_type,
        data.replyText ?? row.reply_text,
        data.enabled !== undefined ? (data.enabled ? 1 : 0) : row.enabled,
        id,
        userId,
      ],
    );
    return this.findById(id, userId);
  }

  static async delete(id, userId) {
    const [r] = await pool.execute(
      'DELETE FROM auto_replies WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return r.affectedRows > 0;
  }

  /** Rules for account: global (account_id NULL) + account-specific, enabled only */
  static async getActiveRules(userId, accountId) {
    const [rows] = await pool.execute(
      `SELECT * FROM auto_replies
       WHERE user_id = ? AND enabled = 1
         AND (account_id IS NULL OR account_id = ?)
       ORDER BY account_id DESC, id ASC`,
      [userId, accountId],
    );
    return rows;
  }

  static matchRule(rule, text) {
    const body = String(text || '').trim();
    const lower = body.toLowerCase();
    if (rule.match_type === 'any') return true;
    const kw = String(rule.keyword || '').trim().toLowerCase();
    if (!kw) return false;
    if (rule.match_type === 'exact') return lower === kw;
    return lower.includes(kw);
  }
}

module.exports = AutoReply;
