import { saveImage } from './fileService';
import {
  attachMaintenanceLifecycleImage,
  getMaintenanceLifecycleRequest
} from './maintenanceLifecycleClient';
import { createMaintenanceImageAttachment } from './maintenanceImageAttachment';

export const addMaintenanceRequestImage = createMaintenanceImageAttachment({
  getRequest: getMaintenanceLifecycleRequest,
  uploadImage: saveImage,
  attachImage: attachMaintenanceLifecycleImage
});
