const express = require('express');
const router = express.Router();

const whatsapp = require('../services/whatsapp');

/**
 * POST /api/send
 * body:
 * {
 *   accountId: string,
 *   phoneNumbers: string[],
 *   message: string
 * }
 */
router.post('/', async (req, res) => {
  try {

    const { accountId, phoneNumbers, message } = req.body;
    const userId = req.userId;

    // ===== validation =====
    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'accountId is required'
      });
    }

    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumbers must be array'
      });
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    // ===== sending =====
    const results = [];

    for (const phone of phoneNumbers) {

      const result = await whatsapp.sendMessage(
        accountId.trim(),
        userId,
        phone.toString(),
        message.trim()
      );

      results.push({
        phone,
        result
      });
    }

    return res.json({
      success: true,
      total: phoneNumbers.length,
      results
    });

  } catch (err) {

    console.error('SEND ERROR:', err);

    return res.status(500).json({
      success: false,
      error: err.message || 'internal error'
    });
  }
});

module.exports = router;
