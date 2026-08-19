const pool = require('../config/database');



class Campaign {

  static async create(data) {

    const {

      userId,

      accountId,

      groupId,

      name,

      messageText,

      delayMs = 3000,

      totalRecipients = 0,

      templateId = null,

      status = 'running',

    } = data;

    const [result] = await pool.execute(

      `INSERT INTO campaigns

       (user_id, account_id, group_id, name, message_text, delay_ms, total_recipients, template_id, status)

       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [

        userId,

        accountId,

        groupId || null,

        name,

        messageText,

        delayMs,

        totalRecipients,

        templateId,

        status,

      ],

    );

    return result.insertId;

  }



  static async createScheduled(data) {

    const {

      userId,

      accountId,

      groupId,

      name,

      messageText,

      delayMs = 3000,

      totalRecipients = 0,

      templateId = null,

      scheduledAt,

    } = data;

    const [result] = await pool.execute(

      `INSERT INTO campaigns

       (user_id, account_id, group_id, name, message_text, delay_ms, total_recipients, template_id, scheduled_at, status)

       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,

      [

        userId,

        accountId,

        groupId || null,

        name,

        messageText,

        delayMs,

        totalRecipients,

        templateId,

        scheduledAt,

      ],

    );

    return result.insertId;

  }



  static async updateStatus(id, status) {

    await pool.execute('UPDATE campaigns SET status = ? WHERE id = ?', [status, id]);

  }



  static async findDueScheduled() {

    const [rows] = await pool.execute(

      `SELECT * FROM campaigns

       WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()

       ORDER BY scheduled_at ASC

       LIMIT 10`,

    );

    return rows;

  }



  static async complete(id, { successCount, failureCount, status = 'completed' }) {

    await pool.execute(

      `UPDATE campaigns SET

        status = ?, success_count = ?, failure_count = ?, completed_at = CURRENT_TIMESTAMP

       WHERE id = ?`,

      [status, successCount, failureCount, id],

    );

  }



  static async cancel(id, userId) {

    const [r] = await pool.execute(

      `UPDATE campaigns SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP

       WHERE id = ? AND user_id = ? AND status = 'scheduled'`,

      [id, userId],

    );

    return r.affectedRows > 0;

  }



  static async findAllByUserId(userId, { status, search, limit = 20, offset = 0 } = {}) {

    let query = `

      SELECT c.*, g.name AS group_name

      FROM campaigns c

      LEFT JOIN contact_groups g ON g.id = c.group_id

      WHERE c.user_id = ?`;

    const params = [userId];



    if (status) {

      query += ' AND c.status = ?';

      params.push(status);

    }

    if (search && String(search).trim()) {

      query += ' AND (c.name LIKE ? OR c.message_text LIKE ? OR g.name LIKE ?)';

      const q = `%${String(search).trim()}%`;

      params.push(q, q, q);

    }



    query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';

    params.push(limit, offset);



    const [rows] = await pool.execute(query, params);

    return rows;

  }



  static async countByUserId(userId, { status, search } = {}) {

    let query = `

      SELECT COUNT(*) AS total

      FROM campaigns c

      LEFT JOIN contact_groups g ON g.id = c.group_id

      WHERE c.user_id = ?`;

    const params = [userId];



    if (status) {

      query += ' AND c.status = ?';

      params.push(status);

    }

    if (search && String(search).trim()) {

      query += ' AND (c.name LIKE ? OR c.message_text LIKE ? OR g.name LIKE ?)';

      const q = `%${String(search).trim()}%`;

      params.push(q, q, q);

    }



    const [rows] = await pool.execute(query, params);

    return Number(rows[0]?.total ?? 0);

  }



  static async findById(id, userId) {

    const [rows] = await pool.execute(

      `SELECT c.*, g.name AS group_name

       FROM campaigns c

       LEFT JOIN contact_groups g ON g.id = c.group_id

       WHERE c.id = ? AND c.user_id = ?`,

      [id, userId],

    );

    return rows[0] || null;

  }

}



module.exports = Campaign;

