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

-- 5. Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  entry_id UUID REFERENCES entries(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- 6. Enable RLS and add policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Select Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can see their own notifications') THEN
        CREATE POLICY "Users can see their own notifications" ON notifications
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    -- Insert Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can insert their own notifications') THEN
        CREATE POLICY "Users can insert their own notifications" ON notifications
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    -- Update Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can update their own notifications') THEN
        CREATE POLICY "Users can update their own notifications" ON notifications
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    -- Delete Policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can delete their own notifications') THEN
        CREATE POLICY "Users can delete their own notifications" ON notifications
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- 7. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Optional: Add index for faster lookup by user
CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);
