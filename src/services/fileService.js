import { supabase } from './supabaseClient.js';
import { isDefinedValue } from '../utils/validators.js';

// Storage buckets
const STORAGE_BUCKETS = {
  IMAGES: 'images',
  FILES: 'files'
};

// Folder structure for each bucket - matches exactly what exists in Supabase storage
const BUCKET_FOLDERS = {
  [STORAGE_BUCKETS.IMAGES]: [
    'id-copies',
    'maintenance',
    'properties',
    'utility-readings'
  ],
  [STORAGE_BUCKETS.FILES]: [
    'agreements',
    'documents',
    'id-copies',
    'payment-proofs'
  ]
};

// Backward compatibility for STORAGE_CATEGORIES
const STORAGE_CATEGORIES = {
  // Images bucket categories
  ID_COPIES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: 'id-copies'
  },
  MAINTENANCE: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: 'maintenance'
  },
  PROPERTIES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: 'properties'
  },
  UTILITY_READINGS: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: 'utility-readings'
  },
  
  // Files bucket categories
  AGREEMENTS: {
    bucket: STORAGE_BUCKETS.FILES,
    folder: 'agreements'
  },
  DOCUMENTS: {
    bucket: STORAGE_BUCKETS.FILES,
    folder: 'documents'
  },
  FILE_ID_COPIES: {
    bucket: STORAGE_BUCKETS.FILES,
    folder: 'id-copies'
  },
  PAYMENT_PROOFS: {
    bucket: STORAGE_BUCKETS.FILES,
    folder: 'payment-proofs'
  },

  // Legacy mappings (if any were using different names)
  PROPERTY_IMAGES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: 'properties'
  },
  MAINTENANCE_IMAGES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: 'maintenance'
  }
};

// Default bucket to use if none specified
const DEFAULT_BUCKET = STORAGE_BUCKETS.IMAGES;

// Add this helper function to check if storage is properly initialized
let _storageStatus = {
  checked: false,
  available: false,
  buckets: {}
};

/**
 * Checks if storage functionality is available and specific buckets exist
 * @param {string} bucketName - Optional bucket to check specifically
 * @returns {Promise<boolean>} - Whether storage and the specified bucket are available
 */
const isStorageAvailable = async (bucketName = null) => {
  // If we've already checked and no specific bucket is requested
  if (_storageStatus.checked && !bucketName) {
    return _storageStatus.available;
  }
  
  // If we're checking a specific bucket we've already verified
  if (_storageStatus.checked && bucketName && _storageStatus.buckets[bucketName] !== undefined) {
    return _storageStatus.buckets[bucketName];
  }
  
  try {
    // Try to list buckets - this will fail if storage is not configured correctly
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Storage is not available:', listError.message);
      _storageStatus.checked = true;
      _storageStatus.available = false;
      return false;
    }
    
    // Storage is available, now check specific buckets
    _storageStatus.available = true;
    
    // Create a map of bucket availability
    if (Array.isArray(buckets)) {
      for (const bucket of buckets) {
        _storageStatus.buckets[bucket.name] = true;
      }
    }
    
    _storageStatus.checked = true;
    
    // If checking a specific bucket
    if (bucketName) {
      const bucketExists = _storageStatus.buckets[bucketName] === true;
      if (!bucketExists) {
        console.log(`Bucket ${bucketName} does not exist or is not accessible`);
      }
      return bucketExists;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking storage availability:', error);
    _storageStatus.checked = true;
    _storageStatus.available = false;
    return false;
  }
};

/**
 * Reset the storage status cache to force a fresh check
 */
const resetStorageStatusCache = () => {
  _storageStatus = {
    checked: false,
    available: false,
    buckets: {}
  };
};

/**
 * Helper function to ensure we have a valid session before making storage requests
 */
const ensureAuthSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    throw new Error('No valid authentication session found. Please log in again.');
  }
  return session;
};

/**
 * Validates file upload parameters
 * @param {File} file - The file to validate
 * @param {string} bucket - The bucket name
 * @param {string} folder - The folder path
 * @returns {{isValid: boolean, error: string|null}} - Validation result
 */
