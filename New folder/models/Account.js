const pool = require('../config/database');

class Account {
  /**
   * Create a new account record
   */
  static async create(accountId, userId) {
    const [result] = await pool.execute(
      'INSERT INTO accounts (account_id, user_id, is_ready, is_connected) VALUES (?, ?, ?, ?)',
      [accountId, userId, false, false]
    );
    return result.insertId;
  }

  /**
   * Update account status
   */
  static async updateStatus(accountId, userId, isReady, isConnected) {
    await pool.execute(
      'UPDATE accounts SET is_ready = ?, is_connected = ? WHERE account_id = ? AND user_id = ?',
      [isReady, isConnected, accountId, userId]
    );
  }

  /**
   * Get account by accountId and userId
   */
  static async findByAccountId(accountId, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM accounts WHERE account_id = ? AND user_id = ?',
      [accountId, userId]
    );
    return rows[0] || null;
  }

  /**
   * Get account by accountId (for backward compatibility - checks all users)
   */
  static async findByAccountIdAnyUser(accountId) {
    const [rows] = await pool.execute(
      'SELECT * FROM accounts WHERE account_id = ?',
      [accountId]
    );
    return rows[0] || null;
  }

  /**
   * Get all accounts for a specific user
   */
  static async findAllByUserId(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  /**
   * Get all accounts (for admin purposes)
   */
  static async findAll() {
    const [rows] = await pool.execute(
      'SELECT * FROM accounts ORDER BY created_at DESC'
    );
    return rows;
  }

  /** All accounts with owner username (admin dashboard). */
  static async findAllWithUsers() {
    const [rows] = await pool.execute(
      `SELECT a.*, u.username AS owner_username
       FROM accounts a
       INNER JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC`,
    );
    return rows;
  }

  /**
   * Delete account
   */
  static async delete(accountId, userId) {
    await pool.execute(
      'DELETE FROM accounts WHERE account_id = ? AND user_id = ?',
      [accountId, userId]
    );
  }

  /**
   * Check if account exists for user
   */
  static async exists(accountId, userId) {
    const account = await this.findByAccountId(accountId, userId);
    return !!account;
  }
}

module.exports = Account;

