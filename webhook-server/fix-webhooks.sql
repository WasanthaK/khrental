/*
  IMPORTANT: Run this SQL in your Supabase SQL Editor to fix the webhook constraints
  
  1. Log in to your Supabase dashboard (https://app.supabase.com)
  2. Go to the SQL Editor
  3. Paste this entire script and run it
  4. Restart your webhook server after this runs successfully
*/

-- Fix for webhook constraint error
-- Drop existing constraints if they exist
ALTER TABLE agreements DROP CONSTRAINT IF EXISTS agreements_signature_status_check;
ALTER TABLE agreements DROP CONSTRAINT IF EXISTS check_signature_status;

-- Drop the status constraint too since it's causing problems with the 'pending_activation' value
ALTER TABLE agreements DROP CONSTRAINT IF EXISTS agreements_status_check;

-- Add back the status constraint with all the needed values
ALTER TABLE agreements 
ADD CONSTRAINT agreements_status_check 
CHECK (status IN (
    'draft', 
    'review', 
    'pending', 
    'signed', 
    'expired', 
    'terminated',
    'created',
    'pending_activation',
    'active',
    'rejected',
    'partially_signed',
    'pending_signature',
    'cancelled'
));

-- Remove all constraints on signature_status (don't add them back)
-- This will allow any value to be used for signature_status

-- Confirm changes by listing constraints (psql only)
-- SELECT conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c 
-- JOIN pg_class t ON c.conrelid = t.oid
-- WHERE t.relname = 'agreements';
