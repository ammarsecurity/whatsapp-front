const express = require('express');
const router = express.Router();
const wayl = require('../services/payments/wayl');
const fynexpay = require('../services/payments/fynexpay');
const billingService = require('../services/payments/billingService');

router.get('/methods', async (req, res) => {
  try {
    const methods = await billingService.listEnabledMethods();
    res.json({ success: true, methods });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const signature =
      req.headers['x-wayl-signature'] ||
      req.headers['x-signature'] ||
      req.headers['x-wayl-webhook-secret'];
    const raw = req.rawBody || JSON.stringify(req.body || {});
    await wayl.handleWebhook(raw, signature);
    res.json({ success: true });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/fynexpay/webhook', async (req, res) => {
  try {
    const signature =
      req.headers['x-fynexpay-signature'] ||
      req.headers['x-fynexpay-signature'] ||
      req.headers['x-signature'];
    const raw = req.rawBody || JSON.stringify(req.body || {});
    await fynexpay.handleWebhook(raw, signature);
    res.json({ success: true });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

module.exports = router;
