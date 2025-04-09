/**
 * Script to update missing timestamp fields in all database tables
 * Usage: node src/scripts/updateTimestamps.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

// Check if we have the required environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
  console.error('Please ensure these are set in your .env file or environment');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Function to check if a table has the specified columns
async function checkTableHasColumns(tableName, columnNames) {
  try {
    const { data, error } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = '${tableName}' 
          AND column_name IN (${columnNames.map(col => `'${col}'`).join(',')})
        `
      });
    
    if (error) {
      console.error(`Error checking columns for table ${tableName}:`, error.message);
      return [];
    }
    
    return data.map(row => row.column_name);
  } catch (error) {
    console.error(`Error in checkTableHasColumns for ${tableName}:`, error.message);
    return [];
  }
}

// Function to update timestamps for a table
async function updateTimestamps(tableName) {
  console.log(`Checking table: ${tableName}`);
  
  // Check if the table has createdat and updatedat columns
  const columns = await checkTableHasColumns(tableName, ['createdat', 'updatedat']);
  
  if (columns.length === 0) {
    console.log(`Table ${tableName} doesn't have timestamp columns. Skipping.`);
    return;
  }
  
  let updates = [];
  
  if (columns.includes('createdat')) {
    updates.push(`
      UPDATE ${tableName} 
      SET createdat = NOW() 
      WHERE createdat IS NULL
    `);
  }
  
  if (columns.includes('updatedat')) {
    updates.push(`
      UPDATE ${tableName} 
      SET updatedat = COALESCE(createdat, NOW()) 
      WHERE updatedat IS NULL
    `);
  }
  
  for (const updateSql of updates) {
    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql: updateSql });
      
      if (error) {
        console.error(`Error updating timestamps for ${tableName}:`, error.message);
      } else {
        console.log(`Successfully updated timestamps for ${tableName}`);
      }
    } catch (error) {
      console.error(`Unexpected error updating timestamps for ${tableName}:`, error.message);
    }
  }
}

// Function to get all tables in the public schema
async function getAllTables() {
  try {
    const { data, error } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        `
      });
    
    if (error) {
      console.error('Error fetching tables:', error.message);
      return [];
    }
    
    return data.map(row => row.table_name);
  } catch (error) {
    console.error('Error in getAllTables:', error.message);
    return [];
  }
}

// Main function to update timestamps for all tables
async function updateAllTimestamps() {
  console.log('Starting timestamp update process');
  
  // Check if the exec_sql function exists
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1' });
    if (error && error.message.includes('function "exec_sql" does not exist')) {
      console.error('The exec_sql RPC function does not exist.');
      console.error('Please run the enableExecSql.sql script in your Supabase SQL Editor first.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error checking for exec_sql function:', error.message);
    process.exit(1);
  }
  
  // Get all tables
  const tables = await getAllTables();
  
  if (tables.length === 0) {
    console.error('No tables found or error fetching tables');
    process.exit(1);
  }
  
  console.log(`Found ${tables.length} tables`);
  
  // Update timestamps for each table
  for (const table of tables) {
    await updateTimestamps(table);
  }
  
  console.log('Timestamp update process completed');
}

// Run the function
updateAllTimestamps()
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 