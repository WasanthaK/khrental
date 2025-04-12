-- Add processedcontent column to agreements table
ALTER TABLE agreements
ADD COLUMN IF NOT EXISTS processedcontent text;

-- Add comment to explain the column
COMMENT ON COLUMN agreements.processedcontent IS 'Fully processed HTML content with all placeholders replaced';

-- Send success message
SELECT 'processedcontent column added successfully to agreements table' as result; 