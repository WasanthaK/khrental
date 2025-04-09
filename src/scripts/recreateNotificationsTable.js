/**
 * Script to recreate the notifications table with the correct schema
 * Usage: node src/scripts/recreateNotificationsTable.js
 */
import { supabase } from '../config/supabaseClient';
import fs from 'fs';
import path from 'path';

async function recreateNotificationsTable() {
  try {
    console.log('Starting notifications table recreation process');

    // First, check if the table exists
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id')
        .limit(1);
      
      if (!error) {
        console.log('Notifications table exists, dropping it...');
        
        // Drop the existing table
        const { error: dropError } = await supabase.rpc('exec_sql', {
          query: 'DROP TABLE IF EXISTS notifications CASCADE;'
        });
        
        if (dropError) {
          console.error('Error dropping notifications table:', dropError.message);
          return;
        }
        
        console.log('Notifications table dropped successfully');
      } else {
        console.log('Notifications table does not exist or cannot be accessed');
      }
    } catch (checkError) {
      console.log('Error checking for notifications table:', checkError.message);
    }
    
    // Create the notifications table with the correct schema
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID,
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        is_read BOOLEAN DEFAULT FALSE
      );

      -- Create index on common search fields
      CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at);

      -- Create the set_timestamps function if it doesn't exist
      CREATE OR REPLACE FUNCTION set_timestamps()
      RETURNS TRIGGER AS $$
      BEGIN
        -- For new records, set created_at
        IF NEW.created_at IS NULL THEN
          NEW.created_at = NOW();
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Add timestamp trigger
      DROP TRIGGER IF EXISTS set_timestamps_notifications ON notifications;
      CREATE TRIGGER set_timestamps_notifications
      BEFORE INSERT OR UPDATE ON notifications
      FOR EACH ROW
      EXECUTE FUNCTION set_timestamps();

      COMMENT ON TABLE notifications IS 'Stores user notifications';
    `;
    
    try {
      // Execute the create table query
      const { error } = await supabase.rpc('exec_sql', {
        query: createTableQuery
      });
      
      if (error) {
        console.error('Error creating notifications table:', error.message);
        return;
      }
      
      console.log('Notifications table created successfully');
    } catch (createError) {
      console.error('Error executing create table query:', createError.message);
      return;
    }
    
    // Verify the table was created successfully
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id')
        .limit(1);
      
      if (error) {
        console.error('Error accessing notifications table after creation:', error.message);
      } else {
        console.log('Notifications table verified successfully');
      }
    } catch (verifyError) {
      console.error('Error verifying notifications table:', verifyError.message);
    }
    
    console.log('Process completed');
  } catch (error) {
    console.error('Unhandled error:', error);
  }
}

// Run the recreation process
recreateNotificationsTable()
  .catch(error => {
    console.error('Unhandled promise rejection:', error);
  })
  .finally(() => {
    process.exit(0);
  }); 