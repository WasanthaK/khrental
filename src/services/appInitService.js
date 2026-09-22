import { getPlatformClient } from './platformClient';
import { STORAGE_BUCKETS } from './fileService';
import { listStorageBuckets } from './storageApiService';

const platformClient = getPlatformClient();
let storageInitialized = false;

/**
 * Verify the server-owned storage configuration. Browser startup is deliberately
 * read-only: bucket creation/deletion is an administrator operation and object
 * folders are virtual prefixes created naturally by uploads.
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
        reason: 'No authenticated session available for storage readiness check.'
      };
    }

    const buckets = await listStorageBuckets();
    const configuredNames = new Set((buckets || []).map((bucket) => bucket?.name || bucket?.id).filter(Boolean));
    const missingBuckets = Object.values(STORAGE_BUCKETS).filter((bucketName) => !configuredNames.has(bucketName));

    if (missingBuckets.length > 0) {
      throw new Error(`Missing configured storage buckets: ${missingBuckets.join(', ')}`);
    }

    storageInitialized = true;
    return { success: true, skipped: false };
  } catch (error) {
    return {
      success: false,
      skipped: false,
      error: error.message || 'Storage readiness check failed.'
    };
  }
};

export const initializeApp = async () => {
  try {
    const storageResult = await initializeStorage();

    if (!storageResult.success && !storageResult.skipped) {
      console.warn('Storage readiness check failed; the application will continue.', storageResult.error);
      return {
        success: true,
        error: storageResult.error || 'Storage is not ready. Some file features may be unavailable.',
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
