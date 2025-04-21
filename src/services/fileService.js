import { supabase } from './supabaseClient.js';
import { isDefinedValue } from '../utils/validators.js';

// Get Supabase anon key from environment
const getSupabaseAnonKey = () => {
  let anonKey = null;
  
  // Try window._env_ (for production)
  if (window?._env_?.VITE_SUPABASE_ANON_KEY) {
    anonKey = window._env_.VITE_SUPABASE_ANON_KEY;
  }
  
  // Then try Vite's import.meta.env
  if (!anonKey && import.meta.env?.VITE_SUPABASE_ANON_KEY) {
    anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  }
  
  return anonKey;
};

const supabaseAnonKey = getSupabaseAnonKey();

// Storage buckets
const STORAGE_BUCKETS = {
  IMAGES: 'images',
  FILES: 'files',
  DOCUMENTS: 'documents'
};

// Folder structure for each bucket - matches exactly what exists in Supabase storage
const BUCKET_FOLDERS = {
  [STORAGE_BUCKETS.IMAGES]: {
    ID_COPIES: 'id-copies',
    MAINTENANCE: 'maintenance',
    PROPERTIES: 'properties',
    UTILITY_READINGS: 'utility-readings'
  },
  [STORAGE_BUCKETS.FILES]: {
    AGREEMENTS: 'agreements',
    DOCUMENTS: 'documents',
    ID_COPIES: 'id-copies',
    PAYMENT_PROOFS: 'payment-proofs'
  }
};

// Backward compatibility for STORAGE_CATEGORIES
const STORAGE_CATEGORIES = {
  // Images bucket categories
  ID_COPIES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].ID_COPIES
  },
  MAINTENANCE: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
  },
  PROPERTIES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].PROPERTIES
  },
  UTILITY_READINGS: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].UTILITY_READINGS
  },
  
  // Files bucket categories
  AGREEMENTS: {
    bucket: STORAGE_BUCKETS.FILES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].AGREEMENTS
  },
  DOCUMENTS: {
    bucket: STORAGE_BUCKETS.FILES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].DOCUMENTS
  },
  FILE_ID_COPIES: {
    bucket: STORAGE_BUCKETS.FILES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].ID_COPIES
  },
  PAYMENT_PROOFS: {
    bucket: STORAGE_BUCKETS.FILES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].PAYMENT_PROOFS
  },

  // Legacy mappings (if any were using different names)
  PROPERTY_IMAGES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].PROPERTIES
  },
  MAINTENANCE_IMAGES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
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
  try {
    // If we have cached results for this bucket and they're positive, use them
    if (bucketName && _storageStatus.buckets[bucketName] === true) {
      return true;
    }
    
    // Try a simple list operation to check if the bucket exists
    if (bucketName) {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .list('', { limit: 1 });
      
      // If we can list something (even an empty folder), the bucket exists
      if (!error) {
        // Cache the positive result
        _storageStatus.buckets[bucketName] = true;
        _storageStatus.available = true;
        _storageStatus.checked = true;
        return true;
      }
      
      // Log the error but continue checking with other methods
      console.warn(`Initial bucket check for ${bucketName} failed:`, error.message);
      
      // If it's an authentication error, but we know the bucket should exist,
      // return true anyway to allow the operation to proceed
      if (error.message?.includes('JWT') || error.status === 401) {
        console.log('Authentication issue when checking bucket, assuming it exists');
        return true;
      }
    }
    
    // Fall back to listing all buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Storage list buckets error:', listError.message);
      
      // If it's just a permissions error but storage might still be available,
      // return true to allow operations to proceed
      if (listError.message?.includes('permission') || 
          listError.status === 403 || 
          listError.code === 'PGRST301') {
        console.log('Permission issue when listing buckets, storage might still be available');
        return true;
      }
      
      // For other errors, we'll still try direct access as a last resort
      if (bucketName) {
        try {
          // Try a direct public URL check, which might work even with limited permissions
          const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl('test-path');
            
          if (publicUrlData?.publicUrl) {
            console.log(`Successfully generated public URL for ${bucketName}, assuming it exists`);
            return true;
          }
        } catch (directCheckError) {
          console.error('Direct bucket check failed:', directCheckError);
        }
      }
      
      return false;
    }
    
    // If we just want to check if any storage is available
    if (!bucketName) {
      _storageStatus.available = true;
      _storageStatus.checked = true;
      return true;
    }
    
    // Check if our specific bucket exists in the list
    const bucketExists = buckets.some(bucket => bucket.name === bucketName);
    if (bucketExists) {
      _storageStatus.buckets[bucketName] = true;
    }
    
    return bucketExists;
  } catch (error) {
    console.error('Error checking storage availability:', error);
    
    // If there was an error, we'll assume storage might still be available
    // This prevents blocking uploads in case of temporary errors
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      console.log('Network error when checking storage, assuming it might be available');
      return true;
    }
    
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
 * Validate a file upload request
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
    return { isValid: false, error: 'Missing folder path' };
  }
  
  // Check if folder is a direct value from BUCKET_FOLDERS or a valid folder path string
  const validFolders = Object.values(BUCKET_FOLDERS[bucket] || {});
  const isValidFolder = validFolders.includes(folder) || 
                        // Allow subfolder paths that start with valid folders
                        validFolders.some(validFolder => 
                          folder === validFolder || 
                          folder.startsWith(`${validFolder}/`));
  
  if (!isValidFolder) {
    console.error(`Invalid folder path: "${folder}" not found in valid folders for bucket "${bucket}":`, validFolders);
    return { isValid: false, error: `Invalid folder path: ${folder}` };
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
      console.error('File validation failed:', validation.error);
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

    // Generate a safe unique filename
    const fileExt = file.name.split('.').pop().toLowerCase();
    const safeFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
    
    // Create a safe folder path
    const folderPath = folder.trim().replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
    const filePath = `${folderPath}/${safeFileName}`;

    console.log(`Uploading file to ${bucket}/${filePath}`);

    // Try to ensure the folder exists first
    try {
      await ensureFolderExists(bucket, folderPath);
    } catch (folderError) {
      console.warn(`Couldn't ensure folder exists, but will try upload anyway:`, folderError);
      // Continue with upload even if folder creation fails - it might still work
    }

    // Set appropriate content type
    const contentType = file.type || 'application/octet-stream';

    // Attempt the upload
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType
      });

    if (uploadError) {
      console.error(`Error uploading to ${bucket}/${filePath}:`, uploadError);
      
      // If we're in development, try direct upload without the proxy
      if (import.meta.env.DEV && window._SUPABASE_STORAGE_URL) {
        console.log('Trying direct upload without CORS proxy...');
        // Create a temporary client without the proxy
        const { createClient } = await import('@supabase/supabase-js');
        const directClient = createClient(
          window._SUPABASE_STORAGE_URL,
          supabaseAnonKey
        );
        
        const { error: directError } = await directClient.storage
          .from(bucket)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType
          });
          
        if (directError) {
          console.error(`Direct upload also failed:`, directError);
          throw directError;
        } else {
          console.log('Direct upload succeeded!');
          // Get the public URL
          const { data: { publicUrl } } = directClient.storage
            .from(bucket)
            .getPublicUrl(filePath);
          
          return {
            success: true,
            url: publicUrl
          };
        }
      } else {
        throw uploadError;
      }
    }

    // Get the public URL for the uploaded file
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
 * Create a folder if it doesn't exist 
 * @param {string} bucket - The bucket name
 * @param {string} folderPath - The folder path to create
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
const ensureFolderExists = async (bucket, folderPath) => {
  try {
    if (!folderPath) return { success: true }; // Root folder always exists
    
    // Try to list the folder to see if it exists
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folderPath);
      
    // If we can list it, it exists
    if (!error) return { success: true };
    
    // Create a dummy file to create the folder
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(`${folderPath}/.folder`, new Blob([''], { type: 'text/plain' }), {
        upsert: true
      });
      
    if (uploadError) {
      console.error(`Failed to create folder ${folderPath} in ${bucket}:`, uploadError);
      return { success: false, error: uploadError };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Error ensuring folder ${folderPath} exists:`, error);
    return { success: false, error };
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
 * List files in a bucket and path with improved error handling
 * @param {string} bucket - The bucket to list files from
 * @param {string} path - The path within the bucket (optional)
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
const listFiles = async (bucket, path = '') => {
  try {
    if (!isDefinedValue(bucket)) {
      return { data: null, error: new Error('Invalid bucket') };
    }

    // Try to ensure we have a valid session
    try {
      await ensureAuthSession();
    } catch (sessionError) {
      console.warn('Session validation failed, attempting list operation anyway:', sessionError);
      // Continue without valid session - might still work with public buckets
    }

    // First try to check if bucket exists
    try {
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (!bucketsError && buckets && !buckets.some(b => b.name === bucket)) {
        console.warn(`Bucket "${bucket}" not found in available buckets`);
      }
    } catch (bucketsError) {
      console.warn('Error checking buckets, will still try to list files:', bucketsError);
      // Continue even if we can't check buckets
    }

    // Normalize the path
    const safePath = path?.trim().replace(/^\/+|\/+$/g, '') || '';

    // Attempt to list files
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(safePath);

    if (error) { 
      // Add extra debugging information to the error
      error.originalMessage = error.message;
      error.message = `Error listing files in ${bucket}${safePath ? '/' + safePath : ''}: ${error.message}`;
      error.bucket = bucket;
      error.path = safePath;
      throw error; 
    }
    
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

/**
 * Specialized function for uploading images with validation and processing
 * @param {File} file - The image file to upload
 * @param {Object} options - Upload options
 * @param {string} options.bucket - The storage bucket (defaults to IMAGES)
 * @param {string} options.folder - The target folder
 * @param {boolean} options.compress - Whether to compress the image (default: true)
 * @param {number} options.maxSize - Maximum file size in bytes (default: 10MB)
 * @param {number} options.maxWidth - Maximum image width for compression (default: 1920px)
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
const saveImage = async (file, options) => {
  try {
    // Set default options
    const {
      bucket = STORAGE_BUCKETS.IMAGES,
      folder,
      compress = true,
      maxSize = 10 * 1024 * 1024, // 10MB
      maxWidth = 1920
    } = options || {};

    // Validate it's an image file
    if (!file.type.startsWith('image/')) {
      return { 
        success: false, 
        error: `The file is not a valid image. File type: ${file.type}` 
      };
    }

    // Check file size
    if (file.size > maxSize) {
      return { 
        success: false,
        error: `The image exceeds the maximum size of ${Math.round(maxSize / (1024 * 1024))}MB`
      };
    }

    // Optionally compress the image
    let processedFile = file;
    if (compress && file.type !== 'image/gif') { // Don't compress GIFs
      try {
        // Create a canvas element
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Create an image element
        const img = new Image();
        
        // Create a promise to handle image loading
        const loadImage = new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image for compression'));
          img.src = URL.createObjectURL(file);
        });
        
        // Wait for image to load
        await loadImage;
        
        // Calculate new dimensions (preserving aspect ratio)
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;
        
        // Draw image on canvas with new dimensions
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to Blob with quality 0.8 (80%)
        const blob = await new Promise(resolve => {
          canvas.toBlob(resolve, 'image/jpeg', 0.8);
        });
        
        // Clean up
        URL.revokeObjectURL(img.src);
        
        // Create a new File object
        processedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
        
        console.log(`Compressed image from ${file.size} to ${processedFile.size} bytes`);
      } catch (compressionError) {
        console.warn('Image compression failed, using original file:', compressionError);
        // Use the original file if compression fails
      }
    }

    // Use the standard saveFile function to upload the processed image
    return await saveFile(processedFile, { bucket, folder });
  } catch (error) {
    console.error('Error in saveImage:', error);
    return {
      success: false,
      error: error.message || 'Failed to save image'
    };
  }
};

// Export all functions and constants as named exports only
export {
  // Buckets and folders
  STORAGE_BUCKETS,
  BUCKET_FOLDERS,
  
  // Core functions
  saveFile,
  uploadFile,
  getFileUrl,
  deleteFile,
  listFiles,
  cleanupUnusedFiles,
  ensureFolderExists,
  
  // Storage status
  isStorageAvailable,
  resetStorageStatusCache,
  
  // Higher-level functions
  saveImage,
  
  // Legacy exports (for backward compatibility)
  STORAGE_CATEGORIES
};