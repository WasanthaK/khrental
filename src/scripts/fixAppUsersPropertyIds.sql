-- This script fixes the app_users table by changing the associated_property column to associated_property_ids array
-- Check if the column exists before modifying

DO $$
DECLARE
    column_exists boolean;
    array_column_exists boolean;
BEGIN
    -- Check if the old column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'app_users' AND column_name = 'associated_property'
    ) INTO column_exists;
    
    -- Check if the new column already exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'app_users' AND column_name = 'associated_property_ids'
    ) INTO array_column_exists;
    
    -- If old column exists and new column doesn't, proceed with transformation
    IF column_exists AND NOT array_column_exists THEN
        -- Add the new array column
        ALTER TABLE app_users ADD COLUMN associated_property_ids UUID[] DEFAULT '{}'::UUID[];
        
        -- Copy data from old column to new array column where the old column has data
        UPDATE app_users 
        SET associated_property_ids = ARRAY[associated_property]
        WHERE associated_property IS NOT NULL;
        
        -- Drop the old column (optional - keep this commented if you want to keep the old data for reference)
        -- ALTER TABLE app_users DROP COLUMN associated_property;
        
        RAISE NOTICE 'Successfully transformed associated_property to associated_property_ids array';
    ELSIF array_column_exists THEN
        RAISE NOTICE 'associated_property_ids column already exists. No changes made.';
    ELSE
        -- If the old column doesn't exist but we need the new one
        ALTER TABLE app_users ADD COLUMN associated_property_ids UUID[] DEFAULT '{}'::UUID[];
        RAISE NOTICE 'Added associated_property_ids column with empty array default';
    END IF;
    
    -- Ensure the column accepts arrays properly (in case it wasn't created correctly)
    BEGIN
        EXECUTE 'ALTER TABLE app_users ALTER COLUMN associated_property_ids TYPE UUID[] USING associated_property_ids::UUID[]';
        RAISE NOTICE 'Ensured associated_property_ids has the correct UUID[] type';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Column type validation failed: %', SQLERRM;
    END;
END $$; 