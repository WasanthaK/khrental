-- Add processedcontent column to agreements table
ALTER TABLE agreements
ADD COLUMN IF NOT EXISTS processedcontent text;

-- Create or recreate the index for full-text search on content
CREATE INDEX IF NOT EXISTS idx_agreements_content_search ON agreements 
USING gin(to_tsvector('english', coalesce(templatecontent,'')));

-- Create index for processedcontent
CREATE INDEX IF NOT EXISTS idx_agreements_processedcontent_search ON agreements 
USING gin(to_tsvector('english', coalesce(processedcontent,'')));

-- Add comment to explain the column
COMMENT ON COLUMN agreements.processedcontent IS 'Fully processed HTML content with all placeholders replaced';

-- Send success message
SELECT 'processedcontent column added successfully to agreements table' as result;