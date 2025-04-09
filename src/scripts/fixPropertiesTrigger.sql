-- Fix the database trigger for properties table
-- This script finds and fixes triggers that use updated_at instead of updatedat

-- Check what triggers exist
SELECT trigger_name, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'properties';

-- Drop any triggers using the wrong field name
-- Note: Adjust the trigger name based on results of the above query
DO $$
DECLARE
  trigger_name text;
BEGIN
  -- Look for triggers that might be using updated_at
  FOR trigger_name IN 
    SELECT t.trigger_name 
    FROM information_schema.triggers t
    WHERE t.event_object_table = 'properties'
    AND t.action_statement LIKE '%updated_at%'
  LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || trigger_name || ' ON properties';
    RAISE NOTICE 'Dropped trigger: %', trigger_name;
  END LOOP;
END $$;

-- Create correct trigger function for updatedat
CREATE OR REPLACE FUNCTION set_properties_updatedat()
RETURNS TRIGGER AS $$
BEGIN
  -- Use updatedat (camelCase) instead of updated_at (snake_case)
  NEW.updatedat = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger with correct field name
DROP TRIGGER IF EXISTS set_properties_updatedat_trigger ON properties;
CREATE TRIGGER set_properties_updatedat_trigger
BEFORE UPDATE ON properties
FOR EACH ROW
EXECUTE FUNCTION set_properties_updatedat();

-- Let's ensure the createdat field is populated on insert
CREATE OR REPLACE FUNCTION set_properties_createdat()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.createdat IS NULL THEN
    NEW.createdat = NOW();
  END IF;
  NEW.updatedat = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger for insert operations
DROP TRIGGER IF EXISTS set_properties_createdat_trigger ON properties;
CREATE TRIGGER set_properties_createdat_trigger
BEFORE INSERT ON properties
FOR EACH ROW
EXECUTE FUNCTION set_properties_createdat(); 