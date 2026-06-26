const express = require('express');
const router = express.Router();
const ApiKey = require('../models/ApiKey');
const Webhook = require('../models/Webhook');
const UserQuota = require('../models/UserQuota');

// --- API Keys ---

router.get('/api-keys', async (req, res) => {
  try {
    const keys = await ApiKey.findAllByUserId(req.userId);
    res.json({
      success: true,
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.key_prefix,
        lastUsedAt: k.last_used_at,
        expiresAt: k.expires_at,
        createdAt: k.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api-keys', async (req, res) => {
  try {
    const { name, expiresAt } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const created = await ApiKey.create(req.userId, name, expiresAt || null);
    res.status(201).json({
      success: true,
      key: {
        id: created.id,
        name: created.name,
        keyPrefix: created.prefix,
        /** Shown once — store securely */
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
