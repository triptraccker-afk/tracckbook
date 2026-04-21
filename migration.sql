-- Migration to fix attachments table: remove dependency on file_url and file_name
-- Run this in the Supabase SQL Editor

-- 1. Make file_url and file_name nullable (or just drop them if no longer wanted)
ALTER TABLE attachments ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE attachments ALTER COLUMN file_name DROP NOT NULL;
ALTER TABLE attachments ALTER COLUMN file_type DROP NOT NULL;

-- 2. Ensure image_id is present and has proper foreign key
-- (Assuming images table exists with 'id')
-- ALTER TABLE attachments ADD COLUMN IF NOT EXISTS image_id UUID REFERENCES images(id);

-- 3. Fix "amount" column to support decimals (if it was an integer)
-- This is critical for accurate expense tracking with cents/paise
ALTER TABLE entries ALTER COLUMN amount TYPE DECIMAL(20, 2);

-- 4. User-based storage improvements for images table
ALTER TABLE images ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE images ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Optional: Add index for faster lookup by user
CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);
