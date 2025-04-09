import { supabase } from './supabaseClient';

/**
 * A simple function to test Supabase storage buckets
 * To be called from the console for testing
 */
export async function testStorageBuckets() {
  console.log('Testing Supabase storage buckets...');
  
  try {
    // List all buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    console.log('Available buckets:', buckets);
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
      return {
        success: false,
        error: bucketsError,
        message: 'Failed to list buckets'
      };
    }
    
    if (!buckets || buckets.length === 0) {
      console.error('No storage buckets found! Please create buckets in Supabase dashboard.');
      return {
        success: false,
        buckets: [],
        message: 'No storage buckets found'
      };
    }
    
    // Get bucket details
    const bucketDetails = [];
    
    for (const bucket of buckets) {
      console.log(`Testing bucket: ${bucket.name}`);
      
      try {
        // List contents of the bucket
        const { data: files, error: listError } = await supabase.storage
          .from(bucket.name)
          .list();
        
        if (listError) {
          console.error(`Error listing files in bucket ${bucket.name}:`, listError);
          bucketDetails.push({
            name: bucket.name,
            public: bucket.public,
            error: listError.message,
            status: 'error'
          });
        } else {
          console.log(`Files in ${bucket.name}:`, files);
          bucketDetails.push({
            name: bucket.name,
            public: bucket.public,
            filesCount: files?.length || 0,
            status: 'accessible'
          });
        }
      } catch (e) {
        console.error(`Error testing bucket ${bucket.name}:`, e);
        bucketDetails.push({
          name: bucket.name,
          public: bucket.public,
          error: e.message,
          status: 'error'
        });
      }
    }
    
    return {
      success: bucketDetails.some(b => b.status === 'accessible'),
      buckets: bucketDetails,
      message: bucketDetails.some(b => b.status === 'accessible') 
        ? 'Some storage buckets are accessible' 
        : 'All storage buckets have access issues'
    };
  } catch (error) {
    console.error('Error testing storage buckets:', error);
    return {
      success: false,
      error,
      message: 'Error testing storage buckets'
    };
  }
}

/**
 * Tests uploading a small file to the available bucket
 */
export async function testFileUpload() {
  console.log('Testing file upload to Supabase storage...');
  
  try {
    // Create a small test file (1x1 pixel transparent PNG)
    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const testFile = new Blob([byteArray], { type: 'image/png' });
    const testFilePath = `test/test-upload-${Date.now()}.png`;
    
    console.log(`Trying to upload test file to a bucket...`);
    
    // First get available buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
      return {
        success: false,
        error: bucketsError,
        message: 'Failed to list buckets'
      };
    }
    
    if (!buckets || buckets.length === 0) {
      console.error('No storage buckets found!');
      return {
        success: false,
        buckets: [],
        message: 'No storage buckets found to upload to'
      };
    }
    
    // Try to use the 'images' bucket first, then fall back to the first available bucket
    const imagesBucket = buckets.find(b => b.name === 'images');
    const bucketToUse = imagesBucket ? 'images' : buckets[0].name;
    
    console.log(`Using bucket "${bucketToUse}" for test upload`);
    
    const { data, error } = await supabase.storage
      .from(bucketToUse)
      .upload(testFilePath, testFile);
    
    if (error) {
      console.error(`Error uploading test file to ${bucketToUse}:`, error);
      
      // If the first attempt failed and we weren't already using an alternate bucket, try another one
      if (!imagesBucket && buckets.length > 1) {
        const alternateBucket = buckets[1].name;
        console.log(`First upload failed, trying alternate bucket "${alternateBucket}"...`);
        
        const { data: altData, error: altError } = await supabase.storage
          .from(alternateBucket)
          .upload(testFilePath, testFile);
          
        if (altError) {
          return {
            success: false,
            error: altError,
            message: `Failed to upload test file to all buckets: ${error.message}, ${altError.message}`
          };
        }
        
        // Continue with the alternate bucket for URL and cleanup
        const { data: altUrlData } = supabase.storage
          .from(alternateBucket)
          .getPublicUrl(testFilePath);
          
        if (!altUrlData || !altUrlData.publicUrl) {
          return {
            success: false,
            error: 'Failed to get public URL from alternate bucket',
            message: `Test file uploaded to ${alternateBucket} but failed to get public URL`
          };
        }
        
        // Clean up the test file
        const { error: altDeleteError } = await supabase.storage
          .from(alternateBucket)
          .remove([testFilePath]);
          
        return {
          success: true,
          cleanup: !altDeleteError,
          bucketUsed: alternateBucket,
          publicUrl: altUrlData.publicUrl,
          message: `Test file upload and ${altDeleteError ? 'partial' : 'full'} cleanup successful using bucket "${alternateBucket}"`
        };
      }
      
      return {
        success: false,
        error,
        message: `Failed to upload test file to ${bucketToUse}: ${error.message}`
      };
    }
    
    console.log('Test file uploaded successfully:', data);
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketToUse)
      .getPublicUrl(testFilePath);
    
    console.log('Public URL for test file:', urlData?.publicUrl);
    
    // Check if we got a valid URL
    if (!urlData || !urlData.publicUrl) {
      return {
        success: false,
        error: 'Failed to get public URL',
        message: `Test file uploaded to ${bucketToUse} but failed to get public URL`
      };
    }
    
    // Now try to delete the test file
    const { error: deleteError } = await supabase.storage
      .from(bucketToUse)
      .remove([testFilePath]);
    
    if (deleteError) {
      console.error('Error deleting test file:', deleteError);
      return {
        success: true,
        cleanup: false,
        bucketUsed: bucketToUse,
        publicUrl: urlData.publicUrl,
        message: 'Test file uploaded successfully but cleanup failed'
      };
    }
    
    console.log('Test file deleted successfully');
    
    return {
      success: true,
      cleanup: true,
      bucketUsed: bucketToUse,
      message: `Test file upload and delete successful using bucket "${bucketToUse}"`
    };
  } catch (error) {
    console.error('Error in file upload test:', error);
    return {
      success: false,
      error,
      message: 'Error in file upload test'
    };
  }
}

/**
 * Checks the permissions and configuration of storage buckets
 */
export async function checkBucketPermissions() {
  console.log('Checking storage bucket permissions...');
  
  try {
    // Step 1: List all buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
      return {
        success: false,
        error: bucketsError,
        message: `Failed to list buckets: ${bucketsError.message}`
      };
    }
    
    if (!buckets || buckets.length === 0) {
      return {
        success: false,
        buckets: [],
        message: 'No storage buckets found'
      };
    }
    
    // Step 2: Check bucket permissions
    const bucketPermissions = [];
    
    for (const bucket of buckets) {
      try {
        // Try to list files (checks READ permission)
        const { data: fileList, error: listError } = await supabase.storage
          .from(bucket.name)
          .list();
        
        // Base permission object
        const permission = {
          name: bucket.name,
          public: bucket.public,
          read: !listError,
          write: null,
          readError: listError?.message,
          writeError: null
        };
        
        // Try to upload a tiny test file (checks WRITE permission)
        if (!listError) {
          // Create a 1 byte file
          const testFile = new Blob([new Uint8Array(1)], { type: 'application/octet-stream' });
          const testPath = `_permissions_test_${Date.now()}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucket.name)
            .upload(testPath, testFile);
          
          permission.write = !uploadError;
          permission.writeError = uploadError?.message;
          
          // If upload succeeded, clean up
          if (!uploadError) {
            await supabase.storage
              .from(bucket.name)
              .remove([testPath]);
          }
        }
        
        bucketPermissions.push(permission);
      } catch (error) {
        bucketPermissions.push({
          name: bucket.name,
          public: bucket.public,
          read: false,
          write: false,
          error: error.message
        });
      }
    }
    
    // Check if at least one bucket has both read and write permissions
    const hasValidBucket = bucketPermissions.some(bucket => bucket.read && bucket.write);
    
    return {
      success: hasValidBucket,
      buckets: bucketPermissions,
      message: hasValidBucket 
        ? 'Found at least one bucket with proper permissions' 
        : 'No buckets have both read and write permissions'
    };
  } catch (error) {
    console.error('Error checking bucket permissions:', error);
    return {
      success: false,
      error,
      message: `Error checking storage buckets: ${error.message}`
    };
  }
}

/**
 * Creates the required storage buckets if they don't exist
 */
export async function createRequiredBuckets() {
  console.log('Creating required storage buckets...');
  
  const requiredBuckets = [
    'images',
    'files'
  ];
  
  try {
    // List existing buckets
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
      return {
        success: false,
        error: listError,
        message: 'Failed to list existing buckets'
      };
    }
    
    const existingBucketNames = existingBuckets.map(b => b.name);
    const bucketsToCreate = requiredBuckets.filter(name => !existingBucketNames.includes(name));
    
    if (bucketsToCreate.length === 0) {
      return {
        success: true,
        message: 'All required buckets already exist'
      };
    }
    
    // Create missing buckets
    for (const bucketName of bucketsToCreate) {
      console.log(`Creating bucket: ${bucketName}`);
      
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 52428800 // 50MB
      });
      
      if (createError) {
        console.error(`Error creating bucket ${bucketName}:`, createError);
        return {
          success: false,
          error: createError,
          message: `Failed to create bucket ${bucketName}`
        };
      }
    }
    
    return {
      success: true,
      message: `Successfully created ${bucketsToCreate.length} bucket(s)`
    };
  } catch (error) {
    console.error('Error creating buckets:', error);
    return {
      success: false,
      error,
      message: 'Error creating storage buckets'
    };
  }
}

// Export functions for console testing
window.testStorageBuckets = testStorageBuckets;
window.testFileUpload = testFileUpload;
window.checkBucketPermissions = checkBucketPermissions; 