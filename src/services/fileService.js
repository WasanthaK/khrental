import { platform as platformClient } from './platformClient.js';
import { isDefinedValue } from '../utils/validators.js';
import { buildRequestContextHeaders } from './requestContext.js';
import {
  buildStorageUrl,
  deleteTenantFiles,
  listStorageBuckets,
  listTenantFiles,
  uploadTenantFile
} from './storageApiService.js';

// Storage buckets
const STORAGE_BUCKETS = {
  IMAGES: 'images',
  FILES: 'files',
  DOCUMENTS: 'documents'
};

// Folder structure for each bucket in local/R2 storage
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

// Backward compatibility for existing callers.
const STORAGE_CATEGORIES = {
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
  PROPERTY_IMAGES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].PROPERTIES
  },
  MAINTENANCE_IMAGES: {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
  }
};

const DEFAULT_BUCKET = STORAGE_BUCKETS.IMAGES;

let _storageStatus = {
  checked: false,
  available: false,
  buckets: {}
};

const isAuthOrPermissionError = (error) => (
  error?.status === 401
  || error?.status === 403
  || error?.code === 'PGRST301'
  || error?.message?.includes('JWT')
  || error?.message?.toLowerCase?.().includes('permission')
);

/**
 * Checks whether storage is reachable and, optionally, whether a logical bucket exists.
 */
const isStorageAvailable = async (bucketName = null) => {
  try {
    if (bucketName && _storageStatus.buckets[bucketName] === true) {
      return true;
    }

    if (bucketName) {
      try {
        await listTenantFiles({ bucket: bucketName, path: '' });
        _storageStatus.buckets[bucketName] = true;
        _storageStatus.available = true;
        _storageStatus.checked = true;
        return true;
      } catch (error) {
        console.warn(`Initial bucket check for ${bucketName} failed:`, error.message);
        if (isAuthOrPermissionError(error)) {
          console.log('Authorization prevented the bucket probe; allowing the requested operation to decide.');
          return true;
        }
      }
    }

    try {
      const buckets = await listStorageBuckets();
      _storageStatus.available = true;
      _storageStatus.checked = true;

      if (!bucketName) {
        return true;
      }

      const bucketExists = buckets.some((bucket) => bucket.name === bucketName || bucket.id === bucketName);
      if (bucketExists) {
        _storageStatus.buckets[bucketName] = true;
      }
      return bucketExists;
    } catch (error) {
      console.error('Storage list buckets error:', error.message);
      if (isAuthOrPermissionError(error)) {
        return true;
      }

      // URL construction is local and mirrors the delivery endpoint used by storage uploads.
      if (bucketName && buildStorageUrl(bucketName, 'test-path')) {
        return true;
      }
      return false;
    }
  } catch (error) {
    console.error('Error checking storage availability:', error);
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      console.log('Network error when checking storage, assuming it might be available');
      return true;
    }
    return false;
  }
};

const resetStorageStatusCache = () => {
  _storageStatus = {
    checked: false,
    available: false,
    buckets: {}
  };
};

/**
 * Keep the existing auth/session guard while storage is migrated independently.
 * MSSQL/dev-bypass runtimes may use request identity headers instead of a persisted session.
 */
const ensureAuthSession = async () => {
  const { data: { session }, error } = await platformClient.auth.getSession();

  if (!error && session) {
    return session;
  }

  const requestHeaders = buildRequestContextHeaders();
  const hasRequestIdentity = Boolean(
    requestHeaders['x-auth-id']
      || requestHeaders['x-user-email']
      || requestHeaders['x-dev-bypass-role']
  );

  if (!hasRequestIdentity) {
    throw new Error('No valid authentication session found. Please log in again.');
  }

  return { user: session?.user || null, requestHeaders };
};

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

  const validFolders = Object.values(BUCKET_FOLDERS[bucket] || {});
  const isValidFolder = validFolders.includes(folder)
    || validFolders.some((validFolder) => folder === validFolder || folder.startsWith(`${validFolder}/`));

  if (!isValidFolder) {
    console.error(`Invalid folder path: "${folder}" not found in valid folders for bucket "${bucket}":`, validFolders);
    return { isValid: false, error: `Invalid folder path: ${folder}` };
  }

  return { isValid: true, error: null };
};

