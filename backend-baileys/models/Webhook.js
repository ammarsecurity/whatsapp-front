const pool = require('../config/database');

const VALID_EVENTS = [
  'message.received',
  'message.sent',
  'campaign.completed',
  'campaign.failed',
  'account.ready',
  'account.disconnected',
];

class Webhook {
  static getValidEvents() {
    return VALID_EVENTS;
  }

  static async create(userId, { url, events, secret, enabled = true }) {
    const ev = Array.isArray(events) ? events : [];
    const [result] = await pool.execute(
      `INSERT INTO webhooks (user_id, url, events, secret, enabled)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, String(url).trim(), JSON.stringify(ev), secret || null, enabled ? 1 : 0],
    );
    return result.insertId;
  }

  static async findAllByUserId(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM webhooks WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
    );
    return rows.map((r) => ({
      ...r,
      events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events,
    }));
  }

  static async findById(id, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM webhooks WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      ...r,
      events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events,
    };
  }

  static async findEnabledForEvent(userId, event) {
    const [rows] = await pool.execute(
      'SELECT * FROM webhooks WHERE user_id = ? AND enabled = 1',
      [userId],
    );
    return rows
      .map((r) => ({
        ...r,
        events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events,
      }))
      .filter((r) => Array.isArray(r.events) && r.events.includes(event));
  }

  static async update(id, userId, data) {
    const row = await this.findById(id, userId);
    if (!row) return null;
    await pool.execute(
      `UPDATE webhooks SET url = ?, events = ?, secret = ?, enabled = ?
       WHERE id = ? AND user_id = ?`,
      [
        data.url != null ? String(data.url).trim() : row.url,
        JSON.stringify(data.events ?? row.events),
        data.secret !== undefined ? data.secret : row.secret,
        data.enabled !== undefined ? (data.enabled ? 1 : 0) : row.enabled,
        id,
        userId,
      ],
    );
    return this.findById(id, userId);
  }

  static async delete(id, userId) {
    const [r] = await pool.execute(
      'DELETE FROM webhooks WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return r.affectedRows > 0;
  }
}

module.exports = Webhook;
