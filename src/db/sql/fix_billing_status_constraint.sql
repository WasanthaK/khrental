-- Script to check and fix the billing_status constraint on utility_readings table

-- Check the current billing_status constraint
SELECT
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM
    pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE
    rel.relname = 'utility_readings'
    AND nsp.nspname = 'public'
    AND con.conname = 'utility_readings_billing_status_check';

-- Drop and recreate the billing_status constraint with all needed values
ALTER TABLE utility_readings
DROP CONSTRAINT IF EXISTS utility_readings_billing_status_check;

ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_billing_status_check
CHECK (billing_status IS NULL OR billing_status IN ('pending', 'pending_invoice', 'invoiced', 'rejected', 'cancelled'));

-- Check for NULL values in billing_status and set default values for existing records
UPDATE utility_readings 
SET billing_status = 'pending'
WHERE billing_status IS NULL AND status = 'pending';

UPDATE utility_readings 
SET billing_status = 'rejected'
WHERE billing_status IS NULL AND (
    status = 'rejected' OR 
    rejection_reason IS NOT NULL OR 
    billing_data->>'effective_status' = 'rejected'
);

UPDATE utility_readings 
SET billing_status = 'pending_invoice'
WHERE billing_status IS NULL AND status = 'approved';

UPDATE utility_readings 
SET billing_status = 'invoiced'
WHERE billing_status IS NULL AND status = 'completed';

-- Fix any records with mismatched billing_status and status
-- Records marked as rejected in billing_data should have billing_status='rejected'
UPDATE utility_readings
SET billing_status = 'rejected'
WHERE billing_data->>'effective_status' = 'rejected' AND billing_status != 'rejected';

-- Verify the updated constraint
SELECT
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM
    pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE
    rel.relname = 'utility_readings'
    AND nsp.nspname = 'public'
    AND con.conname = 'utility_readings_billing_status_check';

-- Check the current status of the table after updates
SELECT 
    status, 
    billing_status, 
    COUNT(*) 
FROM 
    utility_readings 
GROUP BY 
    status, 
    billing_status 
ORDER BY 
    status, 
    billing_status; 