const pool = require('../config/database');

function mapTx(row) {
  if (!row) return null;
  return {
    id: row.id,
    billingOrderId: row.billing_order_id,
    gateway: row.gateway,
    referenceId: row.reference_id,
    externalId: row.external_id,
    amountIqd: row.amount_iqd,
    status: row.status,
    rawPayload: row.raw_payload,
    createdAt: row.created_at,
    userId: row.user_id,
    username: row.username,
    planName: row.plan_name,
    paymentStatus: row.payment_status,
  };
}

class PaymentTransaction {
  static async upsert({ billingOrderId, gateway, referenceId, externalId, amountIqd, status, rawPayload }) {
    const [existing] = await pool.execute(
      'SELECT * FROM payment_transactions WHERE gateway = ? AND reference_id = ? ORDER BY id DESC LIMIT 1',
      [gateway, referenceId],
    );
    const payload = rawPayload
      ? (typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload)).slice(0, 65000)
      : null;
    if (existing[0]) {
      await pool.execute(
        `UPDATE payment_transactions
         SET external_id = COALESCE(?, external_id),
             amount_iqd = COALESCE(?, amount_iqd),
             status = COALESCE(?, status),
             raw_payload = COALESCE(?, raw_payload)
         WHERE id = ?`,
        [externalId || null, amountIqd ?? null, status || null, payload, existing[0].id],
      );
      return mapTx({ ...existing[0], external_id: externalId || existing[0].external_id, status: status || existing[0].status });
    }
    const [result] = await pool.execute(
      `INSERT INTO payment_transactions
         (billing_order_id, gateway, reference_id, external_id, amount_iqd, status, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [billingOrderId, gateway, referenceId, externalId || null, amountIqd ?? null, status || null, payload],
    );
    return { id: result.insertId, billingOrderId, gateway, referenceId, externalId, amountIqd, status };
  }

  static async findAll({ limit = 100, offset = 0 } = {}) {
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const [rows] = await pool.execute(
      `SELECT t.*, o.user_id, o.payment_status, u.username, p.name AS plan_name
       FROM payment_transactions t
       INNER JOIN billing_orders o ON o.id = t.billing_order_id
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN billing_plans p ON p.id = o.plan_id
       ORDER BY t.id DESC
       LIMIT ${lim} OFFSET ${off}`,
    );
    return rows.map(mapTx);
  }
}

module.exports = PaymentTransaction;
