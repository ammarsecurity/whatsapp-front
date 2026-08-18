const pool = require('../config/database');

function mapOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    gateway: row.gateway,
    referenceId: row.reference_id,
    amountIqd: row.amount_iqd,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    planName: row.plan_name,
    billingCycle: row.billing_cycle,
  };
}

class BillingOrder {
  static async create({ userId, planId, gateway, amountIqd }) {
    const [result] = await pool.execute(
      `INSERT INTO billing_orders (user_id, plan_id, gateway, reference_id, amount_iqd, payment_status)
       VALUES (?, ?, ?, ?, ?, 'Unpaid')`,
      [userId, planId, gateway, `tmp-${Date.now()}`, amountIqd],
    );
    const id = result.insertId;
    const referenceId = `WA-${id}`;
    await pool.execute('UPDATE billing_orders SET reference_id = ? WHERE id = ?', [referenceId, id]);
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT o.*, p.name AS plan_name, p.billing_cycle
       FROM billing_orders o
       LEFT JOIN billing_plans p ON p.id = o.plan_id
       WHERE o.id = ?`,
      [id],
    );
    return mapOrder(rows[0]);
  }

  static async findByReference(referenceId) {
    const [rows] = await pool.execute(
      `SELECT o.*, p.name AS plan_name, p.billing_cycle
       FROM billing_orders o
       LEFT JOIN billing_plans p ON p.id = o.plan_id
       WHERE o.reference_id = ?`,
      [referenceId],
    );
    return mapOrder(rows[0]);
  }

  static async findByUserId(userId, limit = 50) {
    const [rows] = await pool.execute(
      `SELECT o.*, p.name AS plan_name, p.billing_cycle
       FROM billing_orders o
       LEFT JOIN billing_plans p ON p.id = o.plan_id
       WHERE o.user_id = ?
       ORDER BY o.id DESC
       LIMIT ${parseInt(limit, 10) || 50}`,
      [userId],
    );
    return rows.map(mapOrder);
  }

  static async markPaid(id) {
    await pool.execute(
      `UPDATE billing_orders
       SET payment_status = 'Paid', paid_at = COALESCE(paid_at, NOW())
       WHERE id = ? AND payment_status <> 'Paid'`,
      [id],
    );
    return this.findById(id);
  }

  static async markStatus(id, status) {
    await pool.execute('UPDATE billing_orders SET payment_status = ? WHERE id = ?', [status, id]);
    return this.findById(id);
  }
}

module.exports = BillingOrder;
module.exports.parseOrderId = function parseOrderId(referenceId) {
  const m = String(referenceId || '').trim().match(/^WA-(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
};
