import {
  buildStorageUrl,
  createStorageBucket,
  deleteStorageBucket,
  deleteTenantFiles,
  listStorageBuckets,
  listTenantFiles,
  uploadTenantFile
} from './storageApiService';

export const listAllBuckets = async () => {
  try {
    return { buckets: await listStorageBuckets(), error: null };
  } catch (error) {
    return { buckets: [], error: error.message };
  }
};

export const createBucket = async (bucketName) => {
  try {
    return { bucket: await createStorageBucket(bucketName), error: null };
  } catch (error) {
    return { bucket: null, error: error.message };
  }
};

export const removeBucket = async (bucketName) => {
  try {
    await deleteStorageBucket(bucketName);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const listBucketContents = async (bucketName, folderPath = '') => {
  try {
    const buckets = await listStorageBuckets();
    if (!(buckets || []).some((bucket) => (bucket?.name || bucket?.id) === bucketName)) {
      throw new Error(`Bucket not found: ${bucketName}`);
    }

    const files = await listTenantFiles({ bucket: bucketName, path: folderPath });
    const publicUrls = {};
    for (const file of files || []) {
      if (file?.id !== null && file?.name) {
        const filePath = folderPath ? `${folderPath}/${file.name}` : file.name;
        publicUrls[file.name] = buildStorageUrl(bucketName, filePath);
      }
    }
    return { files: files || [], publicUrls, error: null };
  } catch (error) {
    return { files: [], publicUrls: {}, error: error.message };
  }
};

const listFilesRecursively = async (bucketName, path, accumulator) => {
  const contents = await listTenantFiles({ bucket: bucketName, path });
  for (const item of contents || []) {
    if (item?.id === null && item?.name) {
      await listFilesRecursively(bucketName, path ? `${path}/${item.name}` : item.name, accumulator);
    } else if (item?.name) {
      accumulator.push({ ...item, path: path ? `${path}/${item.name}` : item.name });
    }
  }
};

export const listAllFilesInBucket = async (bucketName) => {
  try {
    const files = [];
    await listFilesRecursively(bucketName, '', files);
    return { files, error: null };
  } catch (error) {
    return { files: [], error: error.message };
  }
};

export const uploadFileToBucket = async (file, bucketName, folderPath = '', customFileName = null) => {
  try {
    if (!file) return { path: null, publicUrl: null, error: 'No file provided' };
    const fileName = customFileName || file.name || `file-${Date.now()}`;
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
    const uploaded = await uploadTenantFile({ bucket: bucketName, path: filePath, file });
    return { path: uploaded?.path || filePath, publicUrl: uploaded?.url || null, error: null };
  } catch (error) {
    return { path: null, publicUrl: null, error: error.message };
  }
};

export const deleteFileFromBucket = async (bucketName, filePath) => {
  try {
    await deleteTenantFiles({ bucket: bucketName, paths: [filePath] });
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default {
  listAllBuckets,
  createBucket,
  removeBucket,
  listBucketContents,
  listAllFilesInBucket,
  uploadFileToBucket,
  deleteFileFromBucket
};
