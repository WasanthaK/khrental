-- Create the webhook_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  request_id TEXT,
  user_name TEXT,
  user_email TEXT,
  subject TEXT,
  event_id INTEGER,
  event_time TIMESTAMPTZ DEFAULT now(),
  raw_data JSONB,
  createdat TIMESTAMPTZ DEFAULT now(),
  updatedat TIMESTAMPTZ DEFAULT now()
);

-- Create indexes to optimize queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_request_id ON webhook_events(request_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_time ON webhook_events(event_time);

-- Set up Row Level Security (allow only authenticated users to view)
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policy to allow authenticated users to view webhook events
CREATE POLICY webhook_events_select_policy ON webhook_events
  FOR SELECT TO authenticated USING (true);

-- Allow service_role to insert webhook events (needed for the Edge Function)
CREATE POLICY webhook_events_insert_policy ON webhook_events
  FOR INSERT WITH CHECK (true);

-- Return success message
SELECT 'Webhook events table setup completed successfully' as result; 