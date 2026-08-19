const pool = require('../config/database');

async function ensureV28Schema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_outbox (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      account_id VARCHAR(128) NOT NULL,
      phone VARCHAR(64) NOT NULL,
      kind ENUM('chat','image','document') NOT NULL DEFAULT 'chat',
      body TEXT NULL,
      media_url TEXT NULL,
      caption VARCHAR(1024) NULL,
      filename VARCHAR(255) NULL,
      status ENUM('queued','sending','sent','failed') NOT NULL DEFAULT 'queued',
      wa_message_id VARCHAR(255) NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      INDEX idx_outbox_pending (user_id, account_id, status),
      INDEX idx_outbox_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try {
    await pool.query('ALTER TABLE api_keys ADD COLUMN account_id VARCHAR(128) NULL');
  } catch (err) {
    const msg = err.message || '';
    if (!msg.includes('Duplicate column') && err.code !== 'ER_DUP_FIELDNAME') {
      console.warn('[schema] api_keys.account_id:', msg);
    }
  }
  try {
    await pool.query('ALTER TABLE api_keys ADD COLUMN token_plain TEXT NULL');
  } catch (err) {
    const msg = err.message || '';
    if (!msg.includes('Duplicate column') && err.code !== 'ER_DUP_FIELDNAME') {
      console.warn('[schema] api_keys.token_plain:', msg);
    }
  }
  try {
    await pool.query(
      "ALTER TABLE accounts ADD COLUMN note VARCHAR(160) NULL COMMENT 'Friendly label for the owner'",
    );
  } catch (err) {
    const msg = err.message || '';
    if (!msg.includes('Duplicate column') && err.code !== 'ER_DUP_FIELDNAME') {
      console.warn('[schema] accounts.note:', msg);
    }
  }
}

async function ensureBillingSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      billing_cycle ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
      price_iqd INT NOT NULL DEFAULT 0,
      description VARCHAR(500) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      plan_id INT NOT NULL,
      gateway VARCHAR(32) NOT NULL,
      reference_id VARCHAR(80) NOT NULL,
      amount_iqd INT NOT NULL,
      payment_status ENUM('Unpaid', 'Paid', 'Failed', 'Pending') NOT NULL DEFAULT 'Unpaid',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME NULL,
      UNIQUE KEY uq_billing_reference (reference_id),
      INDEX idx_billing_orders_user (user_id, payment_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_licenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      plan_id INT NULL,
      billing_order_id INT NULL,
      account_id VARCHAR(255) NULL,
      status ENUM('active', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
      starts_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_licenses_user_status (user_id, status, account_id),
      INDEX idx_licenses_account (user_id, account_id),
      INDEX idx_licenses_expires (status, expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_gateway_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider_name VARCHAR(50) NOT NULL,
      is_enabled TINYINT(1) NOT NULL DEFAULT 0,
      base_url VARCHAR(300) NOT NULL,
      environment VARCHAR(10) NOT NULL DEFAULT 'test',
      api_key_enc TEXT NULL,
      merchant_token_enc TEXT NULL,
      webhook_secret_enc TEXT NULL,
      redirect_url VARCHAR(500) NULL,
      webhook_url VARCHAR(500) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_gateway_provider (provider_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      billing_order_id INT NOT NULL,
      gateway VARCHAR(32) NOT NULL,
      reference_id VARCHAR(80) NOT NULL,
      external_id VARCHAR(160) NULL,
      amount_iqd INT NULL,
      status VARCHAR(40) NULL,
      raw_payload TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tx_order (billing_order_id),
      INDEX idx_tx_reference (reference_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    INSERT INTO payment_gateway_settings (provider_name, is_enabled, base_url, environment)
    SELECT 'Wayl', 0, 'https://api.thewayl.com', 'test'
    WHERE NOT EXISTS (SELECT 1 FROM payment_gateway_settings WHERE provider_name = 'Wayl')
  `);
  await pool.query(`
    INSERT INTO payment_gateway_settings (provider_name, is_enabled, base_url, environment)
    SELECT 'FynexPay', 0, 'https://api.fynexpay.net', 'test'
    WHERE NOT EXISTS (SELECT 1 FROM payment_gateway_settings WHERE provider_name = 'FynexPay')
  `);

  const utf8Tables = [
    'billing_plans',
    'billing_orders',
    'account_licenses',
    'payment_gateway_settings',
    'payment_transactions',
  ];
  for (const table of utf8Tables) {
    try {
      await pool.query(
        `ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    } catch (err) {
      console.warn(`[schema] utf8mb4 ${table}:`, err.message);
    }
  }

  const gatewayKeyCols = [
    'test_api_key_enc TEXT NULL',
    'test_merchant_token_enc TEXT NULL',
    'test_webhook_secret_enc TEXT NULL',
    'live_api_key_enc TEXT NULL',
    'live_merchant_token_enc TEXT NULL',
    'live_webhook_secret_enc TEXT NULL',
  ];
  for (const col of gatewayKeyCols) {
    try {
      await pool.query(`ALTER TABLE payment_gateway_settings ADD COLUMN ${col}`);
    } catch (err) {
      const msg = err.message || '';
      if (!msg.includes('Duplicate column') && err.code !== 'ER_DUP_FIELDNAME') {
        console.warn('[schema] payment_gateway_settings column:', msg);
      }
    }
  }
  try {
    await pool.query(`
      UPDATE payment_gateway_settings
      SET
        test_api_key_enc = COALESCE(test_api_key_enc, IF(environment = 'test', api_key_enc, NULL)),
        test_merchant_token_enc = COALESCE(test_merchant_token_enc, IF(environment = 'test', merchant_token_enc, NULL)),
        test_webhook_secret_enc = COALESCE(test_webhook_secret_enc, IF(environment = 'test', webhook_secret_enc, NULL)),
        live_api_key_enc = COALESCE(live_api_key_enc, IF(environment = 'live', api_key_enc, NULL)),
        live_merchant_token_enc = COALESCE(live_merchant_token_enc, IF(environment = 'live', merchant_token_enc, NULL)),
        live_webhook_secret_enc = COALESCE(live_webhook_secret_enc, IF(environment = 'live', webhook_secret_enc, NULL))
      WHERE api_key_enc IS NOT NULL
         OR merchant_token_enc IS NOT NULL
         OR webhook_secret_enc IS NOT NULL
    `);
  } catch (err) {
    console.warn('[schema] migrate gateway keys:', err.message);
  }

  const AccountLicense = require('../models/AccountLicense');
  try {
    const seeded = await AccountLicense.seedExistingAccounts(12);
    if (seeded > 0) {
      console.log(`[schema] grandfathered ${seeded} existing WhatsApp account license(s)`);
    }
  } catch (err) {
    console.warn('[schema] license seed:', err.message);
  }
}

module.exports = { ensureV28Schema, ensureBillingSchema };

