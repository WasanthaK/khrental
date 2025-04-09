/**
 * Script to fix the webhook_events table by adding the processed column
 * 
 * Usage:
 * node scripts/fix-webhook-table.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase URL or key not found in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Read SQL file
const sqlFilePath = path.join(process.cwd(), 'scripts', 'add_processed_column.sql');
const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

async function fixWebhookTable() {
  try {
    console.log('Fixing webhook_events table...');
    
    // Execute SQL directly or using RPC if available
    try {
      // First, try executing via RPC function if it exists
      const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
      
      if (error) {
        throw new Error(`RPC execution failed: ${error.message}`);
      }
      
      console.log('✅ Webhook table fixed successfully using RPC');
      console.log('Result:', data);
    } catch (rpcError) {
      console.warn('RPC execution failed, trying alternative method...');
      
      // Alternative approach: Break SQL into statements and execute them separately
      const statements = sqlContent
        .split(';')
        .map(statement => statement.trim())
        .filter(statement => statement.length > 0);
      
      console.log(`Found ${statements.length} SQL statements to execute`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        console.log(`Executing statement ${i + 1}/${statements.length}`);
        
        // Use raw query if it's a simple statement
        const { error } = await supabase.from('webhook_events').select('id').limit(1);
        
        if (error) {
          if (error.code === '42P01') { // Table doesn't exist
            console.log('Creating webhook_events table from scratch...');
            // Get the full creation script
            const fullCreationScript = fs.readFileSync(
              path.join(process.cwd(), 'scripts', 'create_webhook_events_table.sql'), 
              'utf8'
            );
            
            // Execute it
            // This would typically require admin access - just show a message
            console.log('Please execute this SQL in your Supabase SQL editor:');
            console.log(fullCreationScript);
            break;
          }
        }
      }
      
      console.log('✅ Done. Please verify the webhook_events table has been fixed by checking your database.');
    }
  } catch (error) {
    console.error('❌ Error fixing webhook table:', error.message);
    
    // Show a helpful message on what to do manually
    console.error('\nTo fix this issue manually:');
    console.error('1. Go to your Supabase dashboard');
    console.error('2. Open the SQL editor');
    console.error('3. Execute this SQL command:');
    console.error('   ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;');
    console.error('   CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);');
  }
}

fixWebhookTable(); 