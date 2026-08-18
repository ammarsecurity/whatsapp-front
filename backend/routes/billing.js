const express = require('express');
const router = express.Router();
const BillingPlan = require('../models/BillingPlan');
const BillingOrder = require('../models/BillingOrder');
const AccountLicense = require('../models/AccountLicense');
const billingService = require('../services/payments/billingService');
const { isAdminUser } = require('../middleware/requireAdmin');

router.get('/plans', async (req, res) => {
  try {
    const plans = await BillingPlan.findAll({ activeOnly: true });
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/methods', async (req, res) => {
  try {
    const methods = await billingService.listEnabledMethods();
    res.json({ success: true, methods });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/eligibility', async (req, res) => {
  try {
    const data = await billingService.eligibility(req.userId, isAdminUser(req.user));
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/licenses', async (req, res) => {
  try {
    await AccountLicense.expireDue();
    const licenses = await AccountLicense.findAllByUserId(req.userId);
    res.json({ success: true, licenses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const orders = await BillingOrder.findByUserId(req.userId);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/checkout', async (req, res) => {
  try {
    const result = await billingService.checkout({
      userId: req.userId,
      planId: req.body.planId,
      gateway: req.body.gateway,
    });
    res.json({
      success: true,
      paymentUrl: result.paymentUrl,
      referenceId: result.referenceId,
      orderId: result.order.id,
      amountIqd: result.order.amountIqd,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code,
    });
  }
});

router.post('/reconcile/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const result = await billingService.reconcile(orderId, req.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

module.exports = router;
