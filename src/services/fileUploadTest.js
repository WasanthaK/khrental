import { supabase } from './supabaseClient';

/**
 * Test storage buckets functionality
 * @returns {Promise<Object>} Test results
 */
export const testStorageBuckets = async () => {
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error testing storage buckets:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Test file upload functionality
 * @param {string} bucketName - Name of the bucket to upload to
 * @param {File} file - File to upload
 * @returns {Promise<Object>} Upload results
 */
export const testFileUpload = async (bucketName, file) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(`test-${Date.now()}-${file.name}`, file);
    
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error testing file upload:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Check bucket permissions
 * @param {string} bucketName - Name of the bucket to check
 * @returns {Promise<Object>} Permission check results
 */
export const checkBucketPermissions = async (bucketName) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list();
    
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error checking bucket permissions:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Create required storage buckets if they don't exist
 * @returns {Promise<Object>} Creation results
 */
export const createRequiredBuckets = async () => {
  const requiredBuckets = ['agreements', 'documents', 'images', 'utility-readings'];
  const results = [];
  
  for (const bucketName of requiredBuckets) {
    try {
      const { data, error } = await supabase.storage.createBucket(bucketName, {
        public: false,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      });
      
      if (error) {
        if (error.message.includes('already exists')) {
          results.push({ bucketName, success: true, message: 'Bucket already exists' });
        } else {
          throw error;
        }
      } else {
        results.push({ bucketName, success: true, message: 'Bucket created successfully' });
      }
    } catch (error) {
      console.error(`Error creating bucket ${bucketName}:`, error);
      results.push({ bucketName, success: false, error: error.message });
    }
  }
  
  return results;
}; 