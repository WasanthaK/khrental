import { supabase } from './supabaseClient';

// Define the allowed folders for each bucket
const BUCKET_FOLDERS = {
  'images': ['properties', 'maintenance', 'utility-readings'],
  'files': ['agreements', 'id-copies', 'documents', 'payment-proofs']
};

/**
 * Lists all available storage buckets
 * @returns {Promise<{buckets: Array, error: string|null}>}
 */
export const listAllBuckets = async () => {
  console.log('listAllBuckets: Starting to fetch buckets...');
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    console.log('listAllBuckets: Supabase response:', { buckets, error });
    
    if (error) {
      console.error('listAllBuckets: Error from Supabase:', error);
      throw error;
    }
    
    // Return all buckets instead of filtering
    console.log('listAllBuckets: Returning buckets:', buckets || []);
    return { buckets: buckets || [] };
  } catch (error) {
    console.error('listAllBuckets: Caught error:', error);
    return { error: error.message };
  }
};

/**
 * Lists files in a specific bucket, optionally within a subfolder
 * @param {string} bucketName - Name of the bucket
 * @param {string} [folderPath] - Optional subfolder path
 * @returns {Promise<{files: Array, error: string|null, publicUrls: Object}>}
 */
export const listBucketContents = async (bucketName, folderPath = '') => {
  console.log('listBucketContents: Starting to fetch contents for bucket:', bucketName, 'path:', folderPath);
  try {
    // Validate bucket exists
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    console.log('listBucketContents: Bucket validation result:', { buckets, error: bucketError });
    
    if (bucketError) {
      console.error('listBucketContents: Error validating bucket:', bucketError);
      throw bucketError;
    }
    
    const bucketExists = buckets?.some(b => b.name === bucketName);
    if (!bucketExists) {
      console.error('listBucketContents: Bucket not found:', bucketName);
      throw new Error(`Bucket not found: ${bucketName}`);
    }
    
    // If folder path is provided, validate it against allowed folders
    if (folderPath && BUCKET_FOLDERS[bucketName] && !BUCKET_FOLDERS[bucketName].includes(folderPath)) {
      console.warn('listBucketContents: Warning - Accessing non-standard folder:', { bucketName, folderPath });
    }
    
    const { data: files, error } = await supabase.storage
      .from(bucketName)
      .list(folderPath);
      
    console.log('listBucketContents: Files list result:', { files, error });
    
    if (error) {
      console.error('listBucketContents: Error listing files:', error);
      throw error;
    }
    
    // Get public URLs for files
    const publicUrls = {};
    for (const file of files || []) {
      if (file.id !== null) { // Skip folders
        const { data } = supabase.storage
          .from(bucketName)
          .getPublicUrl(folderPath ? `${folderPath}/${file.name}` : file.name);
          
        if (data?.publicUrl) {
          publicUrls[file.name] = data.publicUrl;
        }
      }
    }
    
    console.log('listBucketContents: Returning result:', { files, publicUrls });
    return { files, publicUrls };
  } catch (error) {
    console.error('listBucketContents: Caught error:', error);
    return { error: error.message };
  }
};

/**
 * Recursively lists all files in a bucket, including subfolders
 * @param {string} bucketName - Name of the bucket
 * @returns {Promise<{files: Array, error: string|null}>}
 */
export const listAllFilesInBucket = async (bucketName) => {
  try {
    // Validate bucket exists
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      throw bucketError;
    }
    
    const bucketExists = buckets?.some(b => b.name === bucketName);
    if (!bucketExists) {
      throw new Error(`Bucket not found: ${bucketName}`);
    }
    
    const files = [];
    
    // If bucket has defined folders, list only those
    if (BUCKET_FOLDERS[bucketName]) {
      for (const folder of BUCKET_FOLDERS[bucketName]) {
        await listFilesRecursively(bucketName, folder, files);
      }
    } else {
      // Otherwise, list all files in the bucket
      await listFilesRecursively(bucketName, '', files);
    }
    
    return { files };
  } catch (error) {
    console.error('Error listing all files:', error);
    return { error: error.message };
  }
};

const listFilesRecursively = async (bucketName, path, accumulator) => {
  const { data: contents, error } = await supabase.storage
    .from(bucketName)
    .list(path);
    
  if (error) {
    throw error;
  }
  
  for (const item of contents || []) {
    if (item.id === null) { // It's a folder
      await listFilesRecursively(
        bucketName,
        path ? `${path}/${item.name}` : item.name,
        accumulator
      );
    } else { // It's a file
      accumulator.push({
        ...item,
        path: path ? `${path}/${item.name}` : item.name
      });
    }
  }
};

/**
 * Uploads a file to a specified bucket and folder
 * @param {File|Blob} file - The file to upload
 * @param {string} bucketName - Name of the target bucket
 * @param {string} [folderPath] - Optional folder path
 * @param {string} [customFileName] - Optional custom filename, defaults to original filename
 * @returns {Promise<{path: string, publicUrl: string|null, error: string|null}>}
 */
export const uploadFileToBucket = async (file, bucketName, folderPath = '', customFileName = null) => {
  try {
    if (!file) {
      return { path: null, publicUrl: null, error: 'No file provided' };
    }
    
    // Validate bucket and folder
    if (!BUCKET_FOLDERS[bucketName]) {
      throw new Error(`Invalid bucket: ${bucketName}`);
    }
    
    if (folderPath && !BUCKET_FOLDERS[bucketName].includes(folderPath)) {
      throw new Error(`Invalid folder for bucket ${bucketName}: ${folderPath}`);
    }
    
    // Generate path with optional folder
    const fileName = customFileName || file.name || `file-${Date.now()}`;
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
    
    // Upload file
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file);
    
    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return { path: null, publicUrl: null, error: uploadError.message };
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);
    
    return {
      path: filePath,
      publicUrl: urlData?.publicUrl || null,
      error: null
    };
  } catch (error) {
    console.error('Error in uploadFileToBucket:', error);
    return { path: null, publicUrl: null, error: error.message };
  }
};

/**
 * Deletes a file from a bucket
 * @param {string} bucketName - Name of the bucket
 * @param {string} filePath - Path to the file within the bucket
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const deleteFileFromBucket = async (bucketName, filePath) => {
  try {
    // Validate bucket and folder
    if (!BUCKET_FOLDERS[bucketName]) {
      throw new Error(`Invalid bucket: ${bucketName}`);
    }
    
    const folder = filePath.split('/')[0];
    if (folder && !BUCKET_FOLDERS[bucketName].includes(folder)) {
      throw new Error(`Invalid folder for bucket ${bucketName}: ${folder}`);
    }
    
    const { error } = await supabase.storage
      .from(bucketName)
      .remove([filePath]);
    
    if (error) {
      console.error('Error deleting file:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error in deleteFileFromBucket:', error);
    return { success: false, error: error.message };
  }
};

// Export all functions for use in other modules
export default {
  listAllBuckets,
  listBucketContents,
  listAllFilesInBucket,
  uploadFileToBucket,
  deleteFileFromBucket
};