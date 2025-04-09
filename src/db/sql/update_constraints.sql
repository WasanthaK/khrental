-- Update utility_readings table constraints to allow the status values we need

-- First, drop the existing status constraint
ALTER TABLE utility_readings
DROP CONSTRAINT IF EXISTS utility_readings_status_check;

-- Add a new constraint that includes all the values we need
ALTER TABLE utility_readings
ADD CONSTRAINT utility_readings_status_check
CHECK (status IN ('pending', 'verified', 'billed', 'disputed', 'approved', 'completed', 'rejected', 'cancelled'));

-- Add the billing_status constraint if not exists
DO $$
BEGIN
    -- Check if the billing_status constraint exists
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'utility_readings_billing_status_check'
    ) THEN
        -- Add the constraint
        ALTER TABLE utility_readings
        ADD CONSTRAINT utility_readings_billing_status_check
        CHECK (billing_status IN ('pending', 'pending_invoice', 'invoiced', 'rejected') OR billing_status IS NULL);
    END IF;
END
$$;

-- Query to verify the constraints after update
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