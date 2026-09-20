import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

const normalizePath = (value = '') => String(value || '')
  .replace(/\\/g, '/')
  .replace(/^\/+|\/+$/g, '');

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
  const safePath = normalizePath(path)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${getApiBaseUrl().replace(/\/$/, '')}/storage/${safeBucket}/${safePath}`;
};

export const extractStoragePath = (urlOrPath, bucket) => {
  const value = String(urlOrPath || '');
  const marker = `/storage/${bucket}/`;
  const markerIndex = value.indexOf(marker);

  if (markerIndex >= 0) {
    return decodeURIComponent(value.slice(markerIndex + marker.length));
  }

  return normalizePath(value);
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
