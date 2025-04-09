import { supabase } from '../services/supabaseClient';

/**
 * Check if the app_users table exists and create it if it doesn't
 */
export const setupAppUsersTable = async () => {
  try {
    console.log('Checking if app_users table exists...');
    
    // Try to query the app_users table
    const { data, error } = await supabase
      .from('app_users')
      .select('count(*)')
      .limit(1);
    
    // If there's an error, the table might not exist
    if (error && error.code === '42P01') { // PostgreSQL error code for undefined_table
      console.log('app_users table does not exist, creating it...');
      
      // Create the app_users table
      const { error: createError } = await supabase.rpc('create_app_users_table');
      
      if (createError) {
        console.error('Error creating app_users table:', createError);
        return { success: false, error: createError.message };
      }
      
      console.log('app_users table created successfully');
      return { success: true, message: 'app_users table created successfully' };
    } else if (error) {
      console.error('Error checking app_users table:', error);
      return { success: false, error: error.message };
    }
    
    console.log('app_users table exists');
    return { success: true, message: 'app_users table already exists' };
  } catch (error) {
    console.error('Error setting up app_users table:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Create a stored procedure to create the app_users table
 */
export const createAppUsersTableProcedure = async () => {
  try {
    console.log('Creating stored procedure for app_users table...');
    
    // Create a stored procedure to create the app_users table
    const { error } = await supabase.rpc('create_create_app_users_table_procedure');
    
    if (error) {
      console.error('Error creating stored procedure:', error);
      return { success: false, error: error.message };
    }
    
    console.log('Stored procedure created successfully');
    return { success: true, message: 'Stored procedure created successfully' };
  } catch (error) {
    console.error('Error creating stored procedure:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Create a test rentee in the app_users table
 */
export const createTestRentee = async () => {
  try {
    console.log('Creating test rentee...');
    
    // Create a test rentee
    const { data, error } = await supabase
      .from('app_users')
      .insert({
        name: 'Test Rentee',
        email: 'test.rentee@example.com',
        role: 'rentee',
        user_type: 'rentee',
        contact_details: {
          email: 'test.rentee@example.com',
          phone: '123-456-7890'
        }
      })
      .select();
    
    if (error) {
      console.error('Error creating test rentee:', error);
      return { success: false, error: error.message };
    }
    
    console.log('Test rentee created successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Error creating test rentee:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Run the SQL to create the app_users table directly
 */
export const runCreateAppUsersTableSQL = async () => {
  try {
    console.log('Running SQL to create app_users table...');
    
    const createTableSQL = `
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
    
    // We can't run raw SQL with the Supabase JS client
    // This is just to show the SQL that needs to be run in the Supabase SQL Editor
    console.log('Please run this SQL in the Supabase SQL Editor:');
    console.log(createTableSQL);
    
    return { 
      success: true, 
      message: 'SQL generated successfully. Please run it in the Supabase SQL Editor.',
      sql: createTableSQL
    };
  } catch (error) {
    console.error('Error generating SQL:', error);
    return { success: false, error: error.message };
  }
}; 