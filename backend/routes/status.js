const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const { verifyToken } = require('../middleware/auth');
const { API_BUILD } = require('../config/build');
const { getChromeDiagnostics } = require('../config/chrome');

/**
 * @swagger
 * /api/status:
 *   get:
 *     summary: Get WhatsApp connection status
 *     tags: [Status]
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: string
 *         description: Optional account identifier. If not provided, returns status of all accounts or first account.
 *     responses:
 *       200:
 *         description: Connection status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 connected:
 *                   type: boolean
 *                 ready:
 *                   type: boolean
 *                 qrCode:
 *                   type: string
 *                   nullable: true
 *                 accountsCount:
 *                   type: number
 *                 accounts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       accountId:
 *                         type: string
 *                       userId:
 *                         type: integer
 *                       isReady:
 *                         type: boolean
 *                       isConnected:
 *                         type: boolean
 *       404:
 *         description: Account not found (when accountId is provided)
 *       500:
 *         description: Internal server error
 */
router.get('/status', async (req, res) => {
  try {
    const { accountId } = req.query;
    const userId = req.userId;
    
    // التحقق من وجود userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found. Please login again.'
      });
    }

    // If accountId is provided, return status for that specific account
    if (accountId) {
      const status = await whatsappService.getAccountStatus(accountId, userId);
      if (!status) {
        return res.status(404).json({
          success: false,
          error: `Account with ID "${accountId}" not found for this user`
        });
      }
      return res.json({
        success: true,
        ...status
      });
    }

    // Otherwise, return all accounts for the user
    const allAccounts = await whatsappService.getAllAccounts(userId);
    
    res.json({
      success: true,
      accounts: allAccounts,
      count: allAccounts.length
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/qr:
 *   get:
 *     summary: Get QR code for WhatsApp authentication
 *     tags: [Status]
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: string
 *         description: Optional account identifier. If not provided, returns QR code of first account.
 *     responses:
 *       200:
 *         description: QR code retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accountId:
 *                   type: string
 *                 qrCode:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *                 connected:
 *                   type: boolean
 *       404:
 *         description: QR code not available or account not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal server error
 */
router.get('/qr', async (req, res) => {
  try {
    const { accountId } = req.query;
    const userId = req.userId;
    
    // التحقق من وجود userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found. Please login again.'
      });
    }

    if (!accountId) {
      return res.status(400).json({ success: false, error: 'accountId query parameter is required' });
    }

    const qrCode = whatsappService.getAccountQrCode(accountId, userId);
    
    if (!qrCode) {
      const status = await whatsappService.getAccountStatus(accountId, userId);
      if (!status) {
        return res.status(404).json({
          success: false,
          error: `Account with ID "${accountId}" not found for this user`
        });
      }
      if (status.ready) {
        return res.json({
          success: true,
          message: `WhatsApp account "${accountId}" is already connected. No QR code needed.`,
          connected: true
        });
      }
      return res.status(404).json({
        success: false,
        error: `QR code not available for account "${accountId}". Please wait for QR code generation.`
      });
    }

    res.json({
      success: true,
      qrCode: qrCode,
      message: `Scan this QR code with your WhatsApp to connect account "${accountId}"`
    });
  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});


// System readiness + Chrome diagnostics (Ubuntu)
router.get('/system', async (req, res) => {
    try {
        const chrome = await getChromeDiagnostics();
        res.json({
            ready: global.systemReady === true,
            apiBuild: API_BUILD,
            chrome,
        });
    } catch (err) {
        res.status(500).json({
            ready: global.systemReady === true,
            apiBuild: API_BUILD,
            error: err.message || 'Failed to read Chrome diagnostics',
        });
    }
});

module.exports = router;
