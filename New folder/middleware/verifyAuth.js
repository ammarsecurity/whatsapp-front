const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiKey = require('../models/ApiKey');

/**
 * Accept JWT (Authorization: Bearer) or API key (X-API-Key)
 */
async function verifyAuth(req, res, next) {
  try {
    // Safety: never auth-check health (if mounted before explicit route)
    if (req.path === '/health' || req.originalUrl === '/api/health') {
      return next();
    }

    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader) {
      const row = await ApiKey.validateKey(String(apiKeyHeader).trim());
      if (!row) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
      }
      const user = await User.findById(row.user_id);
      if (!user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }
      req.user = user;
      req.userId = row.user_id;
      req.authMethod = 'api_key';
      return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'No token provided. Use Authorization: Bearer <jwt> or X-API-Key',
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    );
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    req.user = user;
    req.userId = decoded.userId;
    req.authMethod = 'jwt';
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
}

module.exports = verifyAuth;
