-- Add missing columns to utility_readings table if they don't exist
-- This script is idempotent - it checks if columns exist before adding them

-- Check and add billing_status column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'utility_readings' 
        AND column_name = 'billing_status'
    ) THEN
        ALTER TABLE utility_readings ADD COLUMN billing_status VARCHAR DEFAULT NULL;
        RAISE NOTICE 'Added billing_status column to utility_readings';
    ELSE
        RAISE NOTICE 'billing_status column already exists';
    END IF;
END $$;

-- Check and add rejection_reason column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'utility_readings' 
        AND column_name = 'rejection_reason'
    ) THEN
        ALTER TABLE utility_readings ADD COLUMN rejection_reason TEXT DEFAULT NULL;
        RAISE NOTICE 'Added rejection_reason column to utility_readings';
    ELSE
        RAISE NOTICE 'rejection_reason column already exists';
    END IF;
END $$;

-- Check and add rejected_date column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'utility_readings' 
        AND column_name = 'rejected_date'
    ) THEN
        ALTER TABLE utility_readings ADD COLUMN rejected_date TIMESTAMP WITH TIME ZONE DEFAULT NULL;
        RAISE NOTICE 'Added rejected_date column to utility_readings';
    ELSE
        RAISE NOTICE 'rejected_date column already exists';
    END IF;
END $$;

-- Check and add approved_date column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'utility_readings' 
        AND column_name = 'approved_date'
    ) THEN
        ALTER TABLE utility_readings ADD COLUMN approved_date TIMESTAMP WITH TIME ZONE DEFAULT NULL;
        RAISE NOTICE 'Added approved_date column to utility_readings';
    ELSE
        RAISE NOTICE 'approved_date column already exists';
    END IF;
END $$;

-- Check and add billing_data column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'utility_readings' 
        AND column_name = 'billing_data'
    ) THEN
        ALTER TABLE utility_readings ADD COLUMN billing_data JSONB DEFAULT NULL;
        RAISE NOTICE 'Added billing_data column to utility_readings';
    ELSE
        RAISE NOTICE 'billing_data column already exists';
    END IF;
END $$;

-- Add a comment explaining our approach
COMMENT ON TABLE utility_readings IS 'Utility meter readings. Note: Instead of changing status which may violate constraints, we use billing_status, billing_data, and approved_date/rejected_date fields to track processing state.';

-- Verification query (uncomment to run)
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'utility_readings' ORDER BY ordinal_position; 