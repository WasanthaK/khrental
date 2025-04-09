-- Script to check and fix constraints on utility_readings table

-- First, get the details of all constraints on the utility_readings table
SELECT
    con.conname AS constraint_name,
    contype,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM
    pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE
    rel.relname = 'utility_readings'
    AND nsp.nspname = 'public';

-- Check the current status values in the table
SELECT 
    status, 
    COUNT(*) 
FROM 
    utility_readings 
GROUP BY 
    status;

-- Check the current billing_status values in the table
SELECT 
    billing_status, 
    COUNT(*) 
FROM 
    utility_readings 
GROUP BY 
    billing_status;

-- Drop and recreate the status check constraint with all needed values
ALTER TABLE utility_readings
DROP CONSTRAINT IF EXISTS utility_readings_status_check;

ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_status_check
CHECK (status IN ('pending', 'approved', 'completed', 'verified', 'rejected', 'cancelled'));

-- Drop and recreate the billing_status check constraint with all needed values
ALTER TABLE utility_readings
DROP CONSTRAINT IF EXISTS utility_readings_billing_status_check;

ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_billing_status_check
CHECK (billing_status IN ('pending', 'pending_invoice', 'invoiced', 'rejected') OR billing_status IS NULL);

-- 5. Function to update a reading without triggering constraints (for emergencies only)
-- CREATE OR REPLACE FUNCTION update_utility_reading_directly(
--     p_reading_id UUID,
--     p_status TEXT DEFAULT NULL,
--     p_billing_status TEXT DEFAULT NULL
-- ) RETURNS VOID AS $$
-- BEGIN
--     EXECUTE format('UPDATE utility_readings SET %s WHERE id = %L',
--         CASE 
--             WHEN p_status IS NOT NULL AND p_billing_status IS NOT NULL THEN 
--                 format('status = %L, billing_status = %L', p_status, p_billing_status)
--             WHEN p_status IS NOT NULL THEN 
--                 format('status = %L', p_status)
--             WHEN p_billing_status IS NOT NULL THEN 
--                 format('billing_status = %L', p_billing_status)
--             ELSE ''
--         END,
--         p_reading_id
--     );
-- END;
-- $$ LANGUAGE plpgsql; 