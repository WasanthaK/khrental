
-- Check if webhook_events table exists, create it if it doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'webhook_events'
  ) THEN
    CREATE TABLE webhook_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type TEXT,
      request_id TEXT,
      user_name TEXT,
      user_email TEXT,
      subject TEXT,
      event_id INTEGER,
      event_time TIMESTAMPTZ DEFAULT now(),
      raw_data JSONB,
      processed BOOLEAN DEFAULT FALSE,
      createdat TIMESTAMPTZ DEFAULT now(),
      updatedat TIMESTAMPTZ DEFAULT now()
    );

    -- Create indexes
    CREATE INDEX idx_webhook_events_request_id ON webhook_events(request_id);
    CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
    CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);

    -- Enable RLS
    ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

    -- Create policies
    CREATE POLICY "Anyone can select webhook_events" 
      ON webhook_events FOR SELECT 
      USING (true);
      
    CREATE POLICY "Anyone can insert webhook_events" 
      ON webhook_events FOR INSERT 
      WITH CHECK (true);
      
    CREATE POLICY "Only service_role can update webhook_events"
      ON webhook_events FOR UPDATE
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
      
    RAISE NOTICE 'Created webhook_events table with all required columns and policies';
  ELSE
    -- Add processed column if it doesn't exist
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
    
    -- Create the index if it doesn't exist
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
    
    -- Add update policy if it doesn't exist
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
  END IF;
END
$$;

-- Return the current structure of the table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'webhook_events'
ORDER BY ordinal_position;
