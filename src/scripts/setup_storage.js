import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { STORAGE_BUCKETS, BUCKET_FOLDERS } from '../services/fileService.js';

const setupStorage = async () => {
  try {
    console.log('Setting up storage buckets and folders...');

    // Create buckets if they don't exist
    for (const bucketName of Object.values(STORAGE_BUCKETS)) {
      console.log(`Checking bucket: ${bucketName}`);
      const { data: bucket, error: getBucketError } = await supabaseAdmin.storage.getBucket(bucketName);
      
      if (getBucketError && getBucketError.message !== 'Bucket not found') {
        throw getBucketError;
      }

      if (!bucket) {
        const { data, error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
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
    }

    // Create folders in each bucket
    for (const [bucketName, folders] of Object.entries(BUCKET_FOLDERS)) {
      for (const folderPath of Object.values(folders)) {
        console.log(`Checking folder: ${bucketName}/${folderPath}`);
        
        // List the folder to see if it exists
        const { data: folderContents, error: listError } = await supabaseAdmin.storage
          .from(bucketName)
          .list(folderPath);
          
        if (listError && listError.message !== 'NoSuchKey') {
          throw listError;
        }

        // If we can list the contents, the folder exists
        if (folderContents) {
          console.log(`Folder already exists: ${bucketName}/${folderPath}`);
          continue;
        }

        // Create an empty file to ensure the folder exists
        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucketName)
          .upload(`${folderPath}/.keep`, new Uint8Array(0), {
            contentType: 'text/plain'
          });

        if (uploadError && !uploadError.message?.includes('already exists')) {
          throw uploadError;
        }

        console.log(`Created folder: ${bucketName}/${folderPath}`);
      }
    }

    console.log('Storage setup completed successfully');
  } catch (error) {
    console.error('Error setting up storage:', error);
    process.exit(1);
  }
};

setupStorage(); 