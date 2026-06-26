const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

class ApiKey {
  static generateKey() {
    const raw = crypto.randomBytes(32).toString('hex');
    const key = `wsk_${raw}`;
    const prefix = key.slice(0, 12);
    return { key, prefix };
  }

  static async create(userId, name, expiresAt = null) {
    const { key, prefix } = this.generateKey();
    const hash = await bcrypt.hash(key, 10);
    const [result] = await pool.execute(
      `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, String(name).trim(), prefix, hash, expiresAt],
    );
    return { id: result.insertId, key, prefix, name: String(name).trim() };
  }

  static async findAllByUserId(userId) {
    const [rows] = await pool.execute(
      `SELECT id, user_id, name, key_prefix, last_used_at, expires_at, created_at
       FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  static async findById(id, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM api_keys WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return rows[0] || null;
  }

  static async findByPrefix(prefix) {
    const [rows] = await pool.execute(
      'SELECT * FROM api_keys WHERE key_prefix = ? LIMIT 5',
      [prefix],
    );
    return rows;
  }

  static async validateKey(plainKey) {
    if (!plainKey || !plainKey.startsWith('wsk_')) return null;
    const prefix = plainKey.slice(0, 12);
    const candidates = await this.findByPrefix(prefix);
    for (const row of candidates) {
      const ok = await bcrypt.compare(plainKey, row.key_hash);
      if (ok) {
        if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
        await pool.execute(
          'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
          [row.id],
        );
        return row;
      }
    }
    return null;
  }

  static async delete(id, userId) {
    const [r] = await pool.execute(
      'DELETE FROM api_keys WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return r.affectedRows > 0;
  }
}

module.exports = ApiKey;
