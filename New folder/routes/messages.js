const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const whatsappService = require('../services/whatsapp');
const UserQuota = require('../models/UserQuota');
const { resolveMessage } = require('../utils/resolveMessage');
const { AccountNotReadyError } = require('../utils/accountLifecycle');
const { respondNotReady } = require('../middleware/accountReady');
const { withRouteTimeout } = require('../utils/routeTimeout');
const { withTimeout } = require('../utils/withTimeout');

const ROUTE_TIMEOUT_MS = 55_000;

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function handleRouteError(res, error) {
  if (error instanceof AccountNotReadyError) {
    return respondNotReady(res, error);
  }
  if (error.message?.includes('timed out')) {
    return res.status(504).json({
      success: false,
      error: error.message,
      hint: 'WhatsApp may be stuck. Use Accounts → Clear stuck sessions, then link with QR again.',
    });
  }
  if (error.message?.includes('not found')) {
    return res.status(404).json({ success: false, error: error.message });
  }
  console.error('Message route error:', error);
  return res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
}

router.post('/send', async (req, res) => {
  try {
    await withRouteTimeout(ROUTE_TIMEOUT_MS, async () => {
      const { accountId, phoneNumbers, message, templateId, templateName, templateVars } = req.body;
      const userId = req.userId;
      const trimmedId = String(accountId || '').trim();

      if (!trimmedId) {
        res.status(400).json({
          success: false,
          error: 'accountId is required and must be a non-empty string'
        });
        return;
      }

      if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
        res.status(400).json({
          success: false,
          error: 'phoneNumbers is required and must be a non-empty array'
        });
        return;
      }

      let resolvedMessage;
      try {
        resolvedMessage = await resolveMessage(userId, {
          message,
          templateId,
          templateName,
          templateVars,
        });
      } catch (resolveErr) {
        const code = resolveErr.status || 400;
        res.status(code).json({ success: false, error: resolveErr.message });
        return;
      }

      let quota = { ok: true };
      try {
        quota = await withTimeout(
          UserQuota.checkMessageQuota(userId, phoneNumbers.length),
          3_000,
          'Quota check',
        );
      } catch (quotaErr) {
        console.warn('Quota check skipped:', quotaErr.message);
      }
      if (!quota.ok) {
        res.status(429).json({ success: false, error: quota.error, quota });
        return;
      }

      const results = await whatsappService.sendMessages(
        trimmedId,
        userId,
        phoneNumbers,
        resolvedMessage,
      );

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      if (successCount > 0) {
        UserQuota.incrementMessages(userId, successCount).catch((err) => {
          console.warn('incrementMessages failed:', err.message);
        });
      }

      res.json({
        success: true,
        accountId: trimmedId,
        total: phoneNumbers.length,
        successCount,
        failureCount,
        message: resolvedMessage,
        results
      });
    });
  } catch (error) {
    return handleRouteError(res, error);
  }
});

router.post('/check-number', async (req, res) => {
  try {
    await withRouteTimeout(ROUTE_TIMEOUT_MS, async () => {
      const { accountId, phoneNumber } = req.body;
      const userId = req.userId;
      const trimmedId = String(accountId || '').trim();

      if (!trimmedId || !phoneNumber) {
        res.status(400).json({ success: false, error: 'Missing data' });
        return;
      }

      const { exists } = await whatsappService.checkPhoneNumber(
        trimmedId,
        userId,
        phoneNumber,
      );

      res.json({
        success: true,
        exists,
      });

      UserQuota.incrementChecks(userId, 1).catch((err) => {
        console.warn('incrementChecks failed:', err.message);
      });
    });
  } catch (error) {
    return handleRouteError(res, error);
  }
});

router.post('/send-media', upload.single('file'), async (req, res) => {
  let uploadedFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'File is required. Please upload a file.'
      });
    }

    uploadedFilePath = req.file.path;
    const { accountId, phoneNumbers, mediaType = 'document', caption = '' } = req.body;
    const userId = req.userId;
    const trimmedId = String(accountId || '').trim();

    const cleanup = () => {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
    };

    if (!trimmedId) {
      cleanup();
      return res.status(400).json({
        success: false,
        error: 'accountId is required and must be a non-empty string'
      });
    }

    if (!phoneNumbers || typeof phoneNumbers !== 'string') {
      cleanup();
      return res.status(400).json({
        success: false,
        error: 'phoneNumbers is required and must be a JSON array string'
      });
    }

    let phoneNumbersArray;
    try {
      phoneNumbersArray = JSON.parse(phoneNumbers);
    } catch {
      cleanup();
      return res.status(400).json({
        success: false,
        error: 'phoneNumbers must be a valid JSON array. Example: ["1234567890@c.us"]'
      });
    }

    if (!Array.isArray(phoneNumbersArray) || phoneNumbersArray.length === 0) {
      cleanup();
      return res.status(400).json({
        success: false,
        error: 'phoneNumbers must be a non-empty array'
      });
    }

    const validMediaTypes = ['image', 'document', 'audio', 'video'];
    const finalMediaType = validMediaTypes.includes(mediaType) ? mediaType : 'document';

    const results = await whatsappService.sendMediaMessages(
      trimmedId,
      userId,
      phoneNumbersArray,
      uploadedFilePath,
      finalMediaType,
      caption || ''
    );

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    cleanup();

    res.json({
      success: true,
      accountId: trimmedId,
      total: phoneNumbersArray.length,
      successCount,
      failureCount,
      mediaType: finalMediaType,
      fileName: req.file.originalname,
      results
    });
  } catch (error) {
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    return handleRouteError(res, error);
  }
});

module.exports = router;
