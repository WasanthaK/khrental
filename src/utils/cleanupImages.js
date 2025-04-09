import { fetchData } from '../services/supabaseClient';
import { cleanupUnusedFiles, STORAGE_BUCKETS, BUCKET_FOLDERS } from '../services/fileService';
import { supabase } from '../services/supabaseClient';

/**
 * Clean up unused property images
 * This function fetches all properties from the database,
 * collects all image URLs that are still in use,
 * and then deletes any files in the properties folder that are not in use.
 */
export const cleanupPropertyImages = async (usedImageUrls) => {
  try {
    const result = await cleanupUnusedFiles({
      bucket: STORAGE_BUCKETS.IMAGES,
      folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].PROPERTIES
    }, usedImageUrls);
    return result;
  } catch (error) {
    console.error('Error cleaning up property images:', error);
    throw error;
  }
};

/**
 * Clean up unused ID copy images
 */
export const cleanupIdCopyImages = async (usedImageUrls) => {
  try {
    const result = await cleanupUnusedFiles({
      bucket: STORAGE_BUCKETS.FILES,
      folder: BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].ID_COPIES
    }, usedImageUrls);
    return result;
  } catch (error) {
    console.error('Error cleaning up ID copy images:', error);
    throw error;
  }
};

/**
 * Clean up unused payment proof images
 */
export const cleanupPaymentProofImages = async (usedImageUrls) => {
  try {
    const result = await cleanupUnusedFiles({
      bucket: STORAGE_BUCKETS.FILES,
      folder: BUCKET_FOLDERS[STORAGE_BUCKETS.FILES].PAYMENT_PROOFS
    }, usedImageUrls);
    return result;
  } catch (error) {
    console.error('Error cleaning up payment proof images:', error);
    throw error;
  }
};

/**
 * Clean up unused utility reading images
 */
export const cleanupUtilityReadingImages = async (usedImageUrls) => {
  try {
    const result = await cleanupUnusedFiles({
      bucket: STORAGE_BUCKETS.IMAGES,
      folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].UTILITY_READINGS
    }, usedImageUrls);
    return result;
  } catch (error) {
    console.error('Error cleaning up utility reading images:', error);
    throw error;
  }
};

/**
 * Clean up all unused images
 */
export const cleanupAllImages = async () => {
  try {
    console.log('Starting cleanup of all image categories...');
    
    const results = {
      properties: await cleanupPropertyImages(),
      idCopies: await cleanupIdCopyImages(),
      paymentProofs: await cleanupPaymentProofImages(),
      utilityReadings: await cleanupUtilityReadingImages(),
    };
    
    const totalDeleted = Object.values(results).reduce((sum, result) => sum + result.deleted, 0);
    const totalErrors = Object.values(results).reduce((sum, result) => sum + result.errors, 0);
    
    console.log(`All cleanups complete: ${totalDeleted} files deleted, ${totalErrors} errors`);
    return results;
  } catch (error) {
    console.error('Error cleaning up all images:', error);
    throw error;
  }
}; 