const whatsappService = require('../services/whatsapp');
const { AccountNotReadyError } = require('../utils/accountLifecycle');

function accountIdFromRequest(req) {
  const raw = req.body?.accountId ?? req.query?.accountId;
  if (raw == null || raw === '') return null;
  return String(raw).trim();
}

function respondNotReady(res, err) {
  return res.status(503).json({
    success: false,
    error: 'WhatsApp account is not ready',
    status: err.status,
    accountId: err.accountId,
  });
}

/** Express middleware — requires body/query accountId */
async function requireAccountReady(req, res, next) {
  try {
    const accountId = accountIdFromRequest(req);
    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'accountId is required',
      });
    }
    await whatsappService.ensureAccountReady(accountId, req.userId);
    next();
  } catch (err) {
    if (err instanceof AccountNotReadyError) {
      return respondNotReady(res, err);
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
}

module.exports = { requireAccountReady, respondNotReady, accountIdFromRequest };
