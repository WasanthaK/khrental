// Export only audited compatibility names; never wildcard-export generic SQL writers.
export {
  getMaintenanceRequest,
  getMaintenanceRequests,
  addMaintenanceRequestComment,
  updateMaintenanceRequest,
  deleteMaintenanceRequest
} from './maintenanceCompatibilityBoundary.js';
export {
  addMaintenanceComment,
  getMaintenanceComments,
  createMaintenanceRequest,
  assignMaintenanceRequest,
  startMaintenanceWork,
  completeMaintenanceRequest,
  cancelMaintenanceRequest,
  updateMaintenanceStatus
} from './maintenanceLifecycleService.js';

// Explicit export shadows the legacy generic maintenance_request_images writer.
export { addMaintenanceRequestImage } from './maintenanceImageService.js';
