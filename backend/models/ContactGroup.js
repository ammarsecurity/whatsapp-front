const pool = require('../config/database');

class ContactGroup {
  static async create(userId, name, description = null) {
    const [result] = await pool.execute(
      'INSERT INTO contact_groups (user_id, name, description) VALUES (?, ?, ?)',
      [userId, name.trim(), description || null],
    );
    return { id: result.insertId, userId, name: name.trim(), description };
  }

  static async findAllByUserId(userId, { search, limit = 50, offset = 0 } = {}) {
    let query = `
      SELECT g.*,
        (SELECT COUNT(*) FROM contact_group_numbers n WHERE n.group_id = g.id) AS number_count
      FROM contact_groups g
      WHERE g.user_id = ?`;
    const params = [userId];

    if (search && String(search).trim()) {
      query += ' AND (g.name LIKE ? OR g.description LIKE ?)';
      const q = `%${String(search).trim()}%`;
      params.push(q, q);
    }

    query += ' ORDER BY g.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async countByUserId(userId, { search } = {}) {
    let query = 'SELECT COUNT(*) AS total FROM contact_groups WHERE user_id = ?';
    const params = [userId];
    if (search && String(search).trim()) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      const q = `%${String(search).trim()}%`;
      params.push(q, q);
    }
    const [rows] = await pool.execute(query, params);
    return Number(rows[0]?.total ?? 0);
  }

  static async findById(id, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM contact_groups WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return rows[0] || null;
  }

  static async update(id, userId, { name, description }) {
    const group = await this.findById(id, userId);
    if (!group) return null;
    await pool.execute(
      'UPDATE contact_groups SET name = ?, description = ? WHERE id = ? AND user_id = ?',
      [
        name != null ? String(name).trim() : group.name,
        description !== undefined ? description : group.description,
        id,
        userId,
      ],
    );
    return this.findById(id, userId);
  }

  static async delete(id, userId) {
    const [result] = await pool.execute(
      'DELETE FROM contact_groups WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return result.affectedRows > 0;
  }

  static async getNumbers(groupId, userId, { search, limit = 50, offset = 0 } = {}) {
    const group = await this.findById(groupId, userId);
    if (!group) return null;

    let query =
      'SELECT id, phone_number, label, created_at FROM contact_group_numbers WHERE group_id = ?';
    const params = [groupId];

    if (search && String(search).trim()) {
      const digits = String(search).replace(/\D/g, '');
      if (digits) {
        query += ' AND phone_number LIKE ?';
        params.push(`%${digits}%`);
      }
    }

    query += ' ORDER BY id LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async countNumbers(groupId, userId, { search } = {}) {
    const group = await this.findById(groupId, userId);
    if (!group) return null;

    let query = 'SELECT COUNT(*) AS total FROM contact_group_numbers WHERE group_id = ?';
    const params = [groupId];

    if (search && String(search).trim()) {
      const digits = String(search).replace(/\D/g, '');
      if (digits) {
        query += ' AND phone_number LIKE ?';
        params.push(`%${digits}%`);
      }
    }

    const [rows] = await pool.execute(query, params);
    return Number(rows[0]?.total ?? 0);
  }

  static normalizePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return digits;
  }

  static async addNumbers(groupId, userId, numbers, replace = false) {
    const group = await this.findById(groupId, userId);
    if (!group) return null;

    if (replace) {
      await pool.execute('DELETE FROM contact_group_numbers WHERE group_id = ?', [groupId]);
    }

    const unique = new Set();
    for (const item of numbers) {
      const raw = typeof item === 'string' ? item : item?.phone || item?.phoneNumber || '';
      const phone = this.normalizePhone(raw);
      if (phone) unique.add(phone);
    }

    let added = 0;
    for (const phone of unique) {
      try {
        const [r] = await pool.execute(
          'INSERT IGNORE INTO contact_group_numbers (group_id, phone_number) VALUES (?, ?)',
          [groupId, phone],
        );
        if (r.affectedRows > 0) added += 1;
      } catch {
        /* skip duplicates */
      }
    }

    await pool.execute(
      'UPDATE contact_groups SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [groupId],
    );

    const total = await this.countNumbers(groupId, userId, {});
    const page = await this.getNumbers(groupId, userId, { limit: 1, offset: 0 });
    return { added, total, numbers: page };
  }

  static async removeNumber(groupId, userId, numberId) {
    const group = await this.findById(groupId, userId);
    if (!group) return false;
    const [result] = await pool.execute(
      'DELETE FROM contact_group_numbers WHERE id = ? AND group_id = ?',
      [numberId, groupId],
    );
    return result.affectedRows > 0;
  }
}

module.exports = ContactGroup;
