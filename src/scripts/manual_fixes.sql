-- This SQL file combines fixes for:
-- 1. App Users associated_property_ids field
-- 2. Standardizing timestamp columns (createdat/updatedat)

------------------------------------------------------------------------
-- PART 1: Fix app_users associated_property_ids
------------------------------------------------------------------------

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

-- Fix any invalid data in associated_property_ids
UPDATE app_users
SET associated_property_ids = '{}'::UUID[]
WHERE user_type = 'rentee' 
AND (associated_property_ids IS NULL OR associated_property_ids::TEXT = '[]');

------------------------------------------------------------------------
-- PART 2: Standardize timestamp columns
------------------------------------------------------------------------

DO $$
DECLARE
    table_rec RECORD;
    has_createdat BOOLEAN;
    has_created_at BOOLEAN;
    has_updatedat BOOLEAN;
    has_updated_at BOOLEAN;
BEGIN
    -- Get all tables in the public schema
    FOR table_rec IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        -- Check for existing columns
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = table_rec.tablename AND column_name = 'createdat'
        ) INTO has_createdat;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = table_rec.tablename AND column_name = 'created_at'
        ) INTO has_created_at;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = table_rec.tablename AND column_name = 'updatedat'
        ) INTO has_updatedat;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = table_rec.tablename AND column_name = 'updated_at'
        ) INTO has_updated_at;
        
        -- Handle createdat/created_at
        IF has_created_at AND NOT has_createdat THEN
            -- Rename created_at to createdat
            EXECUTE 'ALTER TABLE ' || table_rec.tablename || ' RENAME COLUMN created_at TO createdat';
            RAISE NOTICE 'Table % - Renamed created_at to createdat', table_rec.tablename;
        ELSIF has_created_at AND has_createdat THEN
            -- Both column types exist - need to migrate data and drop one
            RAISE NOTICE 'Table % - Both createdat and created_at exist. Manual inspection needed', table_rec.tablename;
        ELSIF NOT has_created_at AND NOT has_createdat THEN
            -- Neither column exists - add createdat
            EXECUTE 'ALTER TABLE ' || table_rec.tablename || ' ADD COLUMN createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()';
            RAISE NOTICE 'Table % - Added createdat column', table_rec.tablename;
        END IF;
        
        -- Handle updatedat/updated_at
        IF has_updated_at AND NOT has_updatedat THEN
            -- Rename updated_at to updatedat
            EXECUTE 'ALTER TABLE ' || table_rec.tablename || ' RENAME COLUMN updated_at TO updatedat';
            RAISE NOTICE 'Table % - Renamed updated_at to updatedat', table_rec.tablename;
        ELSIF has_updated_at AND has_updatedat THEN
            -- Both column types exist - need to migrate data and drop one
            RAISE NOTICE 'Table % - Both updatedat and updated_at exist. Manual inspection needed', table_rec.tablename;
        ELSIF NOT has_updated_at AND NOT has_updatedat THEN
            -- Neither column exists - add updatedat
            EXECUTE 'ALTER TABLE ' || table_rec.tablename || ' ADD COLUMN updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW()';
            RAISE NOTICE 'Table % - Added updatedat column', table_rec.tablename;
        END IF;
        
        -- Ensure timestamp values exist
        EXECUTE '
            UPDATE ' || table_rec.tablename || '
            SET createdat = NOW()
            WHERE createdat IS NULL
        ';
        
        EXECUTE '
            UPDATE ' || table_rec.tablename || '
            SET updatedat = COALESCE(createdat, NOW())
            WHERE updatedat IS NULL
        ';
    END LOOP;
    
    RAISE NOTICE 'Timestamp column standardization completed.';
END $$; 