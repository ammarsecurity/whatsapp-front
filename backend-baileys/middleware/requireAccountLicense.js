const AccountLicense = require('../models/AccountLicense');
const { isAdminUser } = require('./requireAdmin');

async function requireUnusedLicense(req, res, next) {
  try {
    if (isAdminUser(req.user)) {
      req.unusedLicense = null;
      req.billingAdminBypass = true;
      return next();
    }
    await AccountLicense.expireDue();
    const license = await AccountLicense.findUnusedActive(req.userId);
    if (!license) {
      return res.status(403).json({
        success: false,
        error: 'SUBSCRIPTION_REQUIRED',
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'ادفع خطة شهرية أو سنوية قبل إضافة حساب واتساب.',
      });
    }
    req.unusedLicense = license;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireLicenseForAccount(req, res, next) {
  try {
    if (isAdminUser(req.user)) return next();
    const accountId = req.params.accountId || req.body?.accountId;
    if (!accountId) return next();
    await AccountLicense.expireDue();
    const license = await AccountLicense.findActiveForAccount(req.userId, accountId);
    if (!license) {
      return res.status(403).json({
        success: false,
        error: 'SUBSCRIPTION_EXPIRED',
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'انتهى اشتراك هذا الحساب. جدّد الخطة من صفحة الاشتراك.',
      });
    }
    req.accountLicense = license;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireUnusedLicense, requireLicenseForAccount };
