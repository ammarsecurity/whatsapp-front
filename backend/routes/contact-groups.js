const express = require('express');
const router = express.Router();
const ContactGroup = require('../models/ContactGroup');

router.get('/', async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const opts = { search, limit: lim, offset: off };

    const [groups, total] = await Promise.all([
      ContactGroup.findAllByUserId(req.userId, opts),
      ContactGroup.countByUserId(req.userId, { search }),
    ]);

    res.json({
      success: true,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        numberCount: g.number_count,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      })),
      total,
      limit: lim,
      offset: off,
    });
  } catch (err) {
    console.error('List contact groups:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, numbers } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const group = await ContactGroup.create(req.userId, name, description);
    let importResult = null;
    if (Array.isArray(numbers) && numbers.length > 0) {
      importResult = await ContactGroup.addNumbers(group.id, req.userId, numbers, false);
    }
    res.status(201).json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        numberCount: importResult?.total ?? 0,
      },
      import: importResult,
    });
  } catch (err) {
    console.error('Create contact group:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:groupId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const { search, limit = 50, offset = 0 } = req.query;
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const off = Math.max(0, parseInt(offset, 10) || 0);

    const group = await ContactGroup.findById(groupId, req.userId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const numOpts = { search, limit: lim, offset: off };
    const [numbers, totalNumbers] = await Promise.all([
      ContactGroup.getNumbers(groupId, req.userId, numOpts),
      ContactGroup.countNumbers(groupId, req.userId, { search }),
    ]);

    res.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        createdAt: group.created_at,
        updatedAt: group.updated_at,
      },
      numbers: numbers.map((n) => ({
        id: n.id,
        phoneNumber: n.phone_number,
        label: n.label,
        createdAt: n.created_at,
      })),
      total: totalNumbers,
      limit: lim,
      offset: off,
    });
  } catch (err) {
    console.error('Get contact group:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:groupId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const updated = await ContactGroup.update(groupId, req.userId, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    res.json({
      success: true,
      group: { id: updated.id, name: updated.name, description: updated.description },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:groupId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const ok = await ContactGroup.delete(groupId, req.userId);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:groupId/numbers', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const { numbers, replace } = req.body;
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ success: false, error: 'numbers array is required' });
    }
    const result = await ContactGroup.addNumbers(
      groupId,
      req.userId,
      numbers,
      replace === true,
    );
    if (!result) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:groupId/numbers/:numberId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const numberId = parseInt(req.params.numberId, 10);
    const ok = await ContactGroup.removeNumber(groupId, req.userId, numberId);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Number not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
