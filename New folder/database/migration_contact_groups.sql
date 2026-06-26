-- Contact groups & campaigns (run once on existing DB)

CREATE TABLE IF NOT EXISTS contact_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cg_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_group_numbers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  phone_number VARCHAR(32) NOT NULL,
  label VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_group_phone (group_id, phone_number),
  INDEX idx_cgn_group (group_id),
  FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  group_id INT NULL,
  name VARCHAR(255) NOT NULL,
  message_text TEXT NOT NULL,
  delay_ms INT DEFAULT 3000,
  status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
  total_recipients INT DEFAULT 0,
  success_count INT DEFAULT 0,
  failure_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_campaign_user (user_id),
  INDEX idx_campaign_group (group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
