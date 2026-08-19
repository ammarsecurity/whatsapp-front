const express = require('express');
const router = express.Router();
const MessageTemplate = require('../models/MessageTemplate');

function mapRow(t) {
  return {
    id: t.id,
    name: t.name,
    body: t.body,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

router.get('/', async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const [items, total] = await Promise.all([
      MessageTemplate.findAllByUserId(req.userId, { search, limit: lim, offset: off }),
      MessageTemplate.countByUserId(req.userId, { search }),
    ]);
    res.json({ success: true, templates: items.map(mapRow), total, limit: lim, offset: off });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, body } = req.body;
    if (!name?.trim() || !body?.trim()) {
      return res.status(400).json({ success: false, error: 'name and body are required' });
    }
    const id = await MessageTemplate.create(req.userId, { name, body });
    const t = await MessageTemplate.findById(id, req.userId);
    res.status(201).json({ success: true, template: mapRow(t) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const t = await MessageTemplate.findById(parseInt(req.params.id, 10), req.userId);
    if (!t) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, template: mapRow(t) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const t = await MessageTemplate.update(parseInt(req.params.id, 10), req.userId, req.body);
    if (!t) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, template: mapRow(t) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await MessageTemplate.delete(parseInt(req.params.id, 10), req.userId);
    if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
