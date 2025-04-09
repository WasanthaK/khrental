import { supabase } from '../services/supabaseClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute SQL script to update the app_users table to use associated_property_ids as array
 */
const fixAppUsersPropertyIds = async () => {
  try {
    console.log('Starting app_users table fix for associated_property_ids...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'fixAppUsersPropertyIds.sql');
    const sqlQuery = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql: sqlQuery });
    
    if (error) {
      console.error('Error executing SQL:', error);
      
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
    
    console.log('Successfully updated app_users table. The associated_property_ids column is now an array type.');
    
    // Check any rentees that might have invalid associated_property_ids
    const { data: users, error: fetchError } = await supabase
      .from('app_users')
      .select('id, name, associated_property_ids, user_type')
      .eq('user_type', 'rentee');
    
    if (fetchError) {
      console.error('Error fetching rentees:', fetchError);
      return;
    }
    
    const usersWithInvalidIds = users.filter(user => 
      user.associated_property_ids !== null && 
      !Array.isArray(user.associated_property_ids)
    );
    
    if (usersWithInvalidIds.length > 0) {
      console.log(`Found ${usersWithInvalidIds.length} rentees with invalid associated_property_ids. Fixing...`);
      
      for (const user of usersWithInvalidIds) {
        const { error: updateError } = await supabase
          .from('app_users')
          .update({ 
            associated_property_ids: [],
            updatedat: new Date().toISOString()
          })
          .eq('id', user.id);
        
        if (updateError) {
          console.error(`Error fixing rentee ${user.id} (${user.name}):`, updateError);
        } else {
          console.log(`Fixed rentee ${user.id} (${user.name})`);
        }
      }
    } else {
      console.log('No rentees with invalid associated_property_ids found.');
    }
    
    console.log('Process completed.');
  } catch (error) {
    console.error('Unhandled error:', error);
  }
};

// Execute the function immediately
fixAppUsersPropertyIds()
  .then(() => console.log('Done!'))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

export default fixAppUsersPropertyIds; 