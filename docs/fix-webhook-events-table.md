# Fixing the webhook_events Table

If you're seeing this error when using the Evia Sign webhook functionality:

```
ERROR:  42703: column "processed" does not exist
```

This means the webhook_events table in your database is missing the `processed` column that the webhook function is trying to use.

## Option 1: Run SQL in Supabase Dashboard (Recommended)

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to the SQL Editor
4. Create a new query
5. Copy and paste the following SQL:

```sql
-- Run this script to fix the webhook_events table
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
```

6. Click "Run" to execute the script
7. Verify that you see the `processed` column in the results table at the bottom

## Option 2: Run Script Through Node.js

If you prefer, you can run this fix through our Node.js script:

```bash
node scripts/fix-webhook-table.js
```

## Preventing This Issue in the Future

This issue happens when the webhook_events table is created without the processed column. To prevent this:

1. Always use the `create_webhook_events_table.sql` script to create this table
2. When deploying new edge functions, make sure the database schema is up to date
3. Consider adding database schema checking to your CI/CD pipeline

## What This Fix Does

1. Adds the `processed` column (BOOLEAN, default FALSE) to the webhook_events table
2. Creates an index on the processed column for better query performance
3. Adds a Row Level Security policy to allow the service role to update events (mark them as processed)

After applying this fix, the webhook function should work properly. 