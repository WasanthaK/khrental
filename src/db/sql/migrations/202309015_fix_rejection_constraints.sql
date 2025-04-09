-- Migration to fix utility_readings rejection issues and constraints
-- 2023-09-15

-- 1. First check the current state of constraints
DO $$
BEGIN
    RAISE NOTICE 'Checking current constraints on utility_readings table...';
END $$;

SELECT
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM
    pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE
    rel.relname = 'utility_readings'
    AND nsp.nspname = 'public';

-- 2. Fix the billing_status constraint to ensure it allows 'rejected'
DO $$
BEGIN
    RAISE NOTICE 'Fixing billing_status constraint...';
END $$;

ALTER TABLE utility_readings
DROP CONSTRAINT IF EXISTS utility_readings_billing_status_check;

ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_billing_status_check
CHECK (billing_status IS NULL OR billing_status IN ('pending', 'pending_invoice', 'invoiced', 'rejected', 'cancelled'));

-- 3. Fix the status constraint to ensure it allows 'rejected'
DO $$
BEGIN
    RAISE NOTICE 'Fixing status constraint...';
END $$;

ALTER TABLE utility_readings
DROP CONSTRAINT IF EXISTS utility_readings_status_check;

ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_status_check
CHECK (status IN ('pending', 'approved', 'completed', 'verified', 'rejected', 'cancelled'));

-- 4. Create a stored procedure for safely rejecting readings
DO $$
BEGIN
    RAISE NOTICE 'Creating rejection stored procedure...';
END $$;

CREATE OR REPLACE FUNCTION reject_utility_reading(
    p_reading_id UUID,
    p_reason TEXT,
    p_rejected_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
    v_exists BOOLEAN;
BEGIN
    -- First check if the reading exists
    SELECT EXISTS(
        SELECT 1 FROM utility_readings WHERE id = p_reading_id
    ) INTO v_exists;
    
    IF NOT v_exists THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', format('Reading with ID %s not found', p_reading_id)
        );
    END IF;
    
    -- Attempt to update the reading
    BEGIN
        -- Update all relevant fields for rejection
        UPDATE utility_readings
        SET 
            billing_status = 'rejected',
            status = 'rejected',
            rejection_reason = p_reason,
            rejected_date = p_rejected_date,
            billing_data = COALESCE(billing_data, '{}'::jsonb) || jsonb_build_object(
                'rejection_reason', p_reason,
                'rejected_date', p_rejected_date,
                'effective_status', 'rejected'
            )
        WHERE id = p_reading_id;
        
        -- Return success
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', format('Reading %s rejected successfully', p_reading_id)
        );
    EXCEPTION WHEN OTHERS THEN
        -- If the update fails, try a more targeted approach
        BEGIN
            -- Update only the fields that don't have constraints
            UPDATE utility_readings
            SET 
                rejection_reason = p_reason,
                rejected_date = p_rejected_date,
                billing_data = COALESCE(billing_data, '{}'::jsonb) || jsonb_build_object(
                    'rejection_reason', p_reason,
                    'rejected_date', p_rejected_date,
                    'effective_status', 'rejected'
                )
            WHERE id = p_reading_id;
            
            -- Try to update billing_status separately
            BEGIN
                UPDATE utility_readings
                SET billing_status = 'rejected'
                WHERE id = p_reading_id;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not update billing_status: %', SQLERRM;
            END;
            
            -- Try to update status separately
            BEGIN
                UPDATE utility_readings
                SET status = 'rejected'
                WHERE id = p_reading_id;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not update status: %', SQLERRM;
            END;
            
            -- Return partial success
            RETURN jsonb_build_object(
                'success', TRUE,
                'message', format('Reading %s rejected with limitations. Check data for complete update.', p_reading_id)
            );
        EXCEPTION WHEN OTHERS THEN
            -- If even the fallback fails, return the error
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', format('Failed to reject reading: %s', SQLERRM)
            );
        END;
    END;
END;
$$ LANGUAGE plpgsql;

-- 5. Fix any inconsistent data already in the table
DO $$
BEGIN
    RAISE NOTICE 'Fixing inconsistent data in utility_readings...';
END $$;

-- Update readings with rejection_reason but no billing_status
UPDATE utility_readings 
SET billing_status = 'rejected'
WHERE rejection_reason IS NOT NULL 
AND (billing_status IS NULL OR billing_status != 'rejected');

-- Update readings with rejection info in billing_data
UPDATE utility_readings 
SET 
    billing_status = 'rejected',
    rejection_reason = COALESCE(rejection_reason, billing_data->>'rejection_reason')
WHERE billing_data->>'effective_status' = 'rejected'
AND (billing_status IS NULL OR billing_status != 'rejected');

-- 6. Verify the constraints after updates
DO $$
BEGIN
    RAISE NOTICE 'Verifying constraints after update...';
END $$;

SELECT
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM
    pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE
    rel.relname = 'utility_readings'
    AND nsp.nspname = 'public'; 