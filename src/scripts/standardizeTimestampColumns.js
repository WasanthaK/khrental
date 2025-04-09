import { supabase } from '../services/supabaseClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Standardize timestamp column names across all tables
 * Converts created_at/updated_at to createdat/updatedat for consistency
 */
const standardizeTimestampColumns = async () => {
  try {
    console.log('Starting timestamp column standardization...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'standardizeTimestampColumns.sql');
    const sqlQuery = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql: sqlQuery });
    
    if (error) {
      console.error('Error executing SQL via RPC:', error);
      
      // Try alternative approach with direct query if RPC fails
      console.log('Trying direct query approach...');
      try {
        await supabase.query(sqlQuery);
        console.log('Direct query succeeded');
      } catch (directError) {
        console.error('Direct query also failed:', directError);
        return;
      }
    }
    
    console.log('Timestamp column standardization completed successfully.');
    console.log('All tables now use consistent createdat and updatedat column names.');
    
  } catch (error) {
    console.error('Unhandled error:', error);
  }
};

// Execute the function immediately
standardizeTimestampColumns()
  .then(() => console.log('Done!'))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

export default standardizeTimestampColumns; 