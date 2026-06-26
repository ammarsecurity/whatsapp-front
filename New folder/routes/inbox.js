const express = require('express');
const router = express.Router();
const InboxMessage = require('../models/InboxMessage');
const whatsappService = require('../services/whatsapp');
const { AccountNotReadyError } = require('../utils/accountLifecycle');
const { respondNotReady } = require('../middleware/accountReady');

router.get('/', async (req, res) => {
  try {
    const { accountId, search, unreadOnly, limit = 30, offset = 0 } = req.query;
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const opts = { accountId, search, unreadOnly, limit: lim, offset: off };
    const [items, total, unread] = await Promise.all([
      InboxMessage.findAllByUserId(req.userId, opts),
      InboxMessage.countByUserId(req.userId, opts),
      InboxMessage.unreadCount(req.userId, accountId || null),
    ]);
    res.json({
      success: true,
      messages: items.map(mapMsg),
      total,
      unread,
      limit: lim,
      offset: off,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const count = await InboxMessage.unreadCount(
      req.userId,
      req.query.accountId || null,
    );
    res.json({ success: true, unread: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/conversation/:accountId/:phone', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const rows = await InboxMessage.getConversation(
      req.userId,
      req.params.accountId,
      decodeURIComponent(req.params.phone),
      { limit: parseInt(limit, 10) || 50, offset: parseInt(offset, 10) || 0 },
    );
    res.json({ success: true, messages: rows.map(mapMsg) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/read', async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    const n = await InboxMessage.markRead(req.userId, ids);
    res.json({ success: true, marked: n });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/reply', async (req, res) => {
  try {
    const { accountId, phoneNumber, message } = req.body;
    if (!accountId || !phoneNumber || !message?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'accountId, phoneNumber, message required',
      });
    }
    await whatsappService.ensureAccountReady(String(accountId).trim(), req.userId);
    const results = await whatsappService.sendMessages(
      String(accountId).trim(),
      req.userId,
      [phoneNumber],
      String(message).trim(),
    );
    const r = results[0];
    if (r?.success) {
      await InboxMessage.create({
        userId: req.userId,
        accountId: String(accountId).trim(),
        phoneNumber,
        body: String(message).trim(),
        direction: 'out',
      });
    }
    res.json({ success: !!r?.success, result: r });
  } catch (err) {
    if (err instanceof AccountNotReadyError) return respondNotReady(res, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

function mapMsg(m) {
  return {
    id: m.id,
    accountId: m.account_id,
    phoneNumber: m.phone_number,
    contactName: m.contact_name,
    body: m.body,
    direction: m.direction,
    isRead: !!m.is_read,
    createdAt: m.created_at,
  };
}

module.exports = router;
