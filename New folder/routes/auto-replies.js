const express = require('express');
const router = express.Router();
const AutoReply = require('../models/AutoReply');

function mapRow(r) {
  return {
    id: r.id,
    accountId: r.account_id,
    keyword: r.keyword,
    matchType: r.match_type,
    replyText: r.reply_text,
    enabled: !!r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

router.get('/', async (req, res) => {
  try {
    const { accountId, limit = 50, offset = 0 } = req.query;
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const [items, total] = await Promise.all([
      AutoReply.findAllByUserId(req.userId, { accountId, limit: lim, offset: off }),
      AutoReply.countByUserId(req.userId),
    ]);
    res.json({ success: true, rules: items.map(mapRow), total, limit: lim, offset: off });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { accountId, keyword, matchType, replyText, enabled } = req.body;
    if (!replyText?.trim()) {
      return res.status(400).json({ success: false, error: 'replyText is required' });
    }
    const id = await AutoReply.create(req.userId, {
      accountId,
      keyword,
      matchType: matchType || 'contains',
      replyText,
      enabled: enabled !== false,
    });
    const row = await AutoReply.findById(id, req.userId);
    res.status(201).json({ success: true, rule: mapRow(row) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const row = await AutoReply.update(parseInt(req.params.id, 10), req.userId, {
      accountId: req.body.accountId,
      keyword: req.body.keyword,
      matchType: req.body.matchType,
      replyText: req.body.replyText,
      enabled: req.body.enabled,
    });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, rule: mapRow(row) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await AutoReply.delete(parseInt(req.params.id, 10), req.userId);
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
