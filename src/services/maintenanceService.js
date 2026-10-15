export * from './maintenanceServiceLegacy.js';
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
