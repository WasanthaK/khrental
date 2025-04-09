-- Create webhook_events table
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  request_id TEXT,
  user_name TEXT,
  user_email TEXT,
  subject TEXT,
  event_id INTEGER,
  event_time TIMESTAMP WITH TIME ZONE,
  raw_data JSONB,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for faster searches
CREATE INDEX IF NOT EXISTS webhook_events_event_type_idx ON public.webhook_events (event_type);
CREATE INDEX IF NOT EXISTS webhook_events_request_id_idx ON public.webhook_events (request_id);
CREATE INDEX IF NOT EXISTS webhook_events_event_time_idx ON public.webhook_events (event_time);

-- Set up RLS policies
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view webhook events
CREATE POLICY "webhook_events_select_policy" 
ON public.webhook_events FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to insert webhook events (via API)
CREATE POLICY "webhook_events_insert_policy" 
ON public.webhook_events FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Only allow admins to delete webhook events
CREATE POLICY "webhook_events_delete_policy" 
ON public.webhook_events FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM app_users 
    WHERE auth_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedat = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to webhook_events table
DROP TRIGGER IF EXISTS set_updated_at ON public.webhook_events;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at(); 