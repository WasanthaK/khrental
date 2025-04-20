-- Migration: Add associated_properties column to app_users table
-- This migration adds the missing column for structured property associations

-- Check if the column already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'app_users' 
        AND column_name = 'associated_properties'
    ) THEN
        -- Add the associated_properties column
        ALTER TABLE app_users
        ADD COLUMN associated_properties JSONB DEFAULT '[]'::jsonb;
        
        -- Initialize the associated_properties column based on associated_property_ids
        UPDATE app_users
        SET associated_properties = (
            SELECT jsonb_agg(jsonb_build_object('propertyId', prop_id, 'unitId', null))
            FROM unnest(associated_property_ids) AS prop_id
        )
        WHERE associated_property_ids IS NOT NULL AND array_length(associated_property_ids, 1) > 0;
        
        RAISE NOTICE 'Added associated_properties column to app_users table';
    ELSE
        RAISE NOTICE 'associated_properties column already exists in app_users table';
    END IF;
END
$$; 