-- ============================================
-- WhatsApp Sender API Database Schema
-- ============================================
-- 
-- Create database (run this manually if database doesn't exist)
-- CREATE DATABASE IF NOT EXISTS whatsapp_sender CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE whatsapp_sender;

-- ============================================
-- Users Table
-- Stores user authentication information
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL COMMENT 'Unique username for login',
  password VARCHAR(255) NOT NULL COMMENT 'Hashed password (bcrypt)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation timestamp',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update timestamp',
  INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Accounts Table
-- Stores WhatsApp account information for each user
-- Each user can have multiple WhatsApp accounts
-- ============================================
CREATE TABLE IF NOT EXISTS accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(255) NOT NULL COMMENT 'Unique account identifier (e.g., "work", "personal")',
  user_id INT NOT NULL COMMENT 'Owner user ID',
  is_ready BOOLEAN DEFAULT FALSE COMMENT 'Whether WhatsApp client is ready to send messages',
  is_connected BOOLEAN DEFAULT FALSE COMMENT 'Whether WhatsApp client is connected',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation timestamp',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last status update timestamp',
  UNIQUE KEY unique_user_account (user_id, account_id) COMMENT 'Ensure one account_id per user',
  INDEX idx_account_id (account_id),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE COMMENT 'Cascade delete when user is deleted'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Messages Table
-- Stores all sent messages (text and media)
-- Supports both text messages and media messages (images, documents, audio, video)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(255) NOT NULL COMMENT 'Account that sent the message',
  user_id INT NOT NULL COMMENT 'User who owns the account',
  phone_number VARCHAR(255) NOT NULL COMMENT 'Recipient phone number (format: number@c.us)',
  message_type ENUM('text', 'image', 'document', 'audio', 'video') DEFAULT 'text' COMMENT 'Type of message: text or media type',
  message_text TEXT NOT NULL COMMENT 'Message text or caption for media messages',
  message_id VARCHAR(255) COMMENT 'WhatsApp message ID (returned from WhatsApp)',
  status ENUM('pending', 'sent', 'failed') DEFAULT 'pending' COMMENT 'Message delivery status',
  error_message TEXT COMMENT 'Error message if status is failed',
  -- Media message fields (NULL for text messages)
  media_file_name VARCHAR(500) NULL COMMENT 'Original file name for media messages',
  media_mime_type VARCHAR(100) NULL COMMENT 'MIME type of the media file (e.g., image/jpeg, application/pdf)',
  sent_at TIMESTAMP NULL COMMENT 'Timestamp when message was successfully sent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Message creation timestamp',
  INDEX idx_account_id (account_id) COMMENT 'Index for filtering by account',
  INDEX idx_user_id (user_id) COMMENT 'Index for filtering by user',
  INDEX idx_phone_number (phone_number) COMMENT 'Index for filtering by phone number',
  INDEX idx_status (status) COMMENT 'Index for filtering by status',
  INDEX idx_message_type (message_type) COMMENT 'Index for filtering by message type',
  INDEX idx_created_at (created_at) COMMENT 'Index for sorting by date',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE COMMENT 'Cascade delete when user is deleted',
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, account_id) ON DELETE CASCADE COMMENT 'Cascade delete when account is deleted'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Migration Scripts (for existing databases)
-- ============================================
-- 
-- If you have an existing database, run these ALTER TABLE statements to add media support:
--
-- ALTER TABLE messages 
--   ADD COLUMN message_type ENUM('text', 'image', 'document', 'audio', 'video') DEFAULT 'text' 
--   COMMENT 'Type of message: text or media type' AFTER phone_number;
--
-- ALTER TABLE messages 
--   ADD COLUMN media_file_name VARCHAR(500) NULL 
--   COMMENT 'Original file name for media messages' AFTER error_message;
--
-- ALTER TABLE messages 
--   ADD COLUMN media_mime_type VARCHAR(100) NULL 
--   COMMENT 'MIME type of the media file' AFTER media_file_name;
--
-- ALTER TABLE messages 
--   ADD INDEX idx_message_type (message_type) 
--   COMMENT 'Index for filtering by message type';
--
-- Update existing records to set message_type based on message_text pattern (optional):
-- UPDATE messages SET message_type = 'text' WHERE message_type IS NULL OR message_type = '';

-- ============================================
-- Notes:
-- ============================================
-- 1. All tables use utf8mb4 charset to support emojis and special characters
-- 2. Foreign keys use CASCADE DELETE to automatically clean up related records
-- 3. Messages table supports both text and media messages:
--    - message_type: distinguishes between text and media types
--    - media_file_name: stores the original file name (NULL for text messages)
--    - media_mime_type: stores MIME type like 'image/jpeg', 'application/pdf' (NULL for text messages)
-- 4. Session files are stored in .wwebjs_auth directory (not in database)
-- 5. Cache files are stored in .wwebjs_cache directory (not in database)
-- 6. Uploaded media files are temporarily stored in uploads/ directory and deleted after sending
-- 7. When an account is deleted, all related messages are automatically deleted (CASCADE)
-- 8. When a user is deleted, all related accounts and messages are automatically deleted (CASCADE)

