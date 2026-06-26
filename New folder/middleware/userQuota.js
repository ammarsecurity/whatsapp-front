const UserQuota = require('../models/UserQuota');

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
      const check = await UserQuota.checkMessageQuota(req.userId, Math.max(1, count));
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
    const check = await UserQuota.checkNumberQuota(req.userId, 1);
    if (!check.ok) {
      return res.status(429).json({ success: false, error: check.error, quota: check });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { messageQuotaMiddleware, checkNumberQuota };
