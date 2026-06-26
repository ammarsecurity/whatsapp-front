const express = require('express');
const router = express.Router();
const OptOut = require('../models/OptOut');

router.get('/', async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const [items, total] = await Promise.all([
      OptOut.findAllByUserId(req.userId, { search, limit: lim, offset: off }),
      OptOut.countByUserId(req.userId, { search }),
    ]);
    res.json({
      success: true,
      optOuts: items.map((r) => ({
        id: r.id,
        phoneNumber: r.phone_number,
        reason: r.reason,
        source: r.source,
        createdAt: r.created_at,
      })),
      total,
      limit: lim,
      offset: off,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { phoneNumber, reason } = req.body;
    const phone = await OptOut.add(req.userId, phoneNumber, {
      reason: reason || 'Manual',
      source: 'manual',
    });
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }
    res.status(201).json({ success: true, phoneNumber: phone });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:phone', async (req, res) => {
  try {
    const ok = await OptOut.remove(req.userId, decodeURIComponent(req.params.phone));
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
