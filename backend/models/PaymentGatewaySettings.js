const pool = require('../config/database');
const { protect, unprotect } = require('../services/payments/secretProtector');

function normalizeEnv(environment) {
  return environment === 'live' ? 'live' : 'test';
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    providerName: row.provider_name,
    isEnabled: !!row.is_enabled,
    baseUrl: row.base_url,
    environment: normalizeEnv(row.environment),
    testApiKeyEnc: row.test_api_key_enc,
    testMerchantTokenEnc: row.test_merchant_token_enc,
    testWebhookSecretEnc: row.test_webhook_secret_enc,
    liveApiKeyEnc: row.live_api_key_enc,
    liveMerchantTokenEnc: row.live_merchant_token_enc,
    liveWebhookSecretEnc: row.live_webhook_secret_enc,
    apiKeyEnc: row.api_key_enc,
    merchantTokenEnc: row.merchant_token_enc,
    webhookSecretEnc: row.webhook_secret_enc,
    redirectUrl: row.redirect_url || '',
    webhookUrl: row.webhook_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function encForEnv(row, env, field) {
  const e = normalizeEnv(env);
  const map = {
    test: {
      apiKey: row.testApiKeyEnc,
      merchantToken: row.testMerchantTokenEnc,
      webhookSecret: row.testWebhookSecretEnc,
    },
    live: {
      apiKey: row.liveApiKeyEnc,
      merchantToken: row.liveMerchantTokenEnc,
      webhookSecret: row.liveWebhookSecretEnc,
    },
  };
  const val = map[e][field];
  if (val) return val;
  if (normalizeEnv(row.environment) === e) {
    const legacy = {
      apiKey: row.apiKeyEnc,
      merchantToken: row.merchantTokenEnc,
      webhookSecret: row.webhookSecretEnc,
    }[field];
    return legacy || null;
  }
  return null;
}

class PaymentGatewaySettings {
  static async getOrCreate(providerName, defaults = {}) {
    const name = providerName === 'FynexPay' ? 'FynexPay' : 'Wayl';
    const [rows] = await pool.execute(
      'SELECT * FROM payment_gateway_settings WHERE provider_name = ?',
      [name],
    );
    if (rows[0]) return mapRow(rows[0]);
    const baseUrl = defaults.baseUrl
      || (name === 'FynexPay' ? 'https://api.fynexpay.net' : 'https://api.thewayl.com');
    await pool.execute(
      `INSERT INTO payment_gateway_settings (provider_name, is_enabled, base_url, environment)
       VALUES (?, 0, ?, 'test')`,
      [name, baseUrl],
    );
    const [created] = await pool.execute(
      'SELECT * FROM payment_gateway_settings WHERE provider_name = ?',
      [name],
    );
    return mapRow(created[0]);
  }

  static secrets(row, environment) {
    const env = normalizeEnv(environment || row?.environment);
    return {
      apiKey: unprotect(encForEnv(row, env, 'apiKey')),
      merchantToken: unprotect(encForEnv(row, env, 'merchantToken')),
      webhookSecret: unprotect(encForEnv(row, env, 'webhookSecret')),
    };
  }

  static hasSecrets(row, environment) {
    const s = this.secrets(row, environment);
    return {
      hasApiKey: !!s.apiKey,
      hasMerchantToken: !!s.merchantToken,
      hasWebhookSecret: !!s.webhookSecret,
    };
  }

  static isReady(row) {
    if (!row?.isEnabled) return false;
    const s = this.secrets(row);
    const needsMerchant = row.providerName === 'FynexPay';
    if (needsMerchant) {
      return !!(s.apiKey && s.merchantToken && s.webhookSecret);
    }
    return !!(s.apiKey && s.webhookSecret);
  }

  static async update(providerName, payload) {
    const current = await this.getOrCreate(providerName);
    const name = current.providerName;
    const isEnabled = payload.isEnabled != null ? (payload.isEnabled ? 1 : 0) : (current.isEnabled ? 1 : 0);
    const baseUrl = payload.baseUrl != null && String(payload.baseUrl).trim()
      ? String(payload.baseUrl).trim()
      : current.baseUrl;
    const environment = payload.environment != null
      ? normalizeEnv(payload.environment)
      : current.environment;
    const redirectUrl = payload.redirectUrl != null ? String(payload.redirectUrl).trim() : current.redirectUrl;
    const webhookUrl = payload.webhookUrl != null ? String(payload.webhookUrl).trim() : current.webhookUrl;

    const keysEnv = payload.keysEnvironment != null
      ? normalizeEnv(payload.keysEnvironment)
      : null;

    let testApiKeyEnc = current.testApiKeyEnc;
    let testMerchantTokenEnc = current.testMerchantTokenEnc;
    let testWebhookSecretEnc = current.testWebhookSecretEnc;
    let liveApiKeyEnc = current.liveApiKeyEnc;
    let liveMerchantTokenEnc = current.liveMerchantTokenEnc;
    let liveWebhookSecretEnc = current.liveWebhookSecretEnc;

    const applyKey = (env, field, plain) => {
      if (plain === undefined || plain === null) return;
      if (!String(plain).trim()) return;
      const enc = protect(String(plain).trim());
      if (env === 'live') {
        if (field === 'apiKey') liveApiKeyEnc = enc;
        if (field === 'merchantToken') liveMerchantTokenEnc = enc;
        if (field === 'webhookSecret') liveWebhookSecretEnc = enc;
      } else {
        if (field === 'apiKey') testApiKeyEnc = enc;
        if (field === 'merchantToken') testMerchantTokenEnc = enc;
        if (field === 'webhookSecret') testWebhookSecretEnc = enc;
      }
    };

    if (keysEnv) {
      applyKey(keysEnv, 'apiKey', payload.apiKey);
      applyKey(keysEnv, 'merchantToken', payload.merchantToken);
      applyKey(keysEnv, 'webhookSecret', payload.webhookSecret);
    } else if (payload.apiKey !== undefined || payload.merchantToken !== undefined || payload.webhookSecret !== undefined) {
      applyKey(environment, 'apiKey', payload.apiKey);
      applyKey(environment, 'merchantToken', payload.merchantToken);
      applyKey(environment, 'webhookSecret', payload.webhookSecret);
    }

    await pool.execute(
      `UPDATE payment_gateway_settings
       SET is_enabled = ?, base_url = ?, environment = ?,
           test_api_key_enc = ?, test_merchant_token_enc = ?, test_webhook_secret_enc = ?,
           live_api_key_enc = ?, live_merchant_token_enc = ?, live_webhook_secret_enc = ?,
           redirect_url = ?, webhook_url = ?
       WHERE provider_name = ?`,
      [
        isEnabled, baseUrl, environment,
        testApiKeyEnc, testMerchantTokenEnc, testWebhookSecretEnc,
        liveApiKeyEnc, liveMerchantTokenEnc, liveWebhookSecretEnc,
        redirectUrl, webhookUrl, name,
      ],
    );
    return this.getOrCreate(name);
  }
}

module.exports = PaymentGatewaySettings;
module.exports.normalizeEnv = normalizeEnv;
