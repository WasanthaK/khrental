/**
 * Migration script to create RPC functions for property and unit rentee associations
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Read environment variables from .env file
dotenv.config();

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and anon key are required.');
  console.error('Make sure you have a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Starting property-rentee association migration...');
    
    // Read the SQL from the migration file
    const sqlFilePath = path.join(__dirname, '../../migrations/create_rentee_property_function.sql');
    
    if (!fs.existsSync(sqlFilePath)) {
      console.error(`Error: Migration file not found at ${sqlFilePath}`);
      console.error('Make sure you have created the migrations directory and SQL file.');
      return;
    }
    
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    console.log('Executing SQL to create/update database functions...');
    
    // Execute the SQL through the Supabase RPC function
    const { data, error } = await supabase.rpc('exec_sql', {
      query: sqlContent
    });
    
    if (error) {
      console.error('Error executing SQL migration:', error);
      
      // Try an alternative approach if RPC fails
      console.log('Attempting alternative approach...');
      
      // Split the SQL into separate statements
      const statements = sqlContent.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (!statement.trim()) continue;
        
        console.log(`Executing statement: ${statement.substring(0, 50)}...`);
        const { error: stmtError } = await supabase.rpc('exec_sql', {
          query: statement
        });
        
        if (stmtError) {
          console.error('Error executing statement:', stmtError);
        }
      }
    } else {
      console.log('SQL migration executed successfully!');
    }
    
    // Verify the functions were created
    console.log('Verifying functions...');
    
    // Check if the functions exist
    const { data: functions, error: funcError } = await supabase
      .from('pg_proc')
      .select('*')
      .or('proname.eq.get_rentees_by_property,proname.eq.get_rentees_by_unit');
    
    if (funcError) {
      console.error('Error checking functions:', funcError);
    } else {
      console.log(`Found ${functions?.length || 0} relevant functions`);
    }
    
    console.log('Migration completed.');
    
  } catch (error) {
    console.error('Unexpected error during migration:', error);
  }
}

// Run the migration
runMigration();

export { runMigration }; 