import { getSupabaseClient } from './supabaseClient';
import { STORAGE_BUCKETS, BUCKET_FOLDERS } from './fileService';

const supabase = getSupabaseClient();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Track initialization state
let storageInitialized = false;

const defaultPolicies = {
  'authenticated': {
    insert: true,
    select: true,
    update: true,
    delete: true
  }
};

/**
 * Set up storage policies for a bucket
 * @param {string} bucketName - Name of the bucket to set up policies for
 */
const setupStoragePolicies = async (bucketName) => {
  try {
    console.log(`Setting up storage policies for bucket: ${bucketName}`);

    // First verify the bucket exists and get its current configuration
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }

    const bucket = buckets?.find(b => b.name === bucketName);
    if (!bucket) {
      console.error(`Bucket ${bucketName} not found`);
      return;
    }

    // Now we can safely update the bucket configuration
    const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
          public: true,
      fileSizeLimit: 52428800,
      allowedMimeTypes: bucketName === 'images'
        ? ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        : ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    });

    if (updateError) {
      console.error('Error updating bucket configuration:', updateError);
      return;
    }

    // Use RPC to create policies directly
    const policies = [
      {
        name: `Allow public read access to ${bucketName}`,
        definition: `(bucket_id = '${bucketName}')`,
        operation: 'SELECT'
      },
      {
        name: `Allow authenticated users to upload ${bucketName}`,
        definition: `(bucket_id = '${bucketName}' AND auth.role() = 'authenticated')`,
        operation: 'INSERT'
      },
      {
        name: `Allow authenticated users to update their own ${bucketName}`,
        definition: `(bucket_id = '${bucketName}' AND auth.role() = 'authenticated')`,
        operation: 'UPDATE'
      },
      {
        name: `Allow authenticated users to delete their own ${bucketName}`,
        definition: `(bucket_id = '${bucketName}' AND auth.role() = 'authenticated')`,
        operation: 'DELETE'
      }
    ];

    // Execute each policy creation SQL
    for (const policy of policies) {
      try {
        const { error: policyError } = await supabase.rpc('create_policy', {
          table_name: 'storage.objects',
          policy_name: policy.name,
          definition: policy.definition,
          operation: policy.operation
        });

        if (policyError && !policyError.message?.includes('already exists')) {
          console.error(`Error creating policy ${policy.name}:`, policyError);
        }
      } catch (err) {
        // Ignore policy already exists errors
        if (!err.message?.includes('already exists')) {
          console.error('Error creating policy:', err);
        }
      }
    }

    console.log(`Storage policies set up successfully for bucket: ${bucketName}`);
  } catch (error) {
    console.error('Error setting up storage policies:', error);
  }
};

/**
 * Check if a folder exists in a bucket
 * @param {string} bucketName - Bucket name
 * @param {string} folderPath - Folder path to check
 * @returns {Promise<boolean>} - Whether the folder exists
 */
const folderExists = async (bucketName, folderPath) => {
  try {
    const { data } = await supabase.storage
      .from(bucketName)
      .list(folderPath);
      
    return !!(data && data.length > 0);
  } catch (error) {
    console.error(`Error checking if folder exists (${bucketName}/${folderPath}):`, error);
    return false;
  }
};

/**
 * Verify if a bucket exists and is accessible
 * @param {string} bucketName - Name of the bucket to verify
 * @returns {Promise<boolean>} - Whether the bucket exists and is accessible
 */
const verifyBucketExists = async (bucketName) => {
  try {
    // Try to list the contents of the bucket instead of listing all buckets
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list();
    
    if (error) {
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        return false;
      }
      // For other errors, assume bucket exists to prevent recreation attempts
      console.warn(`Error verifying bucket ${bucketName}:`, error);
      return true;
    }
    
    return true;
  } catch (error) {
    console.warn(`Error verifying bucket ${bucketName}:`, error);
    return false;
  }
};

/**
 * Create a bucket with retries
 * @param {string} bucketName - Name of the bucket to create
 * @param {Object} options - Bucket options
 * @returns {Promise<boolean>} - Whether the bucket was created successfully
 */
const createBucket = async (bucketName, options = {}) => {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // First check if bucket exists using getBucket
      const { data: bucket, error: getBucketError } = await supabase.storage.getBucket(bucketName);
      
      if (bucket) {
        console.log(`Bucket ${bucketName} already exists, skipping creation`);
        return true;
      }

      if (getBucketError && !getBucketError.message?.includes('not found')) {
        throw getBucketError;
      }

      console.log(`Creating bucket: ${bucketName}`);
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: options.public || false,
        fileSizeLimit: options.fileSizeLimit || 52428800,
        allowedMimeTypes: options.allowedMimeTypes || null
      });

      if (!createError) {
        console.log(`Successfully created bucket: ${bucketName}`);
        await delay(2000); // Wait after creation before returning
        return true;
      }

      if (createError.message?.includes('already exists')) {
        console.log(`Bucket ${bucketName} already exists (from create error)`);
        return true;
      }

      throw createError;
    } catch (error) {
      retryCount++;
      console.warn(`Attempt ${retryCount} failed to create bucket ${bucketName}:`, error);
      
      // If bucket already exists, consider it a success
      if (error.message?.includes('already exists')) {
        console.log(`Bucket ${bucketName} already exists (from catch)`);
        return true;
      }
      
      if (retryCount < maxRetries) {
        await delay(2000 * retryCount); // Longer delay between retries
        continue;
      }
      console.error(`Failed to create bucket ${bucketName} after ${maxRetries} attempts:`, error);
      return false;
    }
  }
  return false;
};

