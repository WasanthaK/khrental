-- Fix the associated_property_ids column type in app_users table
-- First, rename the old column (if it exists)
ALTER TABLE app_users 
RENAME COLUMN associated_property_ids TO associated_property_ids_old;

-- Then add the new column with the correct type
ALTER TABLE app_users 
ADD COLUMN associated_property_ids UUID[] DEFAULT '{}';

-- Copy data from old column to new column, if the old column exists and has data
DO $$
BEGIN
  -- Check if the old column exists and has any non-null data
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'app_users' 
    AND column_name = 'associated_property_ids_old'
  ) THEN
    -- Update records where old value is not null
    UPDATE app_users
    SET associated_property_ids = ARRAY[associated_property_ids_old]
    WHERE associated_property_ids_old IS NOT NULL;
  END IF;

  -- Also check if there was an old single property field from the initial migration
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'app_users' 
    AND column_name = 'associated_property'
  ) THEN
    -- Update records where old value is not null
    UPDATE app_users
    SET associated_property_ids = ARRAY[associated_property]
    WHERE associated_property IS NOT NULL;
    
    -- Drop the old column
    ALTER TABLE app_users DROP COLUMN associated_property;
  END IF;
END$$;

-- Drop the old column if it exists
ALTER TABLE app_users 
DROP COLUMN IF EXISTS associated_property_ids_old;

-- Add a comment to document the field
COMMENT ON COLUMN app_users.associated_property_ids IS 'Array of property IDs associated with this user'; 