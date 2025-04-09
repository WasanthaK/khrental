-- Drop the rentees table and its related objects
DROP TABLE IF EXISTS rentees CASCADE;

-- Drop the updatedat trigger function if it's not used by other tables
DROP FUNCTION IF EXISTS update_updatedat_column() CASCADE; 