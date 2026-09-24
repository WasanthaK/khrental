import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders, getActiveTenantId } from './requestContext';

const STORAGE_TENANT_ROOT = 'tenants';

const normalizePath = (value = '') => String(value || '')
  .replace(/\\/g, '/')
  .replace(/^\/+|\/+$/g, '');

const isTenantScopedPath = (value = '') => normalizePath(value).startsWith(`${STORAGE_TENANT_ROOT}/`);

export const scopeTenantStoragePath = (path = '') => {
  const normalizedPath = normalizePath(path);
  const activeTenantId = normalizePath(getActiveTenantId());

  if (!activeTenantId) {
    return normalizedPath;
  }

  const tenantPrefix = `${STORAGE_TENANT_ROOT}/${activeTenantId}`;

  if (!normalizedPath) {
    return tenantPrefix;
  }

  if (normalizedPath === tenantPrefix || normalizedPath.startsWith(`${tenantPrefix}/`)) {
    return normalizedPath;
  }

  if (isTenantScopedPath(normalizedPath)) {
    throw new Error('Cross-tenant storage paths are not allowed.');
  }

  return `${tenantPrefix}/${normalizedPath}`;
};

const readError = async (response) => {
  const payload = await response.json().catch(() => null);
  const error = new Error(payload?.error || payload?.message || `Storage request failed with status ${response.status}`);
  error.status = response.status;
  if (payload?.code) error.code = payload.code;
  return error;
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...(options.body !== undefined && !(options.body instanceof ArrayBuffer) ? { 'Content-Type': 'application/json' } : {}),
      ...buildRequestContextHeaders(options.headers || {})
    }
  });

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return null;
  return response.json();
};

export const buildStorageUrl = (bucket, path) => {
  const safeBucket = encodeURIComponent(String(bucket || ''));
  const safePath = scopeTenantStoragePath(path)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const activeTenantId = normalizePath(getActiveTenantId());
  const tenantQuery = activeTenantId ? `?tenantId=${encodeURIComponent(activeTenantId)}` : '';

  return `${getApiBaseUrl().replace(/\/$/, '')}/storage/${safeBucket}/${safePath}${tenantQuery}`;
};

export const extractStoragePath = (urlOrPath, bucket) => {
  const value = String(urlOrPath || '');
  const marker = `/storage/${bucket}/`;
  const markerIndex = value.indexOf(marker);

  if (markerIndex >= 0) {
    const encodedPath = value.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
    return decodeURIComponent(encodedPath);
  }

  return normalizePath(value);
};

export const listStorageBuckets = async () => {
  const payload = await requestJson('/api/platform/storage/buckets');
  return payload?.data || [];
};

export const createStorageBucket = async (bucketName) => {
  const normalizedBucketName = String(bucketName || '').trim();
  if (!normalizedBucketName) {
    throw new Error('Bucket name is required.');
  }

  const payload = await requestJson('/api/platform/storage/buckets', {
    method: 'POST',
    body: JSON.stringify({ bucketName: normalizedBucketName })
  });
  return payload?.data || null;
};

export const deleteStorageBucket = async (bucketName) => {
  const normalizedBucketName = String(bucketName || '').trim();
  if (!normalizedBucketName) {
    throw new Error('Bucket name is required.');
  }

  const payload = await requestJson(`/api/platform/storage/buckets/${encodeURIComponent(normalizedBucketName)}`, {
    method: 'DELETE'
  });
  return payload?.data ?? true;
};

export const listTenantFiles = async ({ bucket, path = '' }) => {
  if (!bucket) {
    throw new Error('Bucket is required to list storage files.');
  }

  const payload = await requestJson(
    `/api/platform/storage/list?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(normalizePath(path))}`
  );

  return payload?.data || [];
};

export const uploadTenantFile = async ({ bucket, path, file }) => {
  if (!bucket || !path || !file) {
    throw new Error('Bucket, path and file are required for upload.');
  }

  const arrayBuffer = file instanceof Blob ? await file.arrayBuffer() : file;
  const response = await fetch(
    `${getApiBaseUrl()}/api/platform/storage/upload?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(normalizePath(path))}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': file?.type || 'application/octet-stream',
        ...buildRequestContextHeaders()
      },
      body: arrayBuffer
    }
  );

  if (!response.ok) throw await readError(response);
  const payload = await response.json();
  const storedPath = payload?.data?.path || normalizePath(path);

  return {
    ...payload?.data,
    path: storedPath,
    url: buildStorageUrl(bucket, storedPath)
  };
};

export const downloadTenantFile = async ({ bucket, path }) => {
  if (!bucket || !path) {
    throw new Error('Bucket and path are required for download.');
  }

  const response = await fetch(buildStorageUrl(bucket, path), {
    method: 'GET',
    headers: buildRequestContextHeaders()
  });

  if (!response.ok) throw await readError(response);
  return response.blob();
};

export const deleteTenantFiles = async ({ bucket, paths }) => {
  const normalizedPaths = (Array.isArray(paths) ? paths : [])
    .map((path) => normalizePath(path))
    .filter(Boolean);

  if (!bucket || normalizedPaths.length === 0) {
    return [];
  }

  const payload = await requestJson('/api/platform/storage/objects', {
    method: 'DELETE',
    body: JSON.stringify({ bucket, paths: normalizedPaths })
  });

  return payload?.data || [];
};