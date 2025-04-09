-- Add signature status columns to agreements table
ALTER TABLE agreements
ADD COLUMN IF NOT EXISTS signature_status text,
ADD COLUMN IF NOT EXISTS signatories_status jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS signature_request_id text,
ADD COLUMN IF NOT EXISTS signature_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS signature_completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS signature_pdf_url text,
ADD COLUMN IF NOT EXISTS signed_document_url text;

-- Add check constraint for signature_status
ALTER TABLE agreements
ADD CONSTRAINT agreements_signature_status_check 
CHECK (signature_status IN ('pending', 'in_progress', 'completed', 'failed'));

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agreements_signature_status ON agreements(signature_status);
CREATE INDEX IF NOT EXISTS idx_agreements_signature_request_id ON agreements(signature_request_id);

-- Add comment to explain the columns
COMMENT ON COLUMN agreements.signature_status IS 'Current status of the signature process (pending, in_progress, completed, failed)';
COMMENT ON COLUMN agreements.signatories_status IS 'Array of signatory statuses with their email and signing status';
COMMENT ON COLUMN agreements.signature_request_id IS 'ID of the signature request from Evia Sign';
COMMENT ON COLUMN agreements.signature_sent_at IS 'Timestamp when the document was sent for signature';
COMMENT ON COLUMN agreements.signature_completed_at IS 'Timestamp when all signatures were completed';
COMMENT ON COLUMN agreements.signature_pdf_url IS 'URL of the PDF document sent for signature';
COMMENT ON COLUMN agreements.signed_document_url IS 'URL of the signed document after completion'; 