import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables manually
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Log available environment variables (without showing sensitive values)
console.log('Environment variables loaded. Available keys:', Object.keys(process.env));

// Set up Supabase client with service role key
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vcorwfilylgtvzktszvi.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  console.error('Please create a .env file in the root directory with the following content:');
  console.error('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here');
  process.exit(1);
}

console.log(`Connecting to Supabase at ${supabaseUrl}`);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Define storage buckets
const STORAGE_BUCKETS = {
  IMAGES: 'images',
  FILES: 'files'
};

// Define bucket folders
const BUCKET_FOLDERS = {
  [STORAGE_BUCKETS.IMAGES]: {
    PROPERTIES: 'properties',
    MAINTENANCE: 'maintenance',
    UTILITY_READINGS: 'utility-readings'
  },
  [STORAGE_BUCKETS.FILES]: {
    AGREEMENTS: 'agreements',
    ID_COPIES: 'id-copies',
    DOCUMENTS: 'documents',
    PAYMENT_PROOFS: 'payment-proofs'
  }
};

const setupStorage = async () => {
  try {
    console.log('Setting up storage buckets and folders...');

    // Create buckets if they don't exist
    for (const bucketName of Object.values(STORAGE_BUCKETS)) {
      console.log(`Checking bucket: ${bucketName}`);
      
      try {
        const { data: bucket, error: getBucketError } = await supabase.storage.getBucket(bucketName);
        
        if (getBucketError) {
          console.log(`Bucket ${bucketName} not found, creating...`);
          const { data, error: createError } = await supabase.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: bucketName === STORAGE_BUCKETS.IMAGES ? 5242880 : 10485760 // 5MB for images, 10MB for files
          });

          if (createError) {
            throw createError;
          }
          
          console.log(`Created bucket: ${bucketName}`);
        } else {
          console.log(`Bucket already exists: ${bucketName}`);
        }
      } catch (error) {
        console.error(`Error checking/creating bucket ${bucketName}:`, error);
      }
    }

    // Create folders in each bucket
    for (const [bucketName, folders] of Object.entries(BUCKET_FOLDERS)) {
      for (const folderPath of Object.values(folders)) {
        console.log(`Checking folder: ${bucketName}/${folderPath}`);
        
        try {
          // Create an empty file to ensure the folder exists
          const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(`${folderPath}/.keep`, new Uint8Array(0), {
              contentType: 'text/plain',
              upsert: true
            });

          if (uploadError) {
            console.error(`Error creating folder ${bucketName}/${folderPath}:`, uploadError);
          } else {
            console.log(`Created/verified folder: ${bucketName}/${folderPath}`);
          }
        } catch (error) {
          console.error(`Error with folder ${bucketName}/${folderPath}:`, error);
        }
      }
    }

    console.log('Storage setup completed successfully');
  } catch (error) {
    console.error('Error setting up storage:', error);
    process.exit(1);
  }
};

// Run the setup
setupStorage(); 