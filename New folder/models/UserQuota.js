const pool = require('../config/database');

const DEFAULT_MESSAGE_LIMIT = 1000;
const DEFAULT_CHECK_LIMIT = 500;

class UserQuota {
  static todayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  static async ensure(userId) {
    const today = this.todayDate();
    const [rows] = await pool.execute(
      'SELECT * FROM user_quotas WHERE user_id = ?',
      [userId],
    );
    if (!rows.length) {
      await pool.execute(
        `INSERT INTO user_quotas (user_id, daily_message_limit, daily_check_limit, quota_reset_date)
         VALUES (?, ?, ?, ?)`,
        [userId, DEFAULT_MESSAGE_LIMIT, DEFAULT_CHECK_LIMIT, today],
      );
      return this.get(userId);
    }
    const q = rows[0];
    const resetDate = q.quota_reset_date
      ? String(q.quota_reset_date).slice(0, 10)
      : null;
    if (resetDate !== today) {
      await pool.execute(
        `UPDATE user_quotas SET messages_sent_today = 0, checks_today = 0, quota_reset_date = ?
         WHERE user_id = ?`,
        [today, userId],
      );
    }
    return this.get(userId);
  }

  static async get(userId) {
    await this.ensure(userId);
    const [rows] = await pool.execute(
      'SELECT * FROM user_quotas WHERE user_id = ?',
      [userId],
    );
    return rows[0] || null;
  }

  static async updateLimits(userId, { dailyMessageLimit, dailyCheckLimit }) {
    await this.ensure(userId);
    const msg =
      dailyMessageLimit != null
        ? Math.max(1, parseInt(dailyMessageLimit, 10) || DEFAULT_MESSAGE_LIMIT)
        : undefined;
    const chk =
      dailyCheckLimit != null
        ? Math.max(1, parseInt(dailyCheckLimit, 10) || DEFAULT_CHECK_LIMIT)
        : undefined;
    if (msg != null) {
      await pool.execute(
        'UPDATE user_quotas SET daily_message_limit = ? WHERE user_id = ?',
        [msg, userId],
      );
    }
    if (chk != null) {
      await pool.execute(
        'UPDATE user_quotas SET daily_check_limit = ? WHERE user_id = ?',
        [chk, userId],
      );
    }
    return this.get(userId);
  }

  static async checkMessageQuota(userId, count = 1) {
    const q = await this.ensure(userId);
    const limit = Number(q.daily_message_limit ?? DEFAULT_MESSAGE_LIMIT);
    const used = Number(q.messages_sent_today ?? 0);
    if (used + count > limit) {
      return {
        ok: false,
        error: `Daily message limit reached (${used}/${limit})`,
        used,
        limit,
      };
    }
    return { ok: true, used, limit };
  }

  static async incrementMessages(userId, count = 1) {
    await this.ensure(userId);
    await pool.execute(
      'UPDATE user_quotas SET messages_sent_today = messages_sent_today + ? WHERE user_id = ?',
      [count, userId],
    );
  }

  static async checkNumberQuota(userId, count = 1) {
    const q = await this.ensure(userId);
    const limit = Number(q.daily_check_limit ?? DEFAULT_CHECK_LIMIT);
    const used = Number(q.checks_today ?? 0);
    if (used + count > limit) {
      return {
        ok: false,
        error: `Daily number-check limit reached (${used}/${limit})`,
        used,
        limit,
      };
    }
    return { ok: true, used, limit };
  }

  static async incrementChecks(userId, count = 1) {
    await this.ensure(userId);
    await pool.execute(
      'UPDATE user_quotas SET checks_today = checks_today + ? WHERE user_id = ?',
      [count, userId],
    );
  }
}

module.exports = UserQuota;
