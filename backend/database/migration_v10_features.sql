-- v10: templates, scheduling, opt-out, failure reports, inbox, auto-replies, API keys, webhooks, quotas
-- Run once on existing DB after migration_contact_groups.sql

CREATE TABLE IF NOT EXISTS message_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mt_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opt_out_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR(32) NOT NULL,
  reason VARCHAR(255) NULL,
  source VARCHAR(64) DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_opt_out (user_id, phone_number),
  INDEX idx_opt_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  phone_number VARCHAR(32) NOT NULL,
  status ENUM('sent', 'failed', 'skipped_opt_out') NOT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cr_campaign (campaign_id),
  INDEX idx_cr_status (status),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE campaigns ADD COLUMN scheduled_at DATETIME NULL;
ALTER TABLE campaigns ADD COLUMN template_id INT NULL;
-- If columns already exist, skip the two lines above.

ALTER TABLE campaigns
  MODIFY status ENUM('pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS inbox_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  phone_number VARCHAR(32) NOT NULL,
  contact_name VARCHAR(255) NULL,
  body TEXT NOT NULL,
  direction ENUM('in', 'out') NOT NULL DEFAULT 'in',
  wa_message_id VARCHAR(255) NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inbox_user (user_id),
  INDEX idx_inbox_account (user_id, account_id),
  INDEX idx_inbox_phone (phone_number),
  INDEX idx_inbox_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auto_replies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  account_id VARCHAR(255) NULL COMMENT 'NULL = all accounts',
  keyword VARCHAR(255) NULL COMMENT 'NULL with match_type=any = catch-all',
  match_type ENUM('exact', 'contains', 'any') DEFAULT 'contains',
  reply_text TEXT NOT NULL,
  enabled TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ar_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  last_used_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ak_user (user_id),
  INDEX idx_ak_prefix (key_prefix),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhooks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  url VARCHAR(2048) NOT NULL,
  events JSON NOT NULL,
  secret VARCHAR(64) NULL,
  enabled TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wh_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_quotas (
  user_id INT PRIMARY KEY,
  daily_message_limit INT DEFAULT 1000,
  daily_check_limit INT DEFAULT 500,
  messages_sent_today INT DEFAULT 0,
  checks_today INT DEFAULT 0,
  quota_reset_date DATE NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