const validateFileUpload = (file, bucket, folder) => {
  if (!file || !(file instanceof File)) {
    return { isValid: false, error: 'Invalid file object provided' };
  }

  if (!isDefinedValue(bucket) || !Object.values(STORAGE_BUCKETS).includes(bucket)) {
    return { isValid: false, error: `Invalid bucket: ${bucket}` };
  }

  if (!isDefinedValue(folder)) {
    return { isValid: false, error: 'Invalid folder path' };
  }

  return { isValid: true, error: null };
};

/**
 * Save a file to storage with improved validation and error handling
 * @param {File} file - The file to save
 * @param {Object} options - Upload options
 * @param {string} options.bucket - The bucket to save to
 * @param {string} options.folder - The folder path within the bucket
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
const saveFile = async (file, { bucket, folder }) => {
  try {
    // Validate parameters
    const validation = validateFileUpload(file, bucket, folder);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // Check if storage and the specific bucket are available
    const isAvailable = await isStorageAvailable(bucket);
    if (!isAvailable) {
      return { 
        success: false, 
        error: `Storage bucket "${bucket}" is not available. Please contact an administrator to set up the required storage buckets.`
      };
    }

    // Ensure we have a valid session
    await ensureAuthSession();

    const fileExt = file.name.split('.').pop().toLowerCase();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    // Set appropriate content type
    const contentType = file.type || 'application/octet-stream';

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType
      });

    if (uploadError) {
      console.error(`Error uploading to ${bucket}/${filePath}:`, uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return {
      success: true,
      url: publicUrl
    };
  } catch (error) {
    console.error('Error saving file:', error);
    return {
      success: false,
      error: error.message || 'Failed to save file'
    };
  }
};

/**
 * Upload a file to storage (legacy method, use saveFile instead)
 * @param {File} file - The file to upload
 * @param {string} bucket - The storage bucket name
 * @param {string} path - The path within the bucket
 * @returns {Promise<{data: Object, error: Error}>}
 * @deprecated Use saveFile instead
 */
const uploadFile = async (file, bucket, path) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file);

    if (error) { throw error; }
    return { data, error: null };
  } catch (error) {
    console.error('Error uploading file:', error);
    return { data: null, error };
  }
};

/**
 * Get a public URL for a file
 * @param {string} bucket - The storage bucket name
 * @param {string} path - The path within the bucket
 * @returns {Promise<{url: string, error: Error}>}
 */
const getFileUrl = async (bucket, path) => {
  try {
    const { data: { publicUrl }, error } = await supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    if (error) { throw error; }
    return { url: publicUrl, error: null };
  } catch (error) {
    console.error('Error getting file URL:', error);
    return { url: null, error };
  }
};

/**
 * Delete a file from storage with improved validation
 * @param {string} bucket - The storage bucket name
 * @param {string} path - The path within the bucket
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
const deleteFile = async (bucket, path) => {
  try {
    if (!isDefinedValue(bucket) || !isDefinedValue(path)) {
      return { success: false, error: new Error('Invalid bucket or path') };
    }

    // Ensure we have a valid session
    await ensureAuthSession();

    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) { throw error; }
    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting file:', error);
    return { success: false, error };
  }
};

/**
 * List files in a bucket/folder with improved validation
 * @param {string} bucket - The storage bucket name
 * @param {string} path - Optional path within the bucket
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
const listFiles = async (bucket, path = '') => {
  try {
    if (!isDefinedValue(bucket)) {
      return { data: null, error: new Error('Invalid bucket') };
    }

    // Ensure we have a valid session
    await ensureAuthSession();

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path);

    if (error) { throw error; }
    return { data, error: null };
  } catch (error) {
    console.error('Error listing files:', error);
    return { data: null, error };
  }
};

/**
 * Clean up unused files with improved validation and error handling
 * @param {Object|string} category - Category from STORAGE_CATEGORIES or a string folder name
 * @param {string[]} usedUrls - Array of URLs that are still in use
 * @param {string} [bucketName] - Optional bucket name override
 * @returns {Promise<{deleted: number, errors: number, skipped: number}>}
 */
const cleanupUnusedFiles = async (category, usedUrls, bucketName = null) => {
  try {
    // Ensure we have a valid session
    await ensureAuthSession();

    if (!Array.isArray(usedUrls)) {
      throw new Error('usedUrls must be an array');
    }

    // Determine which bucket to use
    const targetBucket = bucketName || (
      typeof category === 'object' && category?.bucket 
        ? category.bucket 
        : DEFAULT_BUCKET
    );

    if (!Object.values(STORAGE_BUCKETS).includes(targetBucket)) {
      throw new Error(`Invalid bucket: ${targetBucket}`);
    }
    
    // List all files in the category
    const { data: files, error: listError } = await listFiles(targetBucket);
    
    if (listError) {
      throw listError;
    }

    if (!files) {
      return { deleted: 0, errors: 0, skipped: 0 };
    }
    
    // Convert usedUrls to paths for comparison
    const usedPaths = usedUrls
      .filter(url => isDefinedValue(url))
      .map(url => {
        if (url.includes('/storage/v1/object/public/')) {
          const match = url.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)/);
          return match && match[1] === targetBucket ? match[2] : '';
        }
        
        if (url.includes(`/${targetBucket}/`)) {
          return url.split(`/${targetBucket}/`)[1] || '';
        }
        
        return url.includes('/') && !url.includes('://') ? url : '';
      })
      .filter(path => path);
    
    // Find files that are not in usedPaths
    const filesToDelete = files.filter(item => !usedPaths.includes(item.name));
    
    let deleted = 0;
    let errors = 0;
    let skipped = 0;
    
    // Delete unused files
    for (const item of filesToDelete) {
      try {
        const { error } = await supabase.storage
          .from(targetBucket)
          .remove([item.name]);
        
        if (error) {
          console.error(`Error deleting file ${item.name}:`, error);
          errors++;
        } else {
          deleted++;
        }
      } catch (error) {
        console.error(`Error deleting file ${item.name}:`, error);
        errors++;
      }
    }
    
    return { deleted, errors, skipped: files.length - filesToDelete.length };
  } catch (error) {
    console.error('Error cleaning up files:', error);
    return { deleted: 0, errors: 1, skipped: 0 };
  }
};

/**
 * Determines which bucket should be used based on file type and category
 * @param {File} file - The file to analyze
 * @param {Object|string} category - The category object from STORAGE_CATEGORIES or a string folder name
 * @returns {string} - The bucket name to use
 */
const determineBucket = (file, category) => {
  // If the category specifies a bucket, use that
  if (category && category.bucket) {
    return category.bucket;
  }
  
  // If it's a string category (legacy), try to determine the bucket
  if (typeof category === 'string') {
    // Check if the category exists in BUCKET_FOLDERS.IMAGES
    const isInImages = Object.values(BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES])
      .includes(category) || Object.values(BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES])
      .includes(category.replace('_', '-'));

    if (isInImages) {
      return STORAGE_BUCKETS.IMAGES;
    }

    // Check if the category exists in BUCKET_FOLDERS.FILES
    const isInFiles = Object.values(BUCKET_FOLDERS[STORAGE_BUCKETS.FILES])
      .includes(category) || Object.values(BUCKET_FOLDERS[STORAGE_BUCKETS.FILES])
      .includes(category.replace('_', '-'));

    if (isInFiles) {
      return STORAGE_BUCKETS.FILES;
    }

    // If not found in either, use file type to determine bucket
    const isImage = file && file.type && file.type.startsWith('image/');
    return isImage ? STORAGE_BUCKETS.IMAGES : STORAGE_BUCKETS.FILES;
  }
  
  // Default fallback
  return DEFAULT_BUCKET;
};

// Export all functions and constants as named exports only
export {
  saveFile,
  uploadFile,
  getFileUrl,
  deleteFile,
  listFiles,
  cleanupUnusedFiles,
  determineBucket,
  isStorageAvailable,
  resetStorageStatusCache,
  STORAGE_BUCKETS,
  BUCKET_FOLDERS,
  STORAGE_CATEGORIES,
  DEFAULT_BUCKET
};