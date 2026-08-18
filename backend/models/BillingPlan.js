const pool = require('../config/database');

function mapPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    billingCycle: row.billing_cycle,
    priceIqd: row.price_iqd,
    description: row.description || '',
    isActive: !!row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class BillingPlan {
  static async findAll({ activeOnly = false } = {}) {
    const sql = activeOnly
      ? 'SELECT * FROM billing_plans WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
      : 'SELECT * FROM billing_plans ORDER BY sort_order ASC, id ASC';
    const [rows] = await pool.execute(sql);
    return rows.map(mapPlan);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM billing_plans WHERE id = ?', [id]);
    return mapPlan(rows[0]);
  }

  static async create({ name, billingCycle, priceIqd, description, isActive, sortOrder }) {
    const [result] = await pool.execute(
      `INSERT INTO billing_plans (name, billing_cycle, price_iqd, description, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        billingCycle === 'yearly' ? 'yearly' : 'monthly',
        Math.max(0, parseInt(priceIqd, 10) || 0),
        description ? String(description).trim().slice(0, 500) : null,
        isActive === false ? 0 : 1,
        parseInt(sortOrder, 10) || 0,
      ],
    );
    return this.findById(result.insertId);
  }

  static async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;
    const name = data.name != null ? String(data.name).trim() : current.name;
    const billingCycle = data.billingCycle === 'yearly' || data.billingCycle === 'monthly'
      ? data.billingCycle
      : current.billingCycle;
    const priceIqd = data.priceIqd != null ? Math.max(0, parseInt(data.priceIqd, 10) || 0) : current.priceIqd;
    const description = data.description != null
      ? String(data.description).trim().slice(0, 500)
      : current.description;
    const isActive = data.isActive != null ? (data.isActive ? 1 : 0) : (current.isActive ? 1 : 0);
    const sortOrder = data.sortOrder != null ? parseInt(data.sortOrder, 10) || 0 : current.sortOrder;
    await pool.execute(
      `UPDATE billing_plans
       SET name = ?, billing_cycle = ?, price_iqd = ?, description = ?, is_active = ?, sort_order = ?
       WHERE id = ?`,
      [name, billingCycle, priceIqd, description || null, isActive, sortOrder, id],
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [r] = await pool.execute('DELETE FROM billing_plans WHERE id = ?', [id]);
    return r.affectedRows > 0;
  }
}

module.exports = BillingPlan;
