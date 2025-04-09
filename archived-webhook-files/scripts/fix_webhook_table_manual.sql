-- Run this script in the Supabase SQL Editor to fix the webhook_events table
-- This will add the processed column that the evia-webhook function needs

-- Add the processed column if it doesn't exist
DO $$
BEGIN
  -- Check if the column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_events' 
    AND column_name = 'processed'
  ) THEN
    ALTER TABLE webhook_events ADD COLUMN processed BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added processed column to webhook_events table';
  ELSE
    RAISE NOTICE 'processed column already exists in webhook_events table';
  END IF;
END;
$$;

-- Create the index if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'webhook_events' 
    AND indexname = 'idx_webhook_events_processed'
  ) THEN
    CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
    RAISE NOTICE 'Created index idx_webhook_events_processed';
  ELSE
    RAISE NOTICE 'Index idx_webhook_events_processed already exists';
  END IF;
END;
$$;

-- Add RLS policy for updating (needed to mark events as processed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'webhook_events' 
    AND policyname = 'Only service_role can update webhook_events'
  ) THEN
    CREATE POLICY "Only service_role can update webhook_events"
      ON webhook_events FOR UPDATE
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
    RAISE NOTICE 'Created update policy for webhook_events';
  ELSE
    RAISE NOTICE 'Update policy for webhook_events already exists';
  END IF;
END;
$$;

-- Verify the table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'webhook_events'
ORDER BY ordinal_position; 