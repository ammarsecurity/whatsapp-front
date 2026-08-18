const UserQuota = require('../models/UserQuota');
const { withTimeout } = require('../utils/withTimeout');

function messageQuotaMiddleware(countFromBody = 1) {
  return async (req, res, next) => {
    try {
      let count = countFromBody;
      if (typeof countFromBody === 'function') {
        count = countFromBody(req);
      } else if (req.body?.phoneNumbers?.length) {
        count = req.body.phoneNumbers.length;
      } else if (req.body?.groupId) {
        count = 1;
      }
      let check = { ok: true };
      try {
        check = await withTimeout(
          UserQuota.checkMessageQuota(req.userId, Math.max(1, count)),
          3_000,
          'Message quota check',
        );
      } catch (quotaErr) {
        console.warn('Message quota check skipped:', quotaErr.message);
      }
      if (!check.ok) {
        return res.status(429).json({ success: false, error: check.error, quota: check });
      }
      req._quotaMessageCount = count;
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function checkNumberQuota(req, res, next) {
  try {
    let check = { ok: true };
    try {
      check = await withTimeout(
        UserQuota.checkNumberQuota(req.userId, 1),
        3_000,
        'Check-number quota',
      );
    } catch (quotaErr) {
      console.warn('Check-number quota skipped:', quotaErr.message);
    }
    if (!check.ok) {
      return res.status(429).json({ success: false, error: check.error, quota: check });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { messageQuotaMiddleware, checkNumberQuota };
