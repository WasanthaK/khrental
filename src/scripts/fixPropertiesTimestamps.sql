-- Simple script to add timestamp trigger for properties table
-- This will ensure createdat and updatedat are automatically managed

-- Create the function for setting timestamps
CREATE OR REPLACE FUNCTION set_properties_timestamps()
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

-- Add trigger to properties table
DROP TRIGGER IF EXISTS set_properties_timestamps ON properties;
CREATE TRIGGER set_properties_timestamps
BEFORE INSERT OR UPDATE ON properties
FOR EACH ROW
EXECUTE FUNCTION set_properties_timestamps();

-- Update existing records to ensure they have timestamps
UPDATE properties 
SET createdat = NOW() 
WHERE createdat IS NULL;

UPDATE properties 
SET updatedat = COALESCE(createdat, NOW()) 
WHERE updatedat IS NULL; 