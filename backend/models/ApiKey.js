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

  static async create(userId, name, expiresAt = null, accountId = null) {
    const { key, prefix } = this.generateKey();
    const hash = await bcrypt.hash(key, 10);
    const bound = accountId ? String(accountId).trim() : null;
    try {
      const [result] = await pool.execute(
        `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, expires_at, account_id, token_plain)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, String(name).trim(), prefix, hash, expiresAt, bound, key],
      );
      return {
        id: result.insertId,
        key,
        prefix,
        name: String(name).trim(),
        accountId: bound,
      };
    } catch (err) {
      const msg = String(err.message || '');
      if (!msg.includes('account_id') && !msg.includes('token_plain') && err.code !== 'ER_BAD_FIELD_ERROR') {
        throw err;
      }
      try {
        const [result] = await pool.execute(
          `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, expires_at, account_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [userId, String(name).trim(), prefix, hash, expiresAt, bound],
        );
        return {
          id: result.insertId,
          key,
          prefix,
          name: String(name).trim(),
          accountId: bound,
        };
      } catch (inner) {
        if (!String(inner.message || '').includes('account_id') && inner.code !== 'ER_BAD_FIELD_ERROR') {
          throw inner;
        }
        const [result] = await pool.execute(
          `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
          [userId, String(name).trim(), prefix, hash, expiresAt],
        );
        return {
          id: result.insertId,
          key,
          prefix,
          name: String(name).trim(),
          accountId: bound,
        };
      }
    }
  }

  static async findAllByUserId(userId) {
    try {
      const [rows] = await pool.execute(
        `SELECT id, user_id, name, key_prefix, last_used_at, expires_at, created_at, account_id, token_plain
         FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
        [userId],
      );
      return rows;
    } catch (err) {
      if (!String(err.message || '').includes('account_id') && err.code !== 'ER_BAD_FIELD_ERROR') {
        throw err;
      }
      const [rows] = await pool.execute(
        `SELECT id, user_id, name, key_prefix, last_used_at, expires_at, created_at
         FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
        [userId],
      );
      return rows;
    }
  }

  static async findByAccount(userId, accountId) {
    const bound = String(accountId || '').trim();
    if (!bound) return null;
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM api_keys WHERE user_id = ? AND account_id = ? ORDER BY id DESC LIMIT 1`,
        [userId, bound],
      );
      return rows[0] || null;
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR' && !String(err.message || '').includes('account_id')) {
        throw err;
      }
      return null;
    }
  }

  static matchAccount(row, accountId) {
    const bound = String(accountId || '').trim().toLowerCase();
    if (!bound) return false;
    return (
      String(row.account_id || '').trim().toLowerCase() === bound ||
      String(row.name || '').trim().toLowerCase() === bound
    );
  }

  /** Persist plaintext once. Never rotates a token that is already stored. */
  static async fillMissingPlainToken(row) {
    if (!row) return row;
    if (row.token_plain) return row;
    const { key, prefix } = this.generateKey();
    const hash = await bcrypt.hash(key, 10);
    try {
      const [result] = await pool.execute(
        `UPDATE api_keys SET key_prefix = ?, key_hash = ?, token_plain = ?
         WHERE id = ? AND (token_plain IS NULL OR token_plain = '')`,
        [prefix, hash, key, row.id],
      );
      if (result.affectedRows === 0) {
        const fresh = await this.findById(row.id, row.user_id);
        return fresh || row;
      }
      row.token_plain = key;
      row.key_prefix = prefix;
      return row;
    } catch (err) {
      console.warn('[api_keys] could not persist token_plain for', row.id, err.message);
      row.token_plain = key;
      row.key_prefix = prefix;
      return row;
    }
  }

  static async ensureForAccount(userId, accountId) {
    const bound = String(accountId || '').trim();
    if (!bound) return null;
    const all = await this.findAllByUserId(userId);
    const existing = all.find((k) => this.matchAccount(k, bound));
    if (existing) {
      if (existing.token_plain) return existing;
      return this.fillMissingPlainToken(existing);
    }
    const created = await this.create(userId, bound, null, bound);
    return {
      id: created.id,
      name: created.name,
      key_prefix: created.prefix,
      account_id: created.accountId,
      token_plain: created.key,
      last_used_at: null,
      expires_at: null,
      created_at: new Date(),
    };
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
        pool.execute(
          'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
          [row.id],
        ).catch(() => {});
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
