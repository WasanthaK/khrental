import { supabase } from '../services/supabaseClient';

const BUCKET_CONFIGS = {
  'images': {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    fileSizeLimit: 52428800, // 50MB
    folders: ['properties', 'maintenance', 'utility-readings']
  },
  'files': {
    public: true,
    allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    fileSizeLimit: 52428800, // 50MB
    folders: ['agreements', 'id-copies', 'documents', 'payment-proofs']
  }
};

async function setupStorageBuckets() {
  console.log('Starting storage bucket setup...');

  try {
    // List existing buckets
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
      throw listError;
    }

    console.log('Existing buckets:', existingBuckets);

    // Create or update each bucket
    for (const [bucketName, config] of Object.entries(BUCKET_CONFIGS)) {
      const existingBucket = existingBuckets.find(b => b.name === bucketName);
      
      if (existingBucket) {
        console.log(`Bucket ${bucketName} already exists, updating configuration...`);
        
        // Update bucket configuration
        const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
          public: config.public,
          allowedMimeTypes: config.allowedMimeTypes,
          fileSizeLimit: config.fileSizeLimit
        });

        if (updateError) {
          console.error(`Error updating bucket ${bucketName}:`, updateError);
          throw updateError;
        }
      } else {
        console.log(`Creating new bucket ${bucketName}...`);
        
        // Create new bucket
        const { error: createError } = await supabase.storage.createBucket(bucketName, {
          public: config.public,
          allowedMimeTypes: config.allowedMimeTypes,
          fileSizeLimit: config.fileSizeLimit
        });

        if (createError) {
          console.error(`Error creating bucket ${bucketName}:`, createError);
          throw createError;
        }
      }

      // Create folder structure
      for (const folder of config.folders) {
        console.log(`Creating folder ${folder} in bucket ${bucketName}...`);
        
        // Create a dummy file to ensure the folder exists
        const dummyFile = new Blob([''], { type: 'text/plain' });
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(`${folder}/.folder`, dummyFile, {
            contentType: 'text/plain',
            upsert: true
          });

        if (uploadError) {
          console.error(`Error creating folder ${folder} in bucket ${bucketName}:`, uploadError);
          throw uploadError;
        }
      }
    }

    console.log('Storage bucket setup completed successfully!');
    
    // List final bucket configuration
    const { data: finalBuckets, error: finalListError } = await supabase.storage.listBuckets();
    
    if (finalListError) {
      console.error('Error listing final bucket configuration:', finalListError);
      throw finalListError;
    }

    console.log('Final bucket configuration:', finalBuckets);

  } catch (error) {
    console.error('Storage bucket setup failed:', error);
    throw error;
  }
}

// Run the setup
setupStorageBuckets().catch(console.error); 