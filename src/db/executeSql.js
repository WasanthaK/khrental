import { supabase } from '../services/supabaseClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The script to execute can be passed as an argument
// e.g., node src/db/executeSql.js ../scripts/manual_fixes.sql
const main = async () => {
  try {
    let scriptPath = process.argv[2];
    
    if (!scriptPath) {
      console.error('Please provide a SQL script path as an argument');
      console.error('Example: node src/db/executeSql.js ../scripts/manual_fixes.sql');
      process.exit(1);
    }
    
    // If path is relative to executeSql.js, resolve it properly
    if (!path.isAbsolute(scriptPath)) {
      scriptPath = path.resolve(__dirname, scriptPath);
    }
    
    console.log(`Executing SQL script: ${scriptPath}`);
    
    // Read the file
    if (!fs.existsSync(scriptPath)) {
      console.error(`File not found: ${scriptPath}`);
      process.exit(1);
    }
    
    const sqlScript = fs.readFileSync(scriptPath, 'utf8');
    console.log(`SQL script loaded (${sqlScript.length} characters)`);
    
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql: sqlScript });
    
    if (error) {
      console.error('Error executing SQL via RPC:', error);
      
      // Try alternative approach with direct query
      console.log('Trying direct query approach...');
      try {
        await supabase.query(sqlScript);
        console.log('SQL script executed successfully via direct query');
      } catch (directError) {
        console.error('Direct query also failed:', directError);
        process.exit(1);
      }
    } else {
      console.log('SQL script executed successfully via RPC');
    }
    
  } catch (error) {
    console.error('Error executing SQL script:', error);
    process.exit(1);
  }
};

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 