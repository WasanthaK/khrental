import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';
import { platformClient as corePlatformClient } from './platformClientCore';

const readPropertyAssignmentError = async (response) => {
  const payload = await response.json().catch(() => null);
  const error = new Error(payload?.error || payload?.message || `Request failed with status ${response.status}`);
  if (payload?.code) {
    error.code = payload.code;
  }
  error.status = response.status;
  return error;
};

const propertyAssignmentRequest = async (path = '', options = {}) => {
  const response = await fetch(`${getApiBaseUrl()}/api/property-assignments${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...buildRequestContextHeaders(options.headers || {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });

  if (!response.ok) {
    throw await readPropertyAssignmentError(response);
  }

  return response.json();
};

export const listPropertyAssignments = async ({ staffUserId, propertyId, status } = {}) => {
  try {
    const params = new URLSearchParams();
    if (staffUserId) params.set('staffUserId', staffUserId);
    if (propertyId) params.set('propertyId', propertyId);
    if (status) params.set('status', status);
    const query = params.toString();
    const payload = await propertyAssignmentRequest(query ? `?${query}` : '');
    return { data: payload?.data || [], error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const assignPropertyToStaff = async ({ staffUserId, propertyId, notes = null }) => {
  try {
    const payload = await propertyAssignmentRequest('', {
      method: 'POST',
      body: { staffUserId, propertyId, notes }
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const updatePropertyAssignment = async (assignmentId, updates = {}) => {
  try {
    const payload = await propertyAssignmentRequest(`/${encodeURIComponent(assignmentId)}`, {
      method: 'PATCH',
      body: updates
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const deletePropertyAssignment = async (assignmentId) => {
  try {
    const payload = await propertyAssignmentRequest(`/${encodeURIComponent(assignmentId)}`, {
      method: 'DELETE'
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export {
  platformClient,
  platform,
  getPlatformClient,
  getActiveTenantId,
  setActiveTenantId,
  clearActiveTenantId,
  getCurrentUser,
  signIn,
  signUp,
  signOut,
  resetPassword,
  updatePassword,
  fetchData,
  selectData,
  insertData,
  upsertData,
  updateData,
  deleteData,
  uploadFile,
  getFileUrl,
  getPublicUrl,
  deleteFile,
  createStorageBucket,
  listBuckets,
  getBucket,
  updateBucket,
  checkUserExists,
  query,
  execute,
  inviteUser,
  inviteTeamMember,
  toDatabaseFormat,
  storage,
  auth,
  rpc
} from './platformClientCore';

export default corePlatformClient;