/**
 * Update bucket configuration
 * @param {string} bucketName - Name of the bucket to update
 * @param {Object} options - Bucket options
 * @returns {Promise<boolean>} - Whether the configuration was updated successfully
 */
const updateBucketConfig = async (bucketName, options = {}) => {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // First check if bucket exists using getBucket
      const { data: bucket, error: getBucketError } = await supabase.storage.getBucket(bucketName);
      
      if (getBucketError) {
        if (getBucketError.message?.includes('not found')) {
          console.warn(`Bucket ${bucketName} not found, attempting to create it first`);
          const created = await createBucket(bucketName, options);
          if (!created) {
            console.error(`Failed to create bucket ${bucketName}, skipping configuration update`);
            return false;
          }
          // Wait a bit after creation before updating config
          await delay(2000);
        } else {
          throw getBucketError;
        }
      }

      console.log(`Updating configuration for bucket: ${bucketName}`);
      const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
        public: options.public ?? false,
        fileSizeLimit: options.fileSizeLimit ?? 52428800,
        allowedMimeTypes: options.allowedMimeTypes ?? null
      });

      if (!updateError) {
        console.log(`Successfully updated configuration for bucket: ${bucketName}`);
        return true;
      }

      throw updateError;
    } catch (error) {
      retryCount++;
      console.warn(`Attempt ${retryCount} failed to update bucket ${bucketName} configuration:`, error);
      
      if (retryCount < maxRetries) {
        await delay(2000 * retryCount);
        continue;
      }
      console.error(`Failed to update bucket ${bucketName} configuration after ${maxRetries} attempts:`, error);
      return false;
    }
  }
  return false;
};

/**
 * Initialize storage buckets and folders
 */
export async function initializeStorage() {
  try {
    console.log('Initializing storage...');
    
    // Skip bucket verification if no active session to prevent 401 errors
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.log('Session error during storage initialization, continuing in limited mode');
      return { success: true, isStorageError: true, error: "Authentication required for full storage functionality" };
    }
    
    if (!session) {
      console.log('No active session, skipping storage initialization');
      return { success: true, isStorageError: true, error: "Authentication required for storage functionality" };
    }

    // Only check bucket existence, don't try to create any buckets
    const missingBuckets = [];
    
    // Check all required buckets - just verify they exist
    for (const bucketName of Object.values(STORAGE_BUCKETS)) {
      try {
        console.log(`Verifying bucket: ${bucketName}`);
        
        // Try to list the contents of the bucket to check if it exists
        const { data, error } = await supabase.storage
          .from(bucketName)
          .list('', { limit: 1 });
        
        if (error) {
          console.log(`Bucket ${bucketName} is not accessible or does not exist`);
          missingBuckets.push(bucketName);
          continue;
        }
        
        console.log(`Bucket ${bucketName} exists and is accessible`);
        
        // Try to create folder structure in existing buckets only
        if (data !== null) {
          const folders = BUCKET_FOLDERS[bucketName] || [];
          for (const folder of folders) {
            try {
              // Check if folder already exists first
              const { data: folderData, error: folderListError } = await supabase.storage
                .from(bucketName)
                .list(folder);
                
              if (folderListError) {
                console.log(`Could not check if folder ${folder} exists in ${bucketName}: ${folderListError.message}`);
              } else if (!folderData || folderData.length === 0) {
                // Only create the folder if it doesn't exist
                const folderPath = `${folder}/.keep`;
                const { error: uploadError } = await supabase.storage
                  .from(bucketName)
                  .upload(folderPath, new Blob([''], { type: 'text/plain' }), {
                    upsert: true
                  });
                  
                if (uploadError) {
                  console.log(`Error creating folder ${folder} in ${bucketName}: ${uploadError.message || 'Unknown error'}`);
                } else {
                  console.log(`Created folder ${folder} in ${bucketName}`);
                }
              }
            } catch (folderError) {
              console.log(`Error handling folder ${folder} in ${bucketName}: ${folderError.message || 'Unknown error'}`);
            }
          }
        }
      } catch (bucketError) {
        console.error(`Error checking bucket ${bucketName}:`, bucketError);
        missingBuckets.push(bucketName);
      }
    }
    
    // Return warning if any buckets are missing
    if (missingBuckets.length > 0) {
      const warningMessage = `The following storage buckets need to be created manually by an admin: ${missingBuckets.join(', ')}`;
      console.warn(warningMessage);
      return { 
        success: true, 
        isStorageError: true,
        error: warningMessage
      };
    }
    
    console.log('Storage initialization completed successfully');
    return { success: true };
  } catch (error) {
    console.error('Error initializing storage:', error);
    return { 
      success: true, // Return success but with error info
      isStorageError: true,
      error: error.message || 'Unknown storage initialization error'
    };
  }
}

// Export the initialization function
export const initializeApp = async () => {
  try {
    const storageResult = await initializeStorage();
    if (!storageResult.success) {
      throw new Error(storageResult.error);
    }
    return { success: true };
  } catch (error) {
    console.error('Error during app initialization:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Add a function to force re-initialization if needed (e.g. for admin purposes)
export const forceStorageReinitialization = () => {
  storageInitialized = false;
}; 