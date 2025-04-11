-- Add processed_content column to agreements table
ALTER TABLE agreements
ADD COLUMN IF NOT EXISTS processed_content text;

-- Create or recreate the index for full-text search on content
CREATE INDEX IF NOT EXISTS idx_agreements_content_search ON agreements 
USING gin(to_tsvector('english', coalesce(content,'')));

-- If you want to create the same for processed_content
CREATE INDEX IF NOT EXISTS idx_agreements_processed_content_search ON agreements 
USING gin(to_tsvector('english', coalesce(processed_content,'')));

-- Add comment to explain the column
COMMENT ON COLUMN agreements.processed_content IS 'Fully processed HTML content with all placeholders replaced';

-- Send success message
SELECT 'processed_content column added successfully to agreements table' as result; 