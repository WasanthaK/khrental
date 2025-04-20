// Script to add the associated_properties column to app_users table
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../services/supabaseClient.js';

// Get directory name in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the SQL migration file
const sqlFilePath = path.resolve(__dirname, '../db/migrations/add_associated_properties_column.sql');

// Run the migration
async function runMigration() {
  try {
    console.log('Loading migration SQL file...');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    console.log('Executing SQL migration...');
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('Migration failed:', error);
      return;
    }
    
    console.log('Migration successful! The associated_properties column has been added to app_users table.');
  } catch (error) {
    console.error('Error running migration:', error);
  }
}

runMigration(); 