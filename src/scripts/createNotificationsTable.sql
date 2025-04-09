-- Create the notifications table
-- This table stores user notifications for the application

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  message TEXT NOT NULL,
  title TEXT,
  type VARCHAR(50) DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  link TEXT,
  
  -- Optional reference to other entities
  entity_type VARCHAR(50),
  entity_id UUID,
  
  -- Add constraint for user_id if app_users table exists
  CONSTRAINT fk_user FOREIGN KEY(user_id) 
    REFERENCES app_users(id) ON DELETE CASCADE
);

-- Set up RLS policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy for users to see only their own notifications
CREATE POLICY "Users can view their own notifications" 
  ON notifications FOR SELECT 
  USING (auth.uid() = user_id);

-- Policy for users to update only their own notifications (e.g., mark as read)
CREATE POLICY "Users can update their own notifications" 
  ON notifications FOR UPDATE 
  USING (auth.uid() = user_id);

-- Create index on common search fields
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_createdat_idx ON notifications(createdat);

-- Create the set_timestamps function if it doesn't exist
CREATE OR REPLACE FUNCTION set_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- For new records, set created_at
  IF NEW.createdat IS NULL THEN
    NEW.createdat = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add timestamp trigger
DROP TRIGGER IF EXISTS set_timestamps_notifications ON notifications;
CREATE TRIGGER set_timestamps_notifications
BEFORE INSERT OR UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION set_timestamps();

COMMENT ON TABLE notifications IS 'Stores user notifications'; 