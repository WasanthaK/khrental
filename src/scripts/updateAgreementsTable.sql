-- Add signature-related columns to the agreements table
ALTER TABLE agreements 
ADD COLUMN IF NOT EXISTS signature_request_id UUID,
ADD COLUMN IF NOT EXISTS signature_status TEXT,
ADD COLUMN IF NOT EXISTS signature_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS signature_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS signature_pdf_url TEXT,
ADD COLUMN IF NOT EXISTS signed_document_url TEXT;

-- Create an app_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  createdat TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updatedat TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default signature manager setting if it doesn't exist
INSERT INTO app_settings (key, value)
VALUES ('signature_manager', '{"name": "Property Manager", "email": "manager@khrentals.com"}')
ON CONFLICT (key) DO NOTHING;

-- Comment on the new columns
COMMENT ON COLUMN agreements.signature_request_id IS 'ID of the signature request in Evia Sign API';
COMMENT ON COLUMN agreements.signature_status IS 'Current status of the signature process (pending, completed, etc.)';
COMMENT ON COLUMN agreements.signature_sent_at IS 'When the agreement was sent for signature';
COMMENT ON COLUMN agreements.signature_completed_at IS 'When all signatures were collected';
COMMENT ON COLUMN agreements.signature_pdf_url IS 'URL to the PDF version sent for signature';
COMMENT ON COLUMN agreements.signed_document_url IS 'URL to the final signed document';

-- Create index on signature_request_id for faster webhook lookups
CREATE INDEX IF NOT EXISTS idx_agreements_signature_request_id ON agreements(signature_request_id);

-- Add a trigger to update the updatedat timestamp whenever a signature field is changed
CREATE OR REPLACE FUNCTION update_signature_timestamp() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updatedat = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agreement_signature_timestamp
BEFORE UPDATE OF signature_request_id, signature_status, signature_pdf_url, signed_document_url
ON agreements
FOR EACH ROW
EXECUTE FUNCTION update_signature_timestamp(); 