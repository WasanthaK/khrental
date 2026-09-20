import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

const readApiError = async (response) => {
  const payload = await response.json().catch(() => null);
  const error = new Error(payload?.error || payload?.message || `Request failed with status ${response.status}`);
  if (payload?.code) error.code = payload.code;
  if (payload?.details) error.details = payload.details;
  error.status = response.status;
  return error;
};

const request = async (path = '', options = {}) => {
  const response = await fetch(`${getApiBaseUrl()}/api/maintenance-lifecycle${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...buildRequestContextHeaders(options.headers || {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });

  if (!response.ok) throw await readApiError(response);
  return response.json();
};

const result = async (operation) => {
  try {
    const payload = await operation();
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const createMaintenanceLifecycleRequest = (input = {}) => result(() => request('/requests', {
  method: 'POST',
  body: input
}));

export const getMaintenanceLifecycleRequest = (requestId) => result(() => request(
  `/requests/${encodeURIComponent(requestId)}`
));

export const assignMaintenanceLifecycleRequest = (requestId, assignment = {}) => result(() => request(
  `/requests/${encodeURIComponent(requestId)}/assign`,
  { method: 'POST', body: assignment }
));

export const startMaintenanceLifecycleRequest = (requestId) => result(() => request(
  `/requests/${encodeURIComponent(requestId)}/start`,
  { method: 'POST', body: {} }
));

export const completeMaintenanceLifecycleRequest = (requestId, completion = {}) => result(() => request(
  `/requests/${encodeURIComponent(requestId)}/complete`,
  { method: 'POST', body: completion }
));

export const cancelMaintenanceLifecycleRequest = (requestId, reason) => result(() => request(
  `/requests/${encodeURIComponent(requestId)}/cancel`,
  { method: 'POST', body: { reason } }
));

export const addMaintenanceLifecycleComment = (requestId, comment = {}) => result(() => request(
  `/requests/${encodeURIComponent(requestId)}/comments`,
  { method: 'POST', body: comment }
));
