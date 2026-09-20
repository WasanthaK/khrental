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
