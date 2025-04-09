import { supabase } from '../services/supabaseClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupAgreementSignature() {
  try {
    console.log('Starting agreements table update for signature integration...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'updateAgreementsTable.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = sql
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    // Execute each statement
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      
      const { error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });
      
      if (error) {
        console.error(`Error executing SQL: ${error.message}`);
        throw error;
      }
    }
    
    console.log('Agreements table updated successfully for signature integration!');
    
    // Check if settings were created
    const { data: settings, error: settingsError } = await supabase
      .from('app_settings')
      .select('*')
      .eq('key', 'signature_manager');
      
    if (settingsError) {
      console.error('Error checking settings:', settingsError);
    } else {
      console.log('Signature manager settings:', settings);
    }
    
  } catch (error) {
    console.error('Error setting up agreement signature:', error);
  }
}

// Run the function
setupAgreementSignature(); 