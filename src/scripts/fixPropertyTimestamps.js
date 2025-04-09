/**
 * Script to fix missing timestamp fields in the properties table
 * Usage: node src/scripts/fixPropertyTimestamps.js
 */
import { supabase } from '../services/supabaseClient';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

async function fixPropertyTimestamps() {
  try {
    console.log('Starting properties table timestamp fix process');
    
    // Fetch all properties
    const { data, error } = await supabase
      .from('properties')
      .select('id, createdat, updatedat');
      
    if (error) {
      console.error('Error fetching properties:', error);
      return;
    }
    
    console.log(`Found ${data.length} properties`);
    
    // Count records with missing timestamps
    const missingCreatedAt = data.filter(record => !record.createdat).length;
    const missingUpdatedAt = data.filter(record => !record.updatedat).length;
    
    console.log(`Properties with missing createdat: ${missingCreatedAt}`);
    console.log(`Properties with missing updatedat: ${missingUpdatedAt}`);
    
    if (missingCreatedAt === 0 && missingUpdatedAt === 0) {
      console.log('No timestamp updates needed for properties');
      return;
    }
    
    // Update records with missing timestamps
    const now = new Date().toISOString();
    let updatedCount = 0;
    
    for (const record of data) {
      if (!record.createdat || !record.updatedat) {
        const updates = {
          ...(record.createdat ? {} : { createdat: now }),
          ...(record.updatedat ? {} : { updatedat: record.createdat || now })
        };
        
        const { error: updateError } = await supabase
          .from('properties')
          .update(updates)
          .eq('id', record.id);
          
        if (updateError) {
          console.error(`Error updating property ${record.id}:`, updateError);
        } else {
          updatedCount++;
        }
      }
    }
    
    console.log(`Updated ${updatedCount} properties with timestamp fields`);
    console.log('Process completed');
  } catch (error) {
    console.error('Unhandled error:', error);
  }
}

// Run the fix process
fixPropertyTimestamps()
  .catch(error => {
    console.error('Unhandled promise rejection:', error);
  })
  .finally(() => {
    process.exit(0);
  }); 