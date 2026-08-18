const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const BillingPlan = require('../models/BillingPlan');
const PaymentTransaction = require('../models/PaymentTransaction');
const PaymentGatewaySettings = require('../models/PaymentGatewaySettings');
const wayl = require('../services/payments/wayl');
const fynexpay = require('../services/payments/fynexpay');
const billingService = require('../services/payments/billingService');

router.use(requireAdmin);

function envSecretsDto(row, env) {
  const s = PaymentGatewaySettings.secrets(row, env);
  return {
    hasApiKey: !!s.apiKey,
    hasMerchantToken: !!s.merchantToken,
    hasWebhookSecret: !!s.webhookSecret,
    apiKey: s.apiKey || '',
    merchantToken: s.merchantToken || '',
    webhookSecret: s.webhookSecret || '',
  };
}

function gatewayDto(row, extras) {
  const active = PaymentGatewaySettings.secrets(row);
  const test = envSecretsDto(row, 'test');
  const live = envSecretsDto(row, 'live');
  return {
    isEnabled: !!row.isEnabled,
    baseUrl: row.baseUrl,
    environment: row.environment,
    hasApiKey: !!active.apiKey,
    hasMerchantToken: !!active.merchantToken,
    hasWebhookSecret: !!active.webhookSecret,
    apiKey: active.apiKey || '',
    merchantToken: active.merchantToken || '',
    webhookSecret: active.webhookSecret || '',
    test,
    live,
    redirectUrl: row.redirectUrl || '',
    webhookUrl: row.webhookUrl || '',
    updatedAt: row.updatedAt,
    readyForCheckout: PaymentGatewaySettings.isReady(row),
    ...extras,
  };
}

function validateGatewayEnable(row, body, needsMerchant) {
  const env = PaymentGatewaySettings.normalizeEnv(body.environment || row.environment);
  const saved = PaymentGatewaySettings.secrets(row, env);
  const willHaveKey = !!(body.apiKey || saved.apiKey);
  const willHaveMerchant = !needsMerchant || !!(body.merchantToken || saved.merchantToken);
  const willHaveSecret = !!(body.webhookSecret || saved.webhookSecret);
  return { ok: willHaveKey && willHaveMerchant && willHaveSecret, env };
}

router.get('/billing/plans', async (req, res) => {
  try {
    const plans = await BillingPlan.findAll();
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/billing/plans', async (req, res) => {
  try {
    const plan = await BillingPlan.create(req.body || {});
    res.status(201).json({ success: true, plan });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/billing/plans/:id', async (req, res) => {
  try {
    const plan = await BillingPlan.update(parseInt(req.params.id, 10), req.body || {});
    if (!plan) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, plan });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/billing/plans/:id', async (req, res) => {
  try {
    const ok = await BillingPlan.delete(parseInt(req.params.id, 10));
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'لا يمكن حذف الخطة لأنها مستخدمة في طلبات دفع.',
    });
  }
});

router.get('/payment-gateways/wayl', async (req, res) => {
  try {
    const settings = await wayl.getSettings();
    const urls = await billingService.publicUrls();
    res.json({
      success: true,
      settings: gatewayDto(settings, {
        suggestedWebhookUrl: urls.wayl.suggestedWebhookUrl,
        suggestedRedirectUrl: urls.wayl.suggestedRedirectUrl,
        readyForCheckout: urls.wayl.readyForCheckout,
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/payment-gateways/wayl', async (req, res) => {
  try {
    const body = req.body || {};
    if (body.isEnabled) {
      const current = await wayl.getSettings();
      const check = validateGatewayEnable(current, body, false);
      if (!check.ok) {
        return res.status(400).json({
          success: false,
          error: `Wayl (${check.env}) يحتاج مفتاح API وسر الويب هوك قبل التفعيل.`,
        });
      }
    }
    const settings = await PaymentGatewaySettings.update('Wayl', body);
    const urls = await billingService.publicUrls();
    res.json({
      success: true,
      settings: gatewayDto(settings, {
        suggestedWebhookUrl: urls.wayl.suggestedWebhookUrl,
        suggestedRedirectUrl: urls.wayl.suggestedRedirectUrl,
        readyForCheckout: urls.wayl.readyForCheckout,
      }),
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/payment-gateways/wayl/test-connection', async (req, res) => {
  try {
    const current = await wayl.getSettings();
    const env = PaymentGatewaySettings.normalizeEnv(req.body?.keysEnvironment || req.body?.environment || current.environment);
    const saved = PaymentGatewaySettings.secrets(current, env);
    const apiKey = req.body?.apiKey || saved.apiKey;
    const ok = await wayl.testConnection(apiKey, req.body?.baseUrl || current.baseUrl);
    res.json({ success: true, ok });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, ok: false });
  }
});

router.get('/payment-gateways/fynexpay', async (req, res) => {
  try {
    const settings = await fynexpay.getSettings();
    const urls = await billingService.publicUrls();
    res.json({
      success: true,
      settings: gatewayDto(settings, {
        suggestedWebhookUrl: urls.fynexpay.suggestedWebhookUrl,
        suggestedRedirectUrl: urls.fynexpay.suggestedRedirectUrl,
        readyForCheckout: urls.fynexpay.readyForCheckout,
        webhookUrl: urls.fynexpay.suggestedWebhookUrl,
        redirectUrl: urls.fynexpay.suggestedRedirectUrl,
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/payment-gateways/fynexpay', async (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    const urls = await billingService.publicUrls();
    // FynexPay rejects API subdomains — always persist frontend-domain redirect/webhook URLs.
    body.redirectUrl = urls.fynexpay.suggestedRedirectUrl;
    body.webhookUrl = urls.fynexpay.suggestedWebhookUrl;
    if (body.isEnabled) {
      const current = await fynexpay.getSettings();
      const check = validateGatewayEnable(current, body, true);
      if (!check.ok) {
        return res.status(400).json({
          success: false,
          error: `FynexPay (${check.env}) يحتاج مفتاح المنصة وتوكن التاجر وسر الويب هوك قبل التفعيل.`,
        });
      }
    }
    const settings = await PaymentGatewaySettings.update('FynexPay', body);
    const urlsAfter = await billingService.publicUrls();
    res.json({
      success: true,
      settings: gatewayDto(settings, {
        suggestedWebhookUrl: urlsAfter.fynexpay.suggestedWebhookUrl,
        suggestedRedirectUrl: urlsAfter.fynexpay.suggestedRedirectUrl,
        readyForCheckout: urlsAfter.fynexpay.readyForCheckout,
        webhookUrl: urlsAfter.fynexpay.suggestedWebhookUrl,
        redirectUrl: urlsAfter.fynexpay.suggestedRedirectUrl,
      }),
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/payment-gateways/fynexpay/test-connection', async (req, res) => {
  try {
    const current = await fynexpay.getSettings();
    const env = PaymentGatewaySettings.normalizeEnv(req.body?.keysEnvironment || req.body?.environment || current.environment);
    const saved = PaymentGatewaySettings.secrets(current, env);
    const ok = await fynexpay.testConnection(
      req.body?.apiKey || saved.apiKey,
      req.body?.merchantToken || saved.merchantToken,
      req.body?.baseUrl || current.baseUrl,
    );
    res.json({ success: true, ok });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, ok: false });
  }
});

router.get('/payment-transactions', async (req, res) => {
  try {
    const items = await PaymentTransaction.findAll({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, transactions: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
