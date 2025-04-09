/**
 * Script to fix the webhook_events table by executing the SQL directly
 * 
 * Usage:
 * node scripts/fix-webhook-table-sql.js
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

// ANSI colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

console.log(`${colors.yellow}Fixing webhook_events table...${colors.reset}`);

// Create Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${colors.red}Error: Supabase URL or key not found in .env file${colors.reset}`);
  console.log('Please ensure you have the following variables in your .env file:');
  console.log('  VITE_SUPABASE_URL=your-project-url');
  console.log('  VITE_SUPABASE_SERVICE_KEY=your-service-role-key (or VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// SQL to fix the webhook_events table
const fixTableSQL = `
-- Check if webhook_events table exists, create it if it doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'webhook_events'
  ) THEN
    CREATE TABLE webhook_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type TEXT,
      request_id TEXT,
      user_name TEXT,
      user_email TEXT,
      subject TEXT,
      event_id INTEGER,
      event_time TIMESTAMPTZ DEFAULT now(),
      raw_data JSONB,
      processed BOOLEAN DEFAULT FALSE,
      createdat TIMESTAMPTZ DEFAULT now(),
      updatedat TIMESTAMPTZ DEFAULT now()
    );

    -- Create indexes
    CREATE INDEX idx_webhook_events_request_id ON webhook_events(request_id);
    CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
    CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);

    -- Enable RLS
    ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

    -- Create policies
    CREATE POLICY "Anyone can select webhook_events" 
      ON webhook_events FOR SELECT 
      USING (true);
      
    CREATE POLICY "Anyone can insert webhook_events" 
      ON webhook_events FOR INSERT 
      WITH CHECK (true);
      
    CREATE POLICY "Only service_role can update webhook_events"
      ON webhook_events FOR UPDATE
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
      
    RAISE NOTICE 'Created webhook_events table with all required columns and policies';
  ELSE
    -- Add processed column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'webhook_events' 
      AND column_name = 'processed'
    ) THEN
      ALTER TABLE webhook_events ADD COLUMN processed BOOLEAN DEFAULT FALSE;
      RAISE NOTICE 'Added processed column to webhook_events table';
    ELSE
      RAISE NOTICE 'processed column already exists in webhook_events table';
    END IF;
    
    -- Create the index if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'webhook_events' 
      AND indexname = 'idx_webhook_events_processed'
    ) THEN
      CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
      RAISE NOTICE 'Created index idx_webhook_events_processed';
    ELSE
      RAISE NOTICE 'Index idx_webhook_events_processed already exists';
    END IF;
    
    -- Add update policy if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'webhook_events' 
      AND policyname = 'Only service_role can update webhook_events'
    ) THEN
      CREATE POLICY "Only service_role can update webhook_events"
        ON webhook_events FOR UPDATE
        USING (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role');
      RAISE NOTICE 'Created update policy for webhook_events';
    ELSE
      RAISE NOTICE 'Update policy for webhook_events already exists';
    END IF;
  END IF;
END
$$;

-- Return the current structure of the table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'webhook_events'
ORDER BY ordinal_position;
`;

async function executeSQL() {
  try {
    // Try to execute SQL via RPC
    console.log(`${colors.blue}Executing SQL to fix webhook_events table...${colors.reset}`);
    
    let rpcFailed = false;
    
    try {
      // First try RPC execution
      const result = await supabase.rpc('exec_sql', { sql: fixTableSQL });
      
      if (result.error) {
        throw new Error(`RPC execution failed: ${result.error.message}`);
      }
      
      console.log(`${colors.green}Table fixed successfully via RPC${colors.reset}`);
      
      if (result.data) {
        console.table(result.data);
      }
    } catch (rpcError) {
      rpcFailed = true;
      console.log(`${colors.yellow}RPC exec_sql not available, trying direct SQL...${colors.reset}`);
      
      // Try creating/updating table directly if we have permissions
      try {
        // First check if table exists
        const { error: checkError } = await supabase
          .from('webhook_events')
          .select('id')
          .limit(1);
          
        if (checkError && checkError.code === '42P01') {
          console.log(`${colors.yellow}Table webhook_events doesn't exist, need to create it manually${colors.reset}`);
        } else {
          console.log(`${colors.yellow}Table webhook_events exists, but we need SQL privileges to modify it${colors.reset}`);
        }
      } catch (directError) {
        console.log(`${colors.yellow}Couldn't access table directly either${colors.reset}`);
      }
    }
    
    // If RPC failed, provide SQL to run manually
    if (rpcFailed) {
      console.log(`${colors.yellow}Please run this SQL in the Supabase SQL Editor:${colors.reset}`);
      console.log('----------------------------------------');
      console.log(fixTableSQL);
      console.log('----------------------------------------');
      
      // Also save it to a file for easy reference
      const sqlFilePath = path.join(process.cwd(), 'fix-webhook-table.sql');
      fs.writeFileSync(sqlFilePath, fixTableSQL);
      
      console.log(`${colors.green}SQL has been saved to:${colors.reset} ${sqlFilePath}`);
      console.log('1. Go to your Supabase dashboard: https://app.supabase.com/');
      console.log('2. Select your project');
      console.log('3. Go to the SQL Editor tab');
      console.log('4. Create a new query');
      console.log('5. Copy and paste the SQL above');
      console.log('6. Click "Run" to execute the query');
    }
  } catch (error) {
    console.error(`${colors.red}Error fixing webhook table:${colors.reset}`, error);
    
    // Provide manual instructions as a fallback
    console.log(`${colors.yellow}Please run this SQL in the Supabase SQL Editor:${colors.reset}`);
    console.log('----------------------------------------');
    console.log(fixTableSQL);
    console.log('----------------------------------------');
    
    // Also save it to a file for easy reference
    const sqlFilePath = path.join(process.cwd(), 'fix-webhook-table.sql');
    fs.writeFileSync(sqlFilePath, fixTableSQL);
    
    console.log(`${colors.green}SQL has been saved to:${colors.reset} ${sqlFilePath}`);
  }
}

// Execute the SQL
executeSQL(); 