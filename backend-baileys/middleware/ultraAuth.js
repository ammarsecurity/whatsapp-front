const ApiKey = require('../models/ApiKey');
const Account = require('../models/Account');

function pickToken(req) {
  return (
    req.query?.token ||
    req.body?.token ||
    req.headers['token'] ||
    (String(req.headers.authorization || '').startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : '') ||
    req.headers['x-api-key'] ||
    ''
  );
}

async function ultraAuth(req, res, next) {
  try {
    const instanceId = String(req.params.instance_id || '').trim();
    const token = String(pickToken(req) || '').trim();

    if (!instanceId) {
      return res.status(400).json({ error: 'instance_id is required' });
    }
    if (!token) {
      return res.status(401).json({ error: 'token is required' });
    }

    const keyRow = await ApiKey.validateKey(token);
    if (!keyRow) {
      return res.status(401).json({ error: 'invalid token' });
    }

    const boundAccount = keyRow.account_id ? String(keyRow.account_id).trim() : '';
    if (boundAccount && boundAccount !== instanceId) {
      return res.status(403).json({ error: 'token is not allowed for this instance' });
    }

    const exists = await Account.exists(instanceId, keyRow.user_id);
    if (!exists) {
      return res.status(404).json({ error: 'instance not found' });
    }

    req.userId = keyRow.user_id;
    req.accountId = instanceId;
    req.instanceId = instanceId;
    req.authMethod = 'ultra_token';
    next();
  } catch (err) {
    console.error('ultraAuth error:', err);
    res.status(500).json({ error: 'authentication error' });
  }
}

module.exports = { ultraAuth, pickToken };
