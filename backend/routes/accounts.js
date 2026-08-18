const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const ApiKey = require('../models/ApiKey');
const AccountModel = require('../models/Account');
const { verifyToken } = require('../middleware/auth');
const { requireUnusedLicense, requireLicenseForAccount } = require('../middleware/requireAccountLicense');
const AccountLicense = require('../models/AccountLicense');

async function allocateAccountId() {
  for (let i = 0; i < 10; i++) {
    const accountId = `wa_${crypto.randomBytes(6).toString('hex')}`;
    const taken = await AccountModel.findByAccountIdAnyUser(accountId);
    if (!taken) return accountId;
  }
  throw new Error('Could not allocate a unique account id');
}

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
router.post('/', requireUnusedLicense, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found. Please login again.',
      });
    }

    const accountId = await allocateAccountId();
    await whatsappService.createAccount(accountId, userId);

    if (req.unusedLicense) {
      try {
        await AccountLicense.linkAccount(req.unusedLicense.id, accountId);
      } catch (licErr) {
        console.warn('License link after account create failed:', licErr.message);
      }
    }

    const note = String(req.body?.note || '').trim().slice(0, 160);
    if (note) {
      try {
        await AccountModel.updateNote(accountId, userId, note);
      } catch (noteErr) {
        console.warn('Account note save after create failed:', noteErr.message);
      }
    }

    let token = null;
    let keyPrefix = null;
    try {
      const created = await ApiKey.create(userId, accountId, null, accountId);
      token = created.key;
      keyPrefix = created.prefix;
    } catch (keyErr) {
      console.error('API key create after account failed:', keyErr);
    }

    res.json({
      success: true,
      message: `Account "${accountId}" created successfully`,
      accountId,
      note: note || '',
      token,
      keyPrefix,
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
    let keys = [];
    try {
      keys = await ApiKey.findAllByUserId(userId);
    } catch (keyErr) {
      console.warn('List account tokens failed:', keyErr.message);
    }
    const withTokens = accounts.map((acc) => {
      const hit = keys.find((k) => ApiKey.matchAccount(k, acc.accountId));
      return {
        ...acc,
        note: acc.note || '',
        token: hit?.token_plain || null,
      };
    });
    res.json({
      success: true,
      accounts: withTokens,
      count: withTokens.length
    });
  } catch (error) {
    console.error('Error getting accounts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

router.post('/clear-stuck-sessions', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found. Please login again.',
      });
    }

    const result = await whatsappService.clearStuckSessions(userId);

    res.json({
      success: true,
      message:
        result.clearedCount > 0
          ? `Cleared ${result.clearedCount} stuck session(s). Link again with QR when needed.`
          : 'No stuck sessions found — ready accounts were not changed.',
      ...result,
    });
  } catch (err) {
    console.error('CLEAR STUCK SESSIONS ERROR:', err);
    res.status(500).json({ success: false, error: err.message });
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


router.get('/:accountId/qr', requireLicenseForAccount, async (req, res) => {
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

router.post('/:accountId/disconnect', async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found. Please login again.',
      });
    }

    const result = await whatsappService.disconnectAccount(accountId, userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('DISCONNECT ERROR:', err);
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID not found. Please login again.' });
    }
    if (req.body.note === undefined) {
      return res.status(400).json({ success: false, error: 'note is required' });
    }
    const exists = await AccountModel.findByAccountId(accountId, userId);
    if (!exists) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    const note = await AccountModel.updateNote(accountId, userId, req.body.note);
    res.json({ success: true, accountId, note: note || '' });
  } catch (err) {
    console.error('Update account note failed:', err);
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

