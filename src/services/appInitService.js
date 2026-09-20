import { getPlatformClient } from './platformClient';
import { STORAGE_BUCKETS, BUCKET_FOLDERS } from './fileService';

const platformClient = getPlatformClient();

let storageInitialized = false;

const ensureBucket = async (bucketName) => {
  const { data: bucket, error: getBucketError } = await platformClient.storage.getBucket(bucketName);

  if (bucket) {
    return true;
  }

  if (getBucketError && !String(getBucketError.message || '').toLowerCase().includes('not found')) {
    throw getBucketError;
  }

  const { error: createError } = await platformClient.storage.createBucket(bucketName);
  if (createError) {
    throw createError;
  }

  return true;
};

const ensureFolder = async (bucketName, folderPath) => {
  const { data, error } = await platformClient.storage
    .from(bucketName)
    .list(folderPath);

  if (error) {
    throw error;
  }

  if (Array.isArray(data) && data.length > 0) {
    return;
  }

  const { error: uploadError } = await platformClient.storage
    .from(bucketName)
    .upload(`${folderPath}/.keep`, new Blob([''], { type: 'text/plain' }));

  if (uploadError && !String(uploadError.message || '').toLowerCase().includes('already exists')) {
    throw uploadError;
  }
};

/**
 * Initialize the logical storage structure exposed by the KH Rentals storage
 * API. Production objects live in Cloudflare R2; local development may use the
 * local storage driver. Authorization and tenant scoping are enforced by the
 * application API, not by database/storage-provider row-level-security rules.
 */
export const initializeStorage = async () => {
  if (storageInitialized) {
    return { success: true, skipped: true, reason: 'Storage already initialized.' };
  }

  try {
    const { data: { session } } = await platformClient.auth.getSession();
    if (!session) {
      return {
        success: true,
        skipped: true,
        reason: 'No authenticated session available for storage initialization.'
      };
    }

    for (const bucketName of Object.values(STORAGE_BUCKETS)) {
      await ensureBucket(bucketName);

      const folderPaths = BUCKET_FOLDERS[bucketName]
        ? Object.values(BUCKET_FOLDERS[bucketName])
        : [];

      for (const folderPath of folderPaths) {
        try {
          await ensureFolder(bucketName, folderPath);
        } catch (folderError) {
          console.warn(`Unable to initialize storage folder ${bucketName}/${folderPath}:`, folderError);
        }
      }
    }

    storageInitialized = true;
    return { success: true, skipped: false };
  } catch (error) {
    return {
      success: false,
      skipped: false,
      error: error.message || 'Storage initialization failed.'
    };
  }
};

export const initializeApp = async () => {
  try {
    const storageResult = await initializeStorage();

    if (!storageResult.success && !storageResult.skipped) {
      console.warn('Storage initialization failed; the application will continue.', storageResult.error);
      return {
        success: true,
        error: storageResult.error || 'Storage initialization failed. Some file features may be unavailable.',
        isStorageError: true
      };
    }

    return {
      success: true,
      error: null,
      isStorageError: false,
      storageSkipped: Boolean(storageResult.skipped)
    };
  } catch (error) {
    console.error('Error during app initialization:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const forceStorageReinitialization = () => {
  storageInitialized = false;
};
