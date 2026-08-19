const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const verifyToken = require('../middleware/auth');
const { isAdminUser } = require('../middleware/requireAdmin');

function signToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '360d' },
  );
}

function userPayload(user) {
  return {
    id: user.id,
    userId: user.id,
    username: user.username,
    role: isAdminUser(user) ? 'admin' : 'user',
    isAdmin: isAdminUser(user),
  };
}

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security: []  # No authentication required
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: "admin"
 *                 description: Unique username
 *               password:
 *                 type: string
 *                 example: "password123"
 *                 description: User password (min 6 characters)
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User registered successfully"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *       400:
 *         description: Bad request - invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       409:
 *         description: Username already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 */
router.post('/register', async (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Public registration is disabled. Contact an administrator to create an account.',
  });
});

/**
 * Update own username and/or password (requires current password).
 */
router.patch('/profile', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { currentPassword, username, password } = req.body;

    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'currentPassword is required',
      });
    }

    const trimmedUsername =
      username != null && typeof username === 'string' ? username.trim() : '';
    const hasUsername = trimmedUsername.length > 0;
    const hasPassword =
      password != null && typeof password === 'string' && password.length > 0;

    if (!hasUsername && !hasPassword) {
      return res.status(400).json({
        success: false,
        error: 'Provide username and/or password to update',
      });
    }

    if (hasPassword && password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      });
    }

    const stored = await User.findByUsername(req.user.username);
    if (!stored) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const valid = await User.validatePassword(currentPassword, stored.password);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
      });
    }

    if (hasUsername && trimmedUsername !== req.user.username) {
      if (await User.usernameTakenByOther(trimmedUsername, userId)) {
        return res.status(409).json({
          success: false,
          error: 'Username already exists',
        });
      }
      await User.updateUsername(userId, trimmedUsername);
    }

    if (hasPassword) {
      await User.updatePassword(userId, password);
    }

    const updated = await User.findById(userId);
    const token = signToken({ id: updated.id, username: updated.username });

    res.json({
      success: true,
      message: 'Profile updated',
      token,
      user: userPayload(updated),
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     security: []  # No authentication required
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   description: JWT token to use for authenticated requests
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *       400:
 *         description: Bad request - missing credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Invalid username or password"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Find user
    const user = await User.findByUsername(username.trim());
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    // Validate password
    const isValidPassword = await User.validatePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    const token = signToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userPayload(user),
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

module.exports = router;

