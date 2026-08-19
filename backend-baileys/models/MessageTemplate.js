const pool = require('../config/database');

class MessageTemplate {
  static async create(userId, { name, body }) {
    const [result] = await pool.execute(
      'INSERT INTO message_templates (user_id, name, body) VALUES (?, ?, ?)',
      [userId, String(name).trim(), String(body)],
    );
    return result.insertId;
  }

  static async findAllByUserId(userId, { search, limit = 50, offset = 0 } = {}) {
    let query = 'SELECT * FROM message_templates WHERE user_id = ?';
    const params = [userId];
    if (search && String(search).trim()) {
      query += ' AND (name LIKE ? OR body LIKE ?)';
      const q = `%${String(search).trim()}%`;
      params.push(q, q);
    }
    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async countByUserId(userId, { search } = {}) {
    let query = 'SELECT COUNT(*) AS total FROM message_templates WHERE user_id = ?';
    const params = [userId];
    if (search && String(search).trim()) {
      query += ' AND (name LIKE ? OR body LIKE ?)';
      const q = `%${String(search).trim()}%`;
      params.push(q, q);
    }
    const [rows] = await pool.execute(query, params);
    return Number(rows[0]?.total ?? 0);
  }

  static async findByName(userId, name) {
    const [rows] = await pool.execute(
      'SELECT * FROM message_templates WHERE user_id = ? AND name = ? LIMIT 1',
      [userId, String(name).trim()],
    );
    return rows[0] || null;
  }

  static async findById(id, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM message_templates WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return rows[0] || null;
  }

  static async update(id, userId, { name, body }) {
    const t = await this.findById(id, userId);
    if (!t) return null;
    await pool.execute(
      'UPDATE message_templates SET name = ?, body = ? WHERE id = ? AND user_id = ?',
      [
        name != null ? String(name).trim() : t.name,
        body != null ? String(body) : t.body,
        id,
        userId,
      ],
    );
    return this.findById(id, userId);
  }

  static async delete(id, userId) {
    const [r] = await pool.execute(
      'DELETE FROM message_templates WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return r.affectedRows > 0;
  }
}

module.exports = MessageTemplate;
