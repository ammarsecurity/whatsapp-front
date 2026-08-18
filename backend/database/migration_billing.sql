-- Billing: plans, orders, licenses, payment gateways, transactions

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  INDEX idx_billing_orders_user (user_id, payment_status),
  CONSTRAINT fk_billing_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_orders_plan FOREIGN KEY (plan_id) REFERENCES billing_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  INDEX idx_licenses_expires (status, expires_at),
  CONSTRAINT fk_licenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_licenses_plan FOREIGN KEY (plan_id) REFERENCES billing_plans(id) ON DELETE SET NULL,
  CONSTRAINT fk_licenses_order FOREIGN KEY (billing_order_id) REFERENCES billing_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  INDEX idx_tx_reference (reference_id),
  CONSTRAINT fk_tx_order FOREIGN KEY (billing_order_id) REFERENCES billing_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO payment_gateway_settings (provider_name, is_enabled, base_url, environment)
SELECT 'Wayl', 0, 'https://api.thewayl.com', 'test'
WHERE NOT EXISTS (SELECT 1 FROM payment_gateway_settings WHERE provider_name = 'Wayl');

INSERT INTO payment_gateway_settings (provider_name, is_enabled, base_url, environment)
SELECT 'FynexPay', 0, 'https://api.fynexpay.net', 'test'
WHERE NOT EXISTS (SELECT 1 FROM payment_gateway_settings WHERE provider_name = 'FynexPay');

-- Per-environment payment gateway secrets (test + live)

ALTER TABLE payment_gateway_settings ADD COLUMN test_api_key_enc TEXT NULL;
ALTER TABLE payment_gateway_settings ADD COLUMN test_merchant_token_enc TEXT NULL;
ALTER TABLE payment_gateway_settings ADD COLUMN test_webhook_secret_enc TEXT NULL;
ALTER TABLE payment_gateway_settings ADD COLUMN live_api_key_enc TEXT NULL;
ALTER TABLE payment_gateway_settings ADD COLUMN live_merchant_token_enc TEXT NULL;
ALTER TABLE payment_gateway_settings ADD COLUMN live_webhook_secret_enc TEXT NULL;

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
   OR webhook_secret_enc IS NOT NULL;
