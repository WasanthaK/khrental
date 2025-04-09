import { supabase } from '../services/supabaseClient';

/**
 * Add auth fields to the database tables
 * This performs the migration programmatically using column operations instead of raw SQL
 */
export const applyAuthFieldsMigration = async () => {
  try {
    console.log('Starting database migration to add auth fields...');
    
    // Check if rentees table has authid column
    const { data: renteeColumns, error: renteeError } = await supabase
      .from('rentees')
      .select('*')
      .limit(1);
    
    if (renteeError) {
      throw new Error(`Error checking rentees table: ${renteeError.message}`);
    }
    
    console.log('Successfully accessed rentees table');
    
    // Check if team_members table has authid column
    const { data: teamColumns, error: teamError } = await supabase
      .from('team_members')
      .select('*')
      .limit(1);
    
    if (teamError) {
      throw new Error(`Error checking team_members table: ${teamError.message}`);
    }
    
    console.log('Successfully accessed team_members table');
    
    // Since we can't add columns programmatically using the JS client,
    // we'll display instructions for the user to run the SQL manually
    console.log('Migration step requirements:');
    console.log(`
    Please run the following SQL in the Supabase SQL editor:
    
    -- Add authid and invited fields to rentees table
    ALTER TABLE rentees
    ADD COLUMN IF NOT EXISTS authid uuid,
    ADD COLUMN IF NOT EXISTS invited boolean DEFAULT false;
    
    -- Add authid and invited fields to team_members table
    ALTER TABLE team_members
    ADD COLUMN IF NOT EXISTS authid uuid,
    ADD COLUMN IF NOT EXISTS invited boolean DEFAULT false;
    
    -- Add indexes for faster lookups
    CREATE INDEX IF NOT EXISTS idx_rentees_authid ON rentees(authid);
    CREATE INDEX IF NOT EXISTS idx_team_members_authid ON team_members(authid);
    `);
    
    return { 
      success: true,
      message: 'Database tables accessible. Please run the SQL commands in the Supabase SQL editor to complete the migration.'
    };
  } catch (error) {
    console.error('Database migration check failed:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Generate SQL commands to create the app_users table and migrate data
 * @returns {Promise<Object>} - Result with SQL commands
 */
export const generateAppUsersMigration = async () => {
  try {
    // Check if we can access the database
    const { error: testError } = await supabase.from('team_members').select('id').limit(1);
    if (testError) {
      throw new Error(`Database access error: ${testError.message}`);
    }
    
    // SQL to create app_users table
    const createTableSQL = `
-- Create app_users table
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'rentee',
  user_type TEXT NOT NULL,
  contact_details JSONB,
  invited BOOLEAN DEFAULT FALSE,
  
  -- Staff-specific fields
  skills TEXT[] DEFAULT '{}',
  availability JSONB,
  notes TEXT,
  status TEXT DEFAULT 'active',
  
  -- Rentee-specific fields
  id_copy_url TEXT,
  associated_property JSONB,
  associated_property_ids UUID[],
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS app_users_auth_id_idx ON app_users(auth_id);
CREATE INDEX IF NOT EXISTS app_users_email_idx ON app_users(email);
CREATE INDEX IF NOT EXISTS app_users_role_idx ON app_users(role);
CREATE INDEX IF NOT EXISTS app_users_user_type_idx ON app_users(user_type);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_app_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_app_users_updated_at_trigger ON app_users;
CREATE TRIGGER update_app_users_updated_at_trigger
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION update_app_users_updated_at();
`;

    // SQL to migrate data from team_members and rentees
    const migrateDataSQL = `
-- Migrate team members to app_users
INSERT INTO app_users (
  name,
  email,
  role,
  user_type,
  contact_details,
  auth_id,
  skills,
  availability,
  notes,
  status,
  invited
)
SELECT
  tm.name,
  tm.contact_details->>'email' as email,
  tm.role,
  'staff' as user_type,
  tm.contact_details,
  tm.auth_id,
  tm.skills,
  tm.availability,
  tm.notes,
  tm.active::text as status,
  CASE WHEN tm.auth_id IS NOT NULL THEN TRUE ELSE FALSE END as invited
FROM
  team_members tm
WHERE
  tm.contact_details->>'email' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM app_users au WHERE au.email = tm.contact_details->>'email'
  )
ON CONFLICT (email) DO NOTHING;

-- Migrate rentees to app_users
INSERT INTO app_users (
  name,
  email,
  role,
  user_type,
  contact_details,
  auth_id,
  id_copy_url,
  associated_property_ids,
  invited
)
SELECT
  r.name,
  r.contact_details->>'email' as email,
  'rentee' as role,
  'rentee' as user_type,
  r.contact_details,
  r.auth_id,
  r.id_copy_url,
  r.associated_property_ids,
  CASE WHEN r.auth_id IS NOT NULL THEN TRUE ELSE FALSE END as invited
FROM
  rentees r
WHERE
  r.contact_details->>'email' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM app_users au WHERE au.email = r.contact_details->>'email'
  )
ON CONFLICT (email) DO NOTHING;
`;

    return {
      success: true,
      createTableSQL,
      migrateDataSQL
    };
  } catch (error) {
    console.error('Error generating app_users migration:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Apply the app_users migration in the database
 * @returns {Promise<Object>} - Result of the migration
 */
export const applyAppUsersMigration = async () => {
  try {
    // This function will only generate the SQL commands
    // The actual migration should be done manually in the Supabase SQL Editor
    const migrationResult = await generateAppUsersMigration();
    
    if (!migrationResult.success) {
      return migrationResult;
    }
    
    return {
      success: true,
      message: 'Migration SQL generated successfully. Please run the SQL commands in the Supabase SQL Editor.',
      ...migrationResult
    };
  } catch (error) {
    console.error('Error applying migration:', error);
    return { 
      success: false, 
      error: `Error applying migration: ${error.message}` 
    };
  }
}; 