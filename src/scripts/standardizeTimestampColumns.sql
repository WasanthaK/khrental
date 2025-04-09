-- This script standardizes timestamp column names across all tables to use createdat and updatedat
-- It checks for created_at/updated_at (with underscore) and converts them to createdat/updatedat

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