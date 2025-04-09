import { supabase } from './supabaseClient';

/**
 * Checks if the application has the necessary permissions for bucket operations
 * @param {string} bucketName - The bucket to test permissions on
 * @returns {Promise<Object>} Result of permission check
 */
export async function checkBucketPermissions(bucketName = 'files') {
  try {
    const permissions = {};
    
    // Test listing buckets
    const { data: bucketData, error: bucketError } = await supabase.storage.listBuckets();
    permissions.list_buckets = !bucketError;
    
    // Test listing files in bucket
    const { data: listData, error: listError } = await supabase.storage
      .from(bucketName)
      .list();
    permissions.list_files = !listError;
    
    // Test upload permission with a tiny test file
    const testBlob = new Blob(['test'], { type: 'text/plain' });
    const testPath = `permission-test-${Date.now()}.txt`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(testPath, testBlob);
    permissions.upload = !uploadError;
    
    // Test download permission if upload succeeded
    if (permissions.upload) {
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from(bucketName)
        .download(testPath);
      permissions.download = !downloadError;
    } else {
      permissions.download = false;
    }
    
    // Test delete permission if upload succeeded
    if (permissions.upload) {
      const { error: deleteError } = await supabase.storage
        .from(bucketName)
        .remove([testPath]);
      permissions.delete = !deleteError;
    } else {
      permissions.delete = false;
    }
    
    // Calculate overall permission status
    const permissionValues = Object.values(permissions);
    const allPermissionsGranted = permissionValues.every(value => value === true);
    const somePermissionsGranted = permissionValues.some(value => value === true);
    
    return {
      success: true,
      allPermissionsGranted,
      somePermissionsGranted,
      permissions,
      bucketName
    };
  } catch (error) {
    console.error('Error checking bucket permissions:', error);
    return { 
      success: false, 
      error,
      permissions: {
        list_buckets: false,
        list_files: false,
        upload: false,
        download: false,
        delete: false
      }
    };
  }
}

/**
 * Tests file upload functionality with a sample file
 * @param {string} bucketName - The bucket to upload to
 * @returns {Promise<Object>} Test result
 */
export async function testFileUpload(bucketName = 'files') {
  try {
    // Create a sample text file for testing
    const textContent = 'This is a test file created at ' + new Date().toISOString();
    const blob = new Blob([textContent], { type: 'text/plain' });
    const file = new File([blob], 'test-upload.txt', { type: 'text/plain' });
    
    // Try uploading the test file
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(`test-${Date.now()}-test-upload.txt`, file);
    
    if (uploadError) {
      console.error('Test upload failed:', uploadError);
      return { success: false, error: uploadError };
    }
    
    return { 
      success: true, 
      message: 'Test file upload successful',
      data: uploadData
    };
  } catch (error) {
    console.error('Test file upload error:', error);
    return { success: false, error };
  }
}

/**
 * Handles file upload operations to Supabase storage
 * @param {File} file - The file to upload
 * @param {string} bucketName - The bucket name to upload to
 * @returns {Promise<Object>} Result of the operation
 */
export async function uploadFile(file, bucketName) {
  const { data: bucketData, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    throw bucketError;
  }

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(`test-${Date.now()}-${file.name}`, file);

  if (uploadError) {
    throw uploadError;
  }

  const { data: listData, error: listError } = await supabase.storage
    .from(bucketName)
    .list();

  if (listError) {
    throw listError;
  }

  try {
    const { data: finalData, error: finalError } = await supabase.storage.listBuckets();
    if (finalError) {
      throw finalError;
    }
    return { success: true, data: finalData };
  } catch (error) {
    throw error;
  }
}

/**
 * Creates required storage buckets if they don't exist
 * @returns {Promise<Object>} Object containing result of bucket creation operations
 */
export async function createRequiredBuckets() {
  try {
    const requiredBuckets = ['agreements', 'documents', 'files', 'images', 'invoices', 'maintenance'];
    const results = {};
    
    // Get existing buckets
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw listError;
    }
    
    // Extract bucket names
    const existingBucketNames = existingBuckets.map(bucket => bucket.name);
    
    // Create missing buckets
    for (const bucketName of requiredBuckets) {
      if (!existingBucketNames.includes(bucketName)) {
        const { data, error } = await supabase.storage.createBucket(bucketName, {
          public: bucketName === 'images', // Images bucket is public, others are private
          fileSizeLimit: 10485760, // 10MB
        });
        
        results[bucketName] = { created: !error, error };
      } else {
        results[bucketName] = { created: false, exists: true };
      }
    }
    
    return { success: true, results };
  } catch (error) {
    console.error('Error creating buckets:', error);
    return { success: false, error };
  }
}

/**
 * Tests storage bucket functionality
 * @returns {Promise<Object>} Test results for storage buckets
 */
export async function testStorageBuckets() {
  try {
    const results = {
      bucketOperations: {},
      fileOperations: {}
    };
    
    // Step 1: Test listing buckets
    const { data: bucketList, error: listError } = await supabase.storage.listBuckets();
    results.bucketOperations.list = { success: !listError, data: bucketList, error: listError };
    
    if (listError) {
      throw new Error('Cannot list buckets - check storage permissions');
    }
    
    // Step 2: Create a test bucket with a unique name
    const testBucketName = `test-bucket-${Date.now()}`;
    const { data: createData, error: createError } = await supabase.storage.createBucket(testBucketName, {
      public: false,
      fileSizeLimit: 1024 * 1024 // 1MB
    });
    results.bucketOperations.create = { success: !createError, data: createData, error: createError };
    
    if (createError) {
      results.summary = 'Cannot create buckets - check storage permissions';
      return results;
    }
    
    // Step 3: Test basic file operations in the new bucket
    const testContent = 'This is a test file for storage bucket tests - ' + new Date().toISOString();
    const testBlob = new Blob([testContent], { type: 'text/plain' });
    const testFileName = `test-file-${Date.now()}.txt`;
    
    // Upload test file
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(testBucketName)
      .upload(testFileName, testBlob);
    results.fileOperations.upload = { success: !uploadError, data: uploadData, error: uploadError };
    
    // List files
    const { data: filesData, error: filesError } = await supabase.storage
      .from(testBucketName)
      .list();
    results.fileOperations.list = { success: !filesError, data: filesData, error: filesError };
    
    // Download file
    if (!uploadError) {
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from(testBucketName)
        .download(testFileName);
      results.fileOperations.download = { success: !downloadError, error: downloadError };
    }
    
    // Delete file
    if (!uploadError) {
      const { data: deleteData, error: deleteError } = await supabase.storage
        .from(testBucketName)
        .remove([testFileName]);
      results.fileOperations.delete = { success: !deleteError, data: deleteData, error: deleteError };
    }
    
    // Step 4: Delete the test bucket
    const { error: deleteBucketError } = await supabase.storage.deleteBucket(testBucketName);
    results.bucketOperations.delete = { success: !deleteBucketError, error: deleteBucketError };
    
    // Calculate overall success
    const bucketOps = Object.values(results.bucketOperations);
    const fileOps = Object.values(results.fileOperations);
    const allOps = [...bucketOps, ...fileOps];
    
    results.summary = {
      allSuccess: allOps.every(op => op.success === true),
      bucketSuccess: bucketOps.every(op => op.success === true),
      fileSuccess: fileOps.every(op => op.success === true),
      totalOperations: allOps.length,
      successfulOperations: allOps.filter(op => op.success === true).length
    };
    
    return results;
  } catch (error) {
    console.error('Error testing storage buckets:', error);
    return {
      success: false,
      error: error.message || error,
      summary: 'Storage bucket tests failed'
    };
  }
} 