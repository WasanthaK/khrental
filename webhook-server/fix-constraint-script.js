import { supabase, testConnection } from './services/supabaseClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runFixScript() {
  console.log('Starting constraint fix script...');
  
  // Test connection first
  const connectionTest = await testConnection();
  if (!connectionTest.success) {
    console.error('Failed to connect to Supabase:', connectionTest.error);
    process.exit(1);
  }
  
  console.log('Connection test successful, now fixing constraints...');
  
  try {
    // SQL to drop constraint
    const sql = `
      -- Drop the signature status constraint
      ALTER TABLE agreements DROP CONSTRAINT IF EXISTS agreements_signature_status_check;
      ALTER TABLE agreements DROP CONSTRAINT IF EXISTS check_signature_status;
      
      -- Log completion
      DO $$
      BEGIN
        RAISE NOTICE 'Successfully dropped signature status constraints';
      END $$;
    `;
    
    // Execute SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error executing SQL:', error);
      
      // Try direct query as fallback
      console.log('Attempting direct query as fallback...');
      
      try {
        // Direct query approach
        const result = await supabase.from('agreements')
          .select('id')
          .limit(1);
          
        console.log('Database connection verified, but RPC exec_sql failed.');
        console.log('Please run the following SQL in the Supabase dashboard:');
        console.log(sql);
      } catch (directError) {
        console.error('Direct query also failed:', directError);
      }
    } else {
      console.log('Successfully executed SQL to drop constraints!');
      console.log('Your webhook server should now work with all event types.');
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the script
runFixScript(); 