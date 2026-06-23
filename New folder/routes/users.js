const express = require('express');
const router = express.Router();
const User = require('../models/User');
const requireAdmin = require('../middleware/requireAdmin');
const { isAdminUser } = require('../middleware/requireAdmin');

router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const rows = await User.findAll();
    const users = rows.map((row) => {
      const u = { id: row.id, username: row.username };
      const admin = isAdminUser(u);
      return {
        userId: row.id,
        username: row.username,
        role: admin ? 'admin' : 'user',
        isAdmin: admin,
        createdAt: row.created_at,
      };
    });
    res.json({ success: true, users, count: users.length });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ success: false, error: 'username is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'password is required (min 6 characters)',
      });
    }

    if (await User.usernameExists(username.trim())) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }

    const user = await User.create(username.trim(), password);
    res.status(201).json({
      success: true,
      userId: user.id,
      username: user.username,
      message: 'User created',
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

router.delete('/:userId', async (req, res) => {
  try {
    const targetId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(targetId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }
    if (targetId === req.userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }

    const deleted = await User.deleteById(targetId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

module.exports = router;
