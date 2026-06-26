const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const requireAdmin = require('../middleware/requireAdmin');
const { API_BUILD } = require('../config/build');
const { getSystemHealth } = require('../config/systemHealth');

router.use(requireAdmin);

router.get('/system-health', async (req, res) => {
  try {
    const health = await getSystemHealth(whatsappService);
    res.json(health);
  } catch (err) {
    console.error('ADMIN SYSTEM HEALTH:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

function parseIds(req) {
  const userId = parseInt(req.params.userId, 10);
  const { accountId } = req.params;
  if (!Number.isFinite(userId) || !accountId) {
    return { error: 'Valid userId and accountId are required' };
  }
  return { userId, accountId };
}

router.get('/accounts', async (req, res) => {
  try {
    const accounts = await whatsappService.getAllAccountsAdmin();
    res.json({
      success: true,
      accounts,
      count: accounts.length,
      apiBuild: API_BUILD,
    });
  } catch (err) {
    console.error('ADMIN LIST ACCOUNTS:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/clear-stuck-sessions', async (req, res) => {
  try {
    const result = await whatsappService.clearAllStuckSessions();
    res.json({
      success: true,
      message:
        result.clearedCount > 0
          ? `Cleared ${result.clearedCount} stuck session(s) across all users.`
          : 'No stuck sessions found — ready accounts were not changed.',
      ...result,
    });
  } catch (err) {
    console.error('ADMIN CLEAR STUCK SESSIONS:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/accounts/:userId/:accountId/status', async (req, res) => {
  try {
    const ids = parseIds(req);
    if (ids.error) return res.status(400).json({ success: false, error: ids.error });

    const status = await whatsappService.getAccountStatus(ids.accountId, ids.userId);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/accounts/:userId/:accountId/disconnect', async (req, res) => {
  try {
    const ids = parseIds(req);
    if (ids.error) return res.status(400).json({ success: false, error: ids.error });

    const result = await whatsappService.disconnectAccount(ids.accountId, ids.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('ADMIN DISCONNECT:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/accounts/:userId/:accountId/reset-session', async (req, res) => {
  try {
    const ids = parseIds(req);
    if (ids.error) return res.status(400).json({ success: false, error: ids.error });

    await whatsappService.resetSession(ids.accountId, ids.userId);
    res.json({
      success: true,
      message: 'Session cleared. Call GET .../qr to fetch pairing QR.',
      accountId: ids.accountId,
      userId: ids.userId,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/accounts/:userId/:accountId/qr', async (req, res) => {
  try {
    const ids = parseIds(req);
    if (ids.error) return res.status(400).json({ success: false, error: ids.error });

    const regenerate =
      req.query.regenerate === '1' ||
      req.query.regenerate === 'true' ||
      req.query.force === '1';

    const result = await whatsappService.getQrForAccount(ids.accountId, ids.userId, {
      regenerate,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/accounts/:userId/:accountId', async (req, res) => {
  try {
    const ids = parseIds(req);
    if (ids.error) return res.status(400).json({ success: false, error: ids.error });

    await whatsappService.deleteAccount(ids.accountId, ids.userId);
    res.json({
      success: true,
      message: `Account "${ids.accountId}" deleted for user ${ids.userId}`,
    });
  } catch (err) {
    console.error('ADMIN DELETE ACCOUNT:', err);
    const status = err.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

module.exports = router;
