import { saveFile, STORAGE_CATEGORIES } from '../services/fileService';

const uploadMeterPhoto = async (file, readingId) => {
  try {
    const result = await saveFile(file, {
      bucket: STORAGE_CATEGORIES.UTILITY_READINGS.bucket,
      folder: `${STORAGE_CATEGORIES.UTILITY_READINGS.folder}/${readingId}`
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.url;
  } catch (error) {
    console.error('Error uploading meter photo:', error);
    throw new Error('Failed to upload meter photo. Please try again.');
  }
};

// ... rest of the component code ... 