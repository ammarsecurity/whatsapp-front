const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  /**
   * Create a new user
   */
  static async create(username, password) {
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const [result] = await pool.execute(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword]
    );

    return {
      id: result.insertId,
      username,
      createdAt: new Date()
    };
  }

  /**
   * Find user by username
   */
  static async findByUsername(username) {
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return rows[0] || null;
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT id, username, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Validate password
   */
  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Check if username exists
   */
  static async usernameExists(username) {
    const user = await this.findByUsername(username);
    return !!user;
  }

  /**
   * Update password
   */
  static async updatePassword(userId, newPassword) {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await pool.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );
  }

  /**
   * Get all users (without passwords)
   */
  static async findAll() {
    const [rows] = await pool.execute(
      'SELECT id, username, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    return rows;
  }

  static async deleteById(id) {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = User;

