import { getAuthorizedMaintenanceDetail } from './maintenanceDetailReadService';
import { listAuthorizedMaintenanceRequests } from './maintenanceListReadService';
import { addMaintenanceComment } from './maintenanceLifecycleService';

/**
 * This module preserves selected historical method names without exposing
 * direct maintenance_requests CRUD. Actor/tenant/property scope is always
 * decided by the server's authenticated lifecycle endpoints.
 */
export const getMaintenanceRequest = async (requestId) => {
  try {
    return { data: await getAuthorizedMaintenanceDetail(requestId), error: null };
  } catch (error) {
    return { data: null, error };
  }
};

// The historical userId/role inputs are intentionally NOT forwarded to SQL.
export const getMaintenanceRequests = async (_userId, _role) =>
  listAuthorizedMaintenanceRequests();

export const addMaintenanceRequestComment = async (input = {}) => {
  const id = input.maintenance_request_id;
  if (!id || !String(input.comment || '').trim()) {
    return { success: false, data: null, error: 'Request and comment are required' };
  }
  return addMaintenanceComment(id, {
    comment: input.comment,
    isInternal: Boolean(input.isInternal ?? input.is_internal)
  });
};

const unsupportedMutation = () => {
  const error = new Error('Generic maintenance updates and deletes are not supported. Use governed lifecycle actions.');
  error.code = 'MAINTENANCE_GENERIC_MUTATION_DISABLED';
  return error;
};

// Retain callable compatibility names, but do not perform generic SQL updates.
export const updateMaintenanceRequest = async () => ({
  success: false, data: null, error: unsupportedMutation().message
});

export const deleteMaintenanceRequest = async () => {
  throw unsupportedMutation();
};
