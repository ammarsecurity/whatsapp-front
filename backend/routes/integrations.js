const express = require('express');
const router = express.Router();
const ApiKey = require('../models/ApiKey');
const Account = require('../models/Account');
const Webhook = require('../models/Webhook');
const UserQuota = require('../models/UserQuota');

function mapKey(k, accountId = null) {
  return {
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    accountId: k.account_id || accountId || null,
    token: k.token_plain || k.key || null,
    lastUsedAt: k.last_used_at || null,
    expiresAt: k.expires_at || null,
    createdAt: k.created_at || null,
  };
}

// --- API Keys ---

router.get('/api-keys', async (req, res) => {
  try {
    const accounts = await Account.findAllByUserId(req.userId);
    const keys = [];
    for (const acc of accounts) {
      try {
        const k = await ApiKey.ensureForAccount(req.userId, acc.account_id);
        if (k) keys.push(mapKey(k, acc.account_id));
      } catch (keyErr) {
        console.warn('ensure api key failed for', acc.account_id, keyErr.message);
      }
    }
    res.json({ success: true, keys });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api-keys', async (req, res) => {
  try {
    const { name, expiresAt, accountId } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const created = await ApiKey.create(req.userId, name, expiresAt || null, accountId || null);
    res.status(201).json({
      success: true,
      key: {
        id: created.id,
        name: created.name,
        keyPrefix: created.prefix,
        accountId: created.accountId,
        /** Shown once — store securely (UltraMsg token) */
        secret: created.key,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api-keys/:id', async (req, res) => {
  try {
    const ok = await ApiKey.delete(parseInt(req.params.id, 10), req.userId);
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Webhooks ---

router.get('/webhooks', async (req, res) => {
  try {
    const hooks = await Webhook.findAllByUserId(req.userId);
    res.json({
      success: true,
      webhooks: hooks.map((h) => ({
        id: h.id,
        url: h.url,
        events: h.events,
        enabled: !!h.enabled,
        hasSecret: !!h.secret,
        createdAt: h.created_at,
      })),
      validEvents: Webhook.getValidEvents(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/webhooks', async (req, res) => {
  try {
    const { url, events, secret, enabled } = req.body;
    if (!url?.trim()) {
      return res.status(400).json({ success: false, error: 'url is required' });
    }
    const ev = Array.isArray(events) ? events : [];
    const invalid = ev.filter((e) => !Webhook.getValidEvents().includes(e));
    if (invalid.length) {
      return res.status(400).json({
        success: false,
        error: `Invalid events: ${invalid.join(', ')}`,
        validEvents: Webhook.getValidEvents(),
      });
    }
    const id = await Webhook.create(req.userId, {
      url,
      events: ev,
      secret: secret || null,
      enabled: enabled !== false,
    });
    const hook = await Webhook.findById(id, req.userId);
    res.status(201).json({
      success: true,
      webhook: {
        id: hook.id,
        url: hook.url,
        events: hook.events,
        enabled: !!hook.enabled,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/webhooks/:id', async (req, res) => {
  try {
    const hook = await Webhook.update(parseInt(req.params.id, 10), req.userId, req.body);
    if (!hook) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({
      success: true,
      webhook: {
        id: hook.id,
        url: hook.url,
        events: hook.events,
        enabled: !!hook.enabled,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/webhooks/:id', async (req, res) => {
  try {
    const ok = await Webhook.delete(parseInt(req.params.id, 10), req.userId);
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Rate limits / quotas ---

router.get('/quota', async (req, res) => {
  try {
    const q = await UserQuota.get(req.userId);
    res.json({
      success: true,
      quota: {
        dailyMessageLimit: q.daily_message_limit,
        dailyCheckLimit: q.daily_check_limit,
        messagesSentToday: q.messages_sent_today,
        checksToday: q.checks_today,
        quotaResetDate: q.quota_reset_date,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/quota', async (req, res) => {
  try {
    const q = await UserQuota.updateLimits(req.userId, {
      dailyMessageLimit: req.body.dailyMessageLimit,
      dailyCheckLimit: req.body.dailyCheckLimit,
    });
    res.json({
      success: true,
      quota: {
        dailyMessageLimit: q.daily_message_limit,
        dailyCheckLimit: q.daily_check_limit,
        messagesSentToday: q.messages_sent_today,
        checksToday: q.checks_today,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
