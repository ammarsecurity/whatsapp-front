const pool = require('../config/database');

class Message {
  /**
   * Create a new message record
   */
  static async create(data) {
    const { 
      accountId, 
      userId, 
      phoneNumber, 
      messageText, 
      messageId, 
      status, 
      errorMessage,
      messageType = 'text',
      mediaFileName = null,
      mediaMimeType = null
    } = data;
    
    const [result] = await pool.execute(
      `INSERT INTO messages 
       (account_id, user_id, phone_number, message_type, message_text, message_id, status, error_message, media_file_name, media_mime_type, sent_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        userId,
        phoneNumber,
        messageType,
        messageText,
        messageId || null,
        status || 'pending',
        errorMessage || null,
        mediaFileName || null,
        mediaMimeType || null,
        status === 'sent' ? new Date() : null
      ]
    );
    return result.insertId;
  }

  /**
   * Update message status
   */
  static async updateStatus(messageId, status, errorMessage = null) {
    await pool.execute(
      'UPDATE messages SET status = ?, error_message = ?, sent_at = ? WHERE id = ?',
      [status, errorMessage, status === 'sent' ? new Date() : null, messageId]
    );
  }

  /**
   * Get message by ID and userId (for security)
   */
  static async findById(id, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM messages WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return rows[0] || null;
  }

  /**
   * Get messages by accountId and userId
   */
  static async findByAccountId(accountId, userId, limit = 100, offset = 0) {
    const [rows] = await pool.execute(
      `SELECT * FROM messages 
       WHERE account_id = ? AND user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [accountId, userId, limit, offset]
    );
    return rows;
  }

  /**
   * Get messages by phone number and userId
   */
  static async findByPhoneNumber(phoneNumber, userId, limit = 100, offset = 0) {
    const [rows] = await pool.execute(
      `SELECT * FROM messages 
       WHERE phone_number = ? AND user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [phoneNumber, userId, limit, offset]
    );
    return rows;
  }

  static _buildFilterQuery(filters = {}) {
    const { userId, accountId, phoneNumber, search, status } = filters;
    if (!userId) throw new Error('userId is required');

    let query = ' FROM messages WHERE user_id = ?';
    const params = [userId];

    if (accountId) {
      query += ' AND account_id = ?';
      params.push(accountId);
    }

    if (phoneNumber) {
      query += ' AND phone_number = ?';
      params.push(phoneNumber);
    } else if (search) {
      const digits = String(search).replace(/\D/g, '');
      if (digits) {
        query += ' AND phone_number LIKE ?';
        params.push(`%${digits}%`);
      }
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    return { query, params };
  }

  static async countAll(filters = {}) {
    const { query, params } = this._buildFilterQuery(filters);
    const [rows] = await pool.execute(`SELECT COUNT(*) AS total ${query}`, params);
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Get all messages with filters (requires userId)
   */
  static async findAll(filters = {}) {
    const { limit = 100, offset = 0 } = filters;
    const { query, params } = this._buildFilterQuery(filters);

    const [rows] = await pool.execute(
      `SELECT * ${query} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return rows;
  }

  /**
   * Get message statistics (requires userId)
   */
  static async getStatistics(userId, accountId = null) {
    let query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM messages
      WHERE user_id = ?
    `;
    const params = [userId];

    if (accountId) {
      query += ' AND account_id = ?';
      params.push(accountId);
    }

    const [rows] = await pool.execute(query, params);
    return rows[0];
  }
}

module.exports = Message;

