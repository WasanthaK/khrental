import { getPlatformClient } from './platformClient';
import {listStorageBuckets} from './storageApiService';

const platformClient = getPlatformClient();

let storageInitialized = false;

/**
 * Check the storage availability exposed by the KH Rentals storage
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

    // Opening the app is a read, not global bucket administration. Logical
    // folders are created by authorized uploads; no .keep writes are needed.
    // Provisioning remains an explicit platform-admin operation.
    await listStorageBuckets();

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
