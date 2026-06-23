-- ============================================
-- Migration Script: Add Media Message Support
-- ============================================
-- 
-- This script adds support for media messages (images, documents, audio, video)
-- to the existing messages table.
--
-- Run this script if you have an existing database that needs to be updated.
-- For new installations, the schema.sql already includes these fields.
--
-- Usage:
--   mysql -u your_username -p whatsapp_sender < migration_add_media_support.sql
--   OR
--   Run these commands in your MySQL client
--

USE whatsapp_sender;

-- Add message_type column to distinguish between text and media messages
-- Note: If column already exists, you'll get an error - that's OK, just continue
ALTER TABLE messages 
  ADD COLUMN message_type ENUM('text', 'image', 'document', 'audio', 'video') DEFAULT 'text' 
  COMMENT 'Type of message: text or media type' 
  AFTER phone_number;

-- Add media_file_name column to store original file name
ALTER TABLE messages 
  ADD COLUMN media_file_name VARCHAR(500) NULL 
  COMMENT 'Original file name for media messages' 
  AFTER error_message;

-- Add media_mime_type column to store MIME type
ALTER TABLE messages 
  ADD COLUMN media_mime_type VARCHAR(100) NULL 
  COMMENT 'MIME type of the media file (e.g., image/jpeg, application/pdf)' 
  AFTER media_file_name;

-- Add index for message_type for better query performance
ALTER TABLE messages 
  ADD INDEX idx_message_type (message_type) 
  COMMENT 'Index for filtering by message type';

-- Update existing records to set message_type = 'text' (all existing messages are text)
UPDATE messages 
SET message_type = 'text' 
WHERE message_type IS NULL OR message_type = '';

-- Verify the changes
SELECT 
  COLUMN_NAME, 
  COLUMN_TYPE, 
  IS_NULLABLE, 
  COLUMN_DEFAULT, 
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'whatsapp_sender' 
  AND TABLE_NAME = 'messages' 
  AND COLUMN_NAME IN ('message_type', 'media_file_name', 'media_mime_type')
ORDER BY ORDINAL_POSITION;

-- Show success message
SELECT 'Migration completed successfully! Media message support has been added.' AS status;

