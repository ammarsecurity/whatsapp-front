-- v28: outbox queue + per-instance API keys (UltraMsg compatibility)

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
);

ALTER TABLE api_keys ADD COLUMN account_id VARCHAR(128) NULL;
