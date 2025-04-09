-- Enable the exec_sql RPC function
-- This function allows executing arbitrary SQL from your application
-- WARNING: This can be a security risk if misused. Use with caution in production.

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS exec_sql;

-- Create the exec_sql function with proper permissions
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void AS $$
BEGIN
  -- Log the SQL being executed (optional, for debugging)
  RAISE NOTICE 'Executing SQL: %', sql;
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;

-- Enable the function to manage storage policies
ALTER FUNCTION exec_sql(text) SET search_path = storage, pg_catalog, pg_temp;

-- Log that the function has been enabled
DO $$
BEGIN
  RAISE NOTICE 'The exec_sql function has been enabled.';
  RAISE NOTICE 'This function can execute arbitrary SQL statements.';
  RAISE NOTICE 'For production environments, consider restricting access to admin roles only.';
END $$;