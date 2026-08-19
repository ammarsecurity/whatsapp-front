const pool = require('../config/database');

function mapLicense(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    billingOrderId: row.billing_order_id,
    accountId: row.account_id || null,
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    planName: row.plan_name || null,
    billingCycle: row.billing_cycle || null,
  };
}

class AccountLicense {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT l.*, p.name AS plan_name, p.billing_cycle
       FROM account_licenses l
       LEFT JOIN billing_plans p ON p.id = l.plan_id
       WHERE l.id = ?`,
      [id],
    );
    return mapLicense(rows[0]);
  }

  static async findAllByUserId(userId) {
    const [rows] = await pool.execute(
      `SELECT l.*, p.name AS plan_name, p.billing_cycle
       FROM account_licenses l
       LEFT JOIN billing_plans p ON p.id = l.plan_id
       WHERE l.user_id = ?
       ORDER BY l.id DESC`,
      [userId],
    );
    return rows.map(mapLicense);
  }

  static async findUnusedActive(userId) {
    const [rows] = await pool.execute(
      `SELECT l.*, p.name AS plan_name, p.billing_cycle
       FROM account_licenses l
       LEFT JOIN billing_plans p ON p.id = l.plan_id
       WHERE l.user_id = ?
         AND l.status = 'active'
         AND l.account_id IS NULL
         AND l.expires_at > NOW()
       ORDER BY l.id ASC
       LIMIT 1`,
      [userId],
    );
    return mapLicense(rows[0]);
  }

  static async findActiveForAccount(userId, accountId) {
    const [rows] = await pool.execute(
      `SELECT l.*, p.name AS plan_name, p.billing_cycle
       FROM account_licenses l
       LEFT JOIN billing_plans p ON p.id = l.plan_id
       WHERE l.user_id = ?
         AND l.account_id = ?
         AND l.status = 'active'
         AND l.expires_at > NOW()
       ORDER BY l.expires_at DESC
       LIMIT 1`,
      [userId, accountId],
    );
    return mapLicense(rows[0]);
  }

  static async createFromPaidOrder(order, plan) {
    const months = plan.billingCycle === 'yearly' ? 12 : 1;
    const [result] = await pool.execute(
      `INSERT INTO account_licenses
         (user_id, plan_id, billing_order_id, account_id, status, starts_at, expires_at)
       VALUES (?, ?, ?, NULL, 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? MONTH))`,
      [order.userId, order.planId, order.id, months],
    );
    return this.findById(result.insertId);
  }

  static async findByOrderId(orderId) {
    const [rows] = await pool.execute(
      'SELECT * FROM account_licenses WHERE billing_order_id = ? LIMIT 1',
      [orderId],
    );
    return mapLicense(rows[0]);
  }

  static async linkAccount(licenseId, accountId) {
    await pool.execute(
      'UPDATE account_licenses SET account_id = ? WHERE id = ? AND account_id IS NULL',
      [accountId, licenseId],
    );
    return this.findById(licenseId);
  }

  static async expireDue() {
    const [r] = await pool.execute(
      `UPDATE account_licenses
       SET status = 'expired'
       WHERE status = 'active' AND expires_at <= NOW()`,
    );
    return r.affectedRows;
  }

  static async seedExistingAccounts(months = 12) {
    const [r] = await pool.execute(
      `INSERT INTO account_licenses (user_id, plan_id, billing_order_id, account_id, status, starts_at, expires_at)
       SELECT a.user_id, NULL, NULL, a.account_id, 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? MONTH)
       FROM accounts a
       WHERE NOT EXISTS (
         SELECT 1 FROM account_licenses l
         WHERE l.user_id = a.user_id AND l.account_id = a.account_id
       )`,
      [months],
    );
    return r.affectedRows;
  }
}

module.exports = AccountLicense;
