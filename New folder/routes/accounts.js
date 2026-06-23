const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const { verifyToken } = require('../middleware/auth');

/**
 * @swagger
 * /api/accounts:
 *   post:
 *     summary: Create a new WhatsApp account
 *     tags: [Accounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountId
 *             properties:
 *               accountId:
 *                 type: string
 *                 example: "work"
 *                 description: Unique identifier for the account
 *     responses:
 *       200:
 *         description: Account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 accountId:
 *                   type: string
 *       400:
 *         description: Bad request - invalid input
 *       409:
 *         description: Account already exists
 *       500:
 *         description: Internal server error
 */
router.post('/', async (req, res) => {
  try {
    const { accountId } = req.body;
    const userId = req.userId;

    if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'accountId is required and must be a non-empty string'
      });
    }

    await whatsappService.createAccount(accountId.trim(), userId);

    res.json({
      success: true,
      message: `Account "${accountId}" created successfully`,
      accountId: accountId.trim()
    });
  } catch (error) {
    console.error('Error creating account:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});





/**
 * @swagger
 * /api/accounts:
 *   get:
 *     summary: Get all WhatsApp accounts
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all accounts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accounts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       accountId:
 *                         type: string
 *                         example: "work"
 *                       userId:
 *                         type: integer
 *                       isReady:
 *                         type: boolean
 *                       isConnected:
 *                         type: boolean
 *                       hasQrCode:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: integer
 *                   example: 2
 *       500:
 *         description: Internal server error
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.userId;
    const accounts = await whatsappService.getAllAccounts(userId);
    res.json({
      success: true,
      accounts,
      count: accounts.length
    });
  } catch (error) {
    console.error('Error getting accounts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/accounts/{accountId}/status:
 *   get:
 *     summary: Get status of a specific account
 *     tags: [Accounts]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Account identifier
 *     responses:
 *       200:
 *         description: Account status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accountId:
 *                   type: string
 *                 connected:
 *                   type: boolean
 *                 ready:
 *                   type: boolean
 *                 qrCode:
 *                   type: string
 *                   nullable: true
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 */
router.get('/:accountId/status',async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.userId;
    
    // التحقق من وجود userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found. Please login again.'
      });
    }
    
    // التحقق من وجود accountId
    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Account ID is required'
      });
    }

    const status = await whatsappService.getAccountStatus(accountId, userId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: `Account with ID "${accountId}" not found for this user`
      });
    }

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting account status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});


router.get('/:accountId/qr', async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.userId;
    const regenerate =
      req.query.regenerate === '1' ||
      req.query.regenerate === 'true' ||
      req.query.force === '1';

    const result = await whatsappService.getQrForAccount(accountId, userId, {
      regenerate,
    });

    res.json(result);
  } catch (err) {
    console.error('QR ERROR:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:accountId/reset-session', async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.userId;

    await whatsappService.resetSession(accountId, userId);

    res.json({
      success: true,
      message:
        'Session cleared. Call GET /api/accounts/:id/qr to fetch the new pairing QR.',
      accountId,
    });
  } catch (err) {
    console.error('RESET SESSION ERROR:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});



/**
 * @swagger
 * /api/accounts/{accountId}:
 *   delete:
 *     summary: Delete a WhatsApp account
 *     tags: [Accounts]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Account identifier
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.userId;
    
    // التحقق من وجود userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found. Please login again.'
      });
    }
    
    // التحقق من وجود accountId
    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Account ID is required'
      });
    }
    
    await whatsappService.deleteAccount(accountId, userId);

    res.json({
      success: true,
      message: `Account "${accountId}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

module.exports = router;

