-- Create trigger for setting timestamps in property_units table
-- Run this in the Supabase SQL Editor

-- Create the set_timestamps function if it doesn't exist
CREATE OR REPLACE FUNCTION set_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- For new records, set createdat
  IF NEW.createdat IS NULL THEN
    NEW.createdat = NOW();
  END IF;
  
  -- Always set updatedat
  NEW.updatedat = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add description column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'property_units' AND column_name = 'description'
  ) THEN
    ALTER TABLE property_units ADD COLUMN description TEXT;
  END IF;
END $$;

-- Convert rentalvalue to rentalvalues if needed
DO $$
BEGIN
  -- Check if rentalvalue exists but rentalvalues doesn't
  IF EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'property_units' AND column_name = 'rentalvalue'
  ) AND NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'property_units' AND column_name = 'rentalvalues'
  ) THEN
    -- Add rentalvalues column
    ALTER TABLE property_units ADD COLUMN rentalvalues JSONB DEFAULT '{"rent": 0, "deposit": 0}';
    
    -- Copy data from old column to new
    UPDATE property_units 
    SET rentalvalues = jsonb_build_object('rent', rentalvalue, 'deposit', 0)
    WHERE rentalvalue IS NOT NULL;
  END IF;
END $$;

-- Add trigger to property_units table
DROP TRIGGER IF EXISTS set_timestamps_property_units ON property_units;
CREATE TRIGGER set_timestamps_property_units
BEFORE INSERT OR UPDATE ON property_units
FOR EACH ROW
EXECUTE FUNCTION set_timestamps();

-- Update existing records to ensure they have timestamps
UPDATE property_units 
SET 
  createdat = NOW() 
WHERE 
  createdat IS NULL;

UPDATE property_units 
SET 
  updatedat = COALESCE(createdat, NOW()) 
WHERE 
  updatedat IS NULL; 