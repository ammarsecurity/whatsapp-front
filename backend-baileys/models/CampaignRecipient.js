const pool = require('../config/database');

class CampaignRecipient {
  static async bulkInsert(campaignId, rows) {
    if (!rows.length) return;
    const values = rows.map(() => '(?, ?, ?, ?)').join(',');
    const params = [];
    for (const r of rows) {
      params.push(campaignId, r.phone, r.status, r.error || null);
    }
    await pool.execute(
      `INSERT INTO campaign_recipients (campaign_id, phone_number, status, error_message) VALUES ${values}`,
      params,
    );
  }

  static async findByCampaign(campaignId, userId, { status, limit = 50, offset = 0 } = {}) {
    const [check] = await pool.execute(
      'SELECT id FROM campaigns WHERE id = ? AND user_id = ?',
      [campaignId, userId],
    );
    if (!check.length) return null;

    let query =
      'SELECT * FROM campaign_recipients WHERE campaign_id = ?';
    const params = [campaignId];
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY id ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async countByCampaign(campaignId, userId, { status } = {}) {
    const [check] = await pool.execute(
      'SELECT id FROM campaigns WHERE id = ? AND user_id = ?',
      [campaignId, userId],
    );
    if (!check.length) return null;

    let query = 'SELECT COUNT(*) AS total FROM campaign_recipients WHERE campaign_id = ?';
    const params = [campaignId];
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    const [rows] = await pool.execute(query, params);
    return Number(rows[0]?.total ?? 0);
  }
}

module.exports = CampaignRecipient;
