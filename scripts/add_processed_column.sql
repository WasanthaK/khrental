-- Add the processed column to webhook_events table if it doesn't exist
ALTER TABLE webhook_events 
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;

-- Create or recreate the index for the processed column
DROP INDEX IF EXISTS idx_webhook_events_processed;
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);

-- Update RLS policies if needed for this column
DO $$
BEGIN
    -- Check if the update policy exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'webhook_events' 
        AND policyname = 'Only service_role can update webhook_events'
    ) THEN
        -- Create the update policy if it doesn't exist
        EXECUTE 'CREATE POLICY "Only service_role can update webhook_events" 
                ON webhook_events 
                FOR UPDATE 
                USING (auth.role() = ''service_role'')
                WITH CHECK (auth.role() = ''service_role'')';
    END IF;
END
$$;

-- Send success message
SELECT 'Processed column added successfully to webhook_events table' as result; 