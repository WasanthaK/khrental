import { getMaintenanceLifecycleRequest } from './maintenanceLifecycleClient';
import { mapMaintenanceLifecycleProjection } from './maintenanceProjectionMapper';

/**
 * One authoritative, tenant-scoped detail read for both routed workspaces.
 * Never fall back to the generic table client after a denial or invalid payload.
 */
export const getAuthorizedMaintenanceDetail = async (requestId) => {
  if (typeof requestId !== 'string' || !requestId.trim()) {
    throw new Error('Maintenance request ID is required');
  }
  const { data, error } = await getMaintenanceLifecycleRequest(requestId);
  if (error) throw error;
  return mapMaintenanceLifecycleProjection(data);
};