const saveFile = async (file, { bucket, folder }) => {
  try {
    const validation = validateFileUpload(file, bucket, folder);
    if (!validation.isValid) {
      console.error('File validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    const isAvailable = await isStorageAvailable(bucket);
    if (!isAvailable) {
      return {
        success: false,
        error: `Storage bucket "${bucket}" is not available. Please contact an administrator to set up the required storage buckets.`
      };
    }

    await ensureAuthSession();

    const fileExt = file.name.split('.').pop().toLowerCase();
    const safeFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
    const folderPath = folder.trim().replace(/^\/+|\/+$/g, '');
    const filePath = `${folderPath}/${safeFileName}`;

    console.log(`Uploading file to ${bucket}/${filePath}`);

    const uploadData = await uploadTenantFile({ bucket, path: filePath, file });
    const storedPath = uploadData?.path || filePath;

    return {
      success: true,
      url: uploadData?.url || buildStorageUrl(bucket, storedPath)
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
 * Object storage has no real folders. The current local and R2 drivers create parent paths
 * during upload, so probing the prefix is sufficient and no marker object is required.
 */
const ensureFolderExists = async (bucket, folderPath) => {
  try {
    if (!folderPath) return { success: true };
    await listTenantFiles({ bucket, path: folderPath });
    return { success: true };
  } catch (error) {
    console.error(`Error ensuring folder ${folderPath} exists:`, error);
    return { success: false, error };
  }
};

/** @deprecated Use saveFile instead. */
const uploadFile = async (file, bucket, path) => {
  try {
    const data = await uploadTenantFile({ bucket, path, file });
    return { data, error: null };
  } catch (error) {
    console.error('Error uploading file:', error);
    return { data: null, error };
  }
};

const getFileUrl = async (bucket, path) => {
  try {
    return { url: buildStorageUrl(bucket, path), error: null };
  } catch (error) {
    console.error('Error getting file URL:', error);
    return { url: null, error };
  }
};

const deleteFile = async (bucket, path) => {
  try {
    if (!isDefinedValue(bucket) || !isDefinedValue(path)) {
      return { success: false, error: new Error('Invalid bucket or path') };
    }

    await ensureAuthSession();
    await deleteTenantFiles({ bucket, paths: [path] });
    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting file:', error);
    return { success: false, error };
  }
};

const listFiles = async (bucket, path = '') => {
  try {
    if (!isDefinedValue(bucket)) {
      return { data: null, error: new Error('Invalid bucket') };
    }

    try {
      await ensureAuthSession();
    } catch (sessionError) {
      console.warn('Session validation failed, attempting list operation anyway:', sessionError);
    }

    try {
      const buckets = await listStorageBuckets();
      if (buckets && !buckets.some((entry) => entry.name === bucket || entry.id === bucket)) {
        console.warn(`Bucket "${bucket}" not found in available buckets`);
      }
    } catch (bucketsError) {
      console.warn('Error checking buckets, will still try to list files:', bucketsError);
    }

    const safePath = path?.trim().replace(/^\/+|\/+$/g, '') || '';
    const data = await listTenantFiles({ bucket, path: safePath });
    return { data, error: null };
  } catch (error) {
    error.originalMessage = error.message;
    error.message = `Error listing files in ${bucket}${path ? '/' + path : ''}: ${error.message}`;
    error.bucket = bucket;
    error.path = path?.trim().replace(/^\/+|\/+$/g, '') || '';
    console.error('Error listing files:', error);
    return { data: null, error };
  }
};

const cleanupUnusedFiles = async (category, usedUrls, bucketName = null) => {
  try {
    await ensureAuthSession();

    if (!Array.isArray(usedUrls)) {
      throw new Error('usedUrls must be an array');
    }

    const targetBucket = bucketName || (
      typeof category === 'object' && category?.bucket
        ? category.bucket
        : DEFAULT_BUCKET
    );

    if (!Object.values(STORAGE_BUCKETS).includes(targetBucket)) {
      throw new Error(`Invalid bucket: ${targetBucket}`);
    }

    const { data: files, error: listError } = await listFiles(targetBucket);
    if (listError) throw listError;
    if (!files) return { deleted: 0, errors: 0, skipped: 0 };

    const usedPaths = usedUrls
      .filter((url) => isDefinedValue(url))
      .map((url) => {
        if (url.includes('/storage/v1/object/public/')) {
          const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
          return match && match[1] === targetBucket ? match[2] : '';
        }

        if (url.includes(`/${targetBucket}/`)) {
          return url.split(`/${targetBucket}/`)[1] || '';
        }

        return url.includes('/') && !url.includes('://') ? url : '';
      })
      .filter(Boolean);

    const filesToDelete = files.filter((item) => !usedPaths.includes(item.name));
    let deleted = 0;
    let errors = 0;

    for (const item of filesToDelete) {
      try {
        await deleteTenantFiles({ bucket: targetBucket, paths: [item.name] });
        deleted += 1;
      } catch (error) {
        console.error(`Error deleting file ${item.name}:`, error);
        errors += 1;
      }
    }

    return { deleted, errors, skipped: files.length - filesToDelete.length };
  } catch (error) {
    console.error('Error cleaning up files:', error);
    return { deleted: 0, errors: 1, skipped: 0 };
  }
};

const saveImage = async (file, options) => {
  try {
    const {
      bucket = STORAGE_BUCKETS.IMAGES,
      folder,
      compress = true,
      maxSize = 10 * 1024 * 1024,
      maxWidth = 1920
    } = options || {};

    if (!file.type.startsWith('image/')) {
      return {
        success: false,
        error: `The file is not a valid image. File type: ${file.type}`
      };
    }

    if (file.size > maxSize) {
      return {
        success: false,
        error: `The image exceeds the maximum size of ${Math.round(maxSize / (1024 * 1024))}MB`
      };
    }

    let processedFile = file;
    if (compress && file.type !== 'image/gif') {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Failed to load image for compression'));
          img.src = objectUrl;
        });

        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', 0.8);
        });

        URL.revokeObjectURL(objectUrl);
        if (!blob) {
          throw new Error('Image compression produced no output.');
        }

        processedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
          type: 'image/jpeg',
          lastModified: Date.now()
        });

        console.log(`Compressed image from ${file.size} to ${processedFile.size} bytes`);
      } catch (compressionError) {
        console.warn('Image compression failed, using original file:', compressionError);
      }
    }

    return await saveFile(processedFile, { bucket, folder });
  } catch (error) {
    console.error('Error in saveImage:', error);
    return {
      success: false,
      error: error.message || 'Failed to save image'
    };
  }
};

export {
  STORAGE_BUCKETS,
  BUCKET_FOLDERS,
  saveFile,
  uploadFile,
  getFileUrl,
  deleteFile,
  listFiles,
  cleanupUnusedFiles,
  ensureFolderExists,
  isStorageAvailable,
  resetStorageStatusCache,
  saveImage,
  STORAGE_CATEGORIES
};
