-- Create webhook_events table for storing Evia Sign webhook events
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
  processed BOOLEAN DEFAULT FALSE,
  createdat TIMESTAMPTZ DEFAULT now(),
  updatedat TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_webhook_events_request_id ON webhook_events(request_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);

-- Enable Row Level Security
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Create policy for selecting webhook events
CREATE POLICY "Anyone can select webhook_events" 
  ON webhook_events FOR SELECT 
  USING (true);

-- Create policy for inserting webhook events  
CREATE POLICY "Anyone can insert webhook_events" 
  ON webhook_events FOR INSERT 
  WITH CHECK (true);

-- Update policies to handle service_role update for marking as processed
CREATE POLICY "Only service_role can update webhook_events"
  ON webhook_events FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role'); 