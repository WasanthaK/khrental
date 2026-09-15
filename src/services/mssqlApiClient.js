import { getApiBaseUrl, isMssqlApiEnabled } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

const readErrorPayload = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return {
      message: payload?.error || payload?.message || JSON.stringify(payload),
      code: payload?.code || null,
      details: payload?.details
    };
  }

  return {
    message: await response.text().catch(() => ''),
    code: null,
    details: undefined
  };
};

export const requestMssqlApi = async (path, options = {}) => {
  const {
    method = 'GET',
    headers = {},
    body,
    ...rest
  } = options;

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...buildRequestContextHeaders(headers)
    },
    ...(body !== undefined
      ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
      : {}),
    ...rest
  });

  if (!response.ok) {
    const errorPayload = await readErrorPayload(response);
    const error = new Error(errorPayload.message || `MSSQL API request failed with status ${response.status}`);
    error.status = response.status;
    if (errorPayload.code) {
      error.code = errorPayload.code;
    }
    if (errorPayload.details !== undefined) {
      error.details = errorPayload.details;
    }
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json();
    return payload?.data ?? payload;
  }

  return response.text();
};

export { isMssqlApiEnabled };
