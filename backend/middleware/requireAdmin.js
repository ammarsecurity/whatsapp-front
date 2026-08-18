/**
 * Admin-only gate. Configure via ADMIN_USER_IDS (default "1") or ADMIN_USERNAMES (default "admin").
 */
function isAdminUser(user) {
  if (!user) return false;

  const adminIds = String(process.env.ADMIN_USER_IDS || '1')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter(Number.isFinite);

  const adminNames = String(process.env.ADMIN_USERNAMES || 'admin')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return (
    adminIds.includes(user.id) ||
    adminNames.includes(String(user.username || '').toLowerCase())
  );
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

module.exports = requireAdmin;
module.exports.isAdminUser = isAdminUser;
