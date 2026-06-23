const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const whatsappService = require('../services/whatsapp');
const { verifyToken } = require('../middleware/auth');


// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types
    cb(null, true);
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}


router.post('/send', async (req, res) => {
  try {
    const { accountId, phoneNumbers, message } = req.body;
    const userId = req.userId;

    // Validation
    if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'accountId is required and must be a non-empty string'
      });
    }

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumbers is required and must be a non-empty array'
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'message is required and must be a non-empty string'
      });
    }

    // Check if account exists for this user (in memory or database)
    const account = whatsappService.getAccount(accountId.trim(), userId);
    if (!account) {
      // Check database if not in memory
      const AccountModel = require('../models/Account');
      const dbAccount = await AccountModel.findByAccountId(accountId.trim(), userId);
      if (!dbAccount) {
        return res.status(404).json({
          success: false,
          error: `Account with ID "${accountId}" not found. Please create the account first.`
        });
      }
      
      // Account exists in database but not connected - check if it's ready
      if (!dbAccount.is_ready) {
        return res.status(400).json({
          success: false,
          error: `Account "${accountId}" is not connected. Please connect the account by scanning the QR code first.`
        });
      }
    } else {
      // Account is in memory - check if it's ready
      if (!account.isReady) {
        return res.status(400).json({
          success: false,
          error: `Account "${accountId}" is not ready. Please wait for connection.`
        });
      }
    }

    // Send messages
    const results = await whatsappService.sendMessages(accountId.trim(), userId, phoneNumbers, message.trim());

    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      accountId: accountId.trim(),
      total: phoneNumbers.length,
      successCount,
      failureCount,
      results
    });
  } catch (error) {
    console.error('Error sending messages:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});



router.post('/check-number', async (req, res) => {
  try {
    const { accountId, phoneNumber } = req.body;
    const userId = req.userId;

    if (!accountId || !phoneNumber)
      return res.status(400).json({ success: false, error: 'Missing data' });

    // جيب الحساب من الذاكرة
    const account = whatsappService.getAccount(accountId.trim(), userId);

    if (!account || !account.client)
      return res.status(404).json({
        success: false,
        error: 'Account not connected'
      });

    if (!account.isReady)
      return res.status(400).json({
        success: false,
        error: 'WhatsApp not ready yet'
      });

    // 🔥 الفحص الحقيقي بدون HTTP
    const numberId = await account.client.getNumberId(phoneNumber);

    return res.json({
      success: true,
      exists: !!numberId
    });

  } catch (error) {
    console.error('check-number error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});


router.post('/send-media', upload.single('file'), async (req, res) => {
  let uploadedFilePath = null;
  
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'File is required. Please upload a file.'
      });
    }

    uploadedFilePath = req.file.path;
    const { accountId, phoneNumbers, mediaType = 'document', caption = '' } = req.body;
    const userId = req.userId;

    // Validation
    if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) {
      // Clean up uploaded file
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({
        success: false,
        error: 'accountId is required and must be a non-empty string'
      });
    }

    if (!phoneNumbers || typeof phoneNumbers !== 'string') {
      // Clean up uploaded file
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({
        success: false,
        error: 'phoneNumbers is required and must be a JSON array string'
      });
    }

    // Parse phoneNumbers JSON string
    let phoneNumbersArray;
    try {
      phoneNumbersArray = JSON.parse(phoneNumbers);
    } catch (parseError) {
      // Clean up uploaded file
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({
        success: false,
        error: 'phoneNumbers must be a valid JSON array. Example: ["1234567890@c.us"]'
      });
    }

    if (!Array.isArray(phoneNumbersArray) || phoneNumbersArray.length === 0) {
      // Clean up uploaded file
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({
        success: false,
        error: 'phoneNumbers must be a non-empty array'
      });
    }

    // Validate mediaType
    const validMediaTypes = ['image', 'document', 'audio', 'video'];
    const finalMediaType = validMediaTypes.includes(mediaType) ? mediaType : 'document';

    // Check if account exists for this user (in memory or database)
    const account = whatsappService.getAccount(accountId.trim(), userId);
    if (!account) {
      // Check database if not in memory
      const AccountModel = require('../models/Account');
      const dbAccount = await AccountModel.findByAccountId(accountId.trim(), userId);
      if (!dbAccount) {
        // Clean up uploaded file
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
        }
        return res.status(404).json({
          success: false,
          error: `Account with ID "${accountId}" not found. Please create the account first.`
        });
      }
      
      // Account exists in database but not connected - check if it's ready
      if (!dbAccount.is_ready) {
        // Clean up uploaded file
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
        }
        return res.status(400).json({
          success: false,
          error: `Account "${accountId}" is not connected. Please connect the account by scanning the QR code first.`
        });
      }
    } else {
      // Account is in memory - check if it's ready
      if (!account.isReady) {
        // Clean up uploaded file
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
        }
        return res.status(400).json({
          success: false,
          error: `Account "${accountId}" is not ready. Please wait for connection.`
        });
      }
    }

    // Send media messages
    const results = await whatsappService.sendMediaMessages(
      accountId.trim(),
      userId,
      phoneNumbersArray,
      uploadedFilePath,
      finalMediaType,
      caption || ''
    );

    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    // Clean up uploaded file after sending
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }

    res.json({
      success: true,
      accountId: accountId.trim(),
      total: phoneNumbersArray.length,
      successCount,
      failureCount,
      mediaType: finalMediaType,
      fileName: req.file.originalname,
      results
    });
  } catch (error) {
    console.error('Error sending media messages:', error);
    
    // Clean up uploaded file on error
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

module.exports = router;

