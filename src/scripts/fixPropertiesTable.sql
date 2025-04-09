-- Script to fix timestamp fields in the properties table
-- This script adds updatedat/createdat if they don't exist and creates a trigger
-- for automatic timestamp management

-- First, check if we're using createdat or created_at
DO $$
DECLARE
  has_createdat boolean;
  has_created_at boolean;
BEGIN
  -- Check for camelCase field
  SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'createdat'
  ) INTO has_createdat;
  
  -- Check for snake_case field
  SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'created_at'
  ) INTO has_created_at;
  
  IF has_createdat AND NOT has_created_at THEN
    -- Using camelCase - ensure updatedat exists
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'properties' AND column_name = 'updatedat'
    ) THEN
      ALTER TABLE properties ADD COLUMN updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      RAISE NOTICE 'Added updatedat column to properties table';
    END IF;
    
    -- Update any null values
    UPDATE properties SET createdat = NOW() WHERE createdat IS NULL;
    UPDATE properties SET updatedat = COALESCE(createdat, NOW()) WHERE updatedat IS NULL;
    
    -- Create trigger for automatic timestamps
    EXECUTE 'CREATE OR REPLACE FUNCTION set_properties_timestamps()
    RETURNS TRIGGER AS $func$
    BEGIN
      IF NEW.createdat IS NULL THEN
        NEW.createdat = NOW();
      END IF;
      NEW.updatedat = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql';
    
    EXECUTE 'DROP TRIGGER IF EXISTS set_properties_timestamps ON properties';
    EXECUTE 'CREATE TRIGGER set_properties_timestamps
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION set_properties_timestamps()';
    
    RAISE NOTICE 'Created camelCase timestamp trigger for properties table';
    
  ELSIF has_created_at AND NOT has_createdat THEN
    -- Using snake_case - ensure updated_at exists
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'properties' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE properties ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
      RAISE NOTICE 'Added updated_at column to properties table';
    END IF;
    
    -- Update any null values
    UPDATE properties SET created_at = NOW() WHERE created_at IS NULL;
    UPDATE properties SET updated_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL;
    
    -- Create trigger for automatic timestamps
    EXECUTE 'CREATE OR REPLACE FUNCTION set_properties_timestamps()
    RETURNS TRIGGER AS $func$
    BEGIN
      IF NEW.created_at IS NULL THEN
        NEW.created_at = NOW();
      END IF;
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql';
    
    EXECUTE 'DROP TRIGGER IF EXISTS set_properties_timestamps ON properties';
    EXECUTE 'CREATE TRIGGER set_properties_timestamps
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION set_properties_timestamps()';
    
    RAISE NOTICE 'Created snake_case timestamp trigger for properties table';
    
  ELSIF NOT has_createdat AND NOT has_created_at THEN
    -- Neither field exists - add createdat and updatedat (camelCase)
    ALTER TABLE properties ADD COLUMN createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    ALTER TABLE properties ADD COLUMN updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    
    -- Create trigger for automatic timestamps
    EXECUTE 'CREATE OR REPLACE FUNCTION set_properties_timestamps()
    RETURNS TRIGGER AS $func$
    BEGIN
      IF NEW.createdat IS NULL THEN
        NEW.createdat = NOW();
      END IF;
      NEW.updatedat = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql';
    
    EXECUTE 'DROP TRIGGER IF EXISTS set_properties_timestamps ON properties';
    EXECUTE 'CREATE TRIGGER set_properties_timestamps
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION set_properties_timestamps()';
    
    RAISE NOTICE 'Added camelCase timestamp columns and trigger to properties table';
  ELSE
    -- Both field types exist - this is unusual but we'll leave it
    RAISE NOTICE 'Both createdat and created_at exist in properties table. No changes made.';
  END IF;
END $$; 