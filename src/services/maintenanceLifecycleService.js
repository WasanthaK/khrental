import { platform as platformClient } from './platformClient';
import { saveImage } from './fileService';
import {
  notifyStaffAboutNewRequest,
  notifyAboutAssignment,
  notifyRenteeAboutWorkStarted,
  notifyRenteeAboutCompletion,
  notifyAboutCancellation
} from './notificationService';
import {
  assignMaintenanceLifecycleRequest,
  cancelMaintenanceLifecycleRequest,
  completeMaintenanceLifecycleRequest,
  createMaintenanceLifecycleRequest,
  startMaintenanceLifecycleRequest
} from './maintenanceLifecycleClient';

const fetchCompleteRequest = async (requestId) => {
  const { data, error } = await platformClient
    .from('maintenance_requests')
    .select(`
      *,
      property:properties!maintenance_requests_propertyid_fkey(*),
      rentee:app_users!maintenance_requests_renteeid_fkey(*),
      assigned_staff:app_users!maintenance_requests_assignedto_fkey(*),
      maintenance_request_images(*)
    `)
    .eq('id', requestId)
    .single();

  if (error) throw error;
  return data;
};

const uploadLifecycleImages = async (requestId, images = [], imageType = 'additional') => {
  const uploaded = [];
  for (const image of Array.isArray(images) ? images : []) {
    try {
      let imageUrl = null;
      if (typeof image === 'string') imageUrl = image;
      else if (image?.url) imageUrl = image.url;
      else if (image?.file || (typeof File !== 'undefined' && image instanceof File)) {
        const result = await saveImage(image.file || image, { folder: 'maintenance' });
        if (result?.success && result.url) imageUrl = result.url;
      }
      if (!imageUrl) continue;

      const { error } = await platformClient
        .from('maintenance_request_images')
        .insert({
          maintenance_request_id: requestId,
          image_url: imageUrl,
          image_type: imageType,
          description: image?.description || '',
          uploaded_at: new Date().toISOString()
        });
      if (!error) uploaded.push(imageUrl);
    } catch (error) {
      console.error('Error uploading maintenance lifecycle image:', error);
    }
  }
  return uploaded;
};

const bestEffortNotify = async (notifier, payload) => {
  try {
    await notifier(payload);
  } catch (error) {
    console.error('Maintenance notification failed:', error);
  }
};

export const createMaintenanceRequest = async (input = {}) => {
  try {
    if (!input.title || !input.description || !input.propertyid) {
      return { success: false, error: 'Missing required fields' };
    }

    const { data, error } = await createMaintenanceLifecycleRequest({
      title: input.title,
      description: input.description,
      propertyId: input.propertyid,
      priority: input.priority || 'medium',
      requestType: input.requesttype || 'other',
      notes: input.notes || null
    });
    if (error) throw error;

    await uploadLifecycleImages(data.id, input.images, 'initial');
    const completeRequest = await fetchCompleteRequest(data.id);
    await bestEffortNotify(notifyStaffAboutNewRequest, completeRequest);
    return { success: true, data: completeRequest };
  } catch (error) {
    console.error('Error creating maintenance request through lifecycle API:', error);
    return { success: false, error: error.message || 'Failed to create maintenance request' };
  }
};

export const assignMaintenanceRequest = async (id, assignmentData = {}) => {
  try {
    if (!id || !assignmentData.staffId) {
      return { success: false, error: 'Invalid assignment data' };
    }

    const { data, error } = await assignMaintenanceLifecycleRequest(id, {
      staffUserId: assignmentData.staffId,
      scheduledAt: assignmentData.scheduledDate || null
    });
    if (error) throw error;

    await uploadLifecycleImages(id, assignmentData.assignmentImages, 'additional');
    const completeRequest = await fetchCompleteRequest(id);
    await bestEffortNotify(notifyAboutAssignment, completeRequest || data);
    return { success: true, data: completeRequest || data };
  } catch (error) {
    console.error('Error assigning maintenance request through lifecycle API:', error);
    return { success: false, error: error.message || 'Failed to assign maintenance request' };
  }
};

export const startMaintenanceWork = async (id) => {
  try {
    const { data, error } = await startMaintenanceLifecycleRequest(id);
    if (error) throw error;
    const completeRequest = await fetchCompleteRequest(id).catch(() => data);
    await bestEffortNotify(notifyRenteeAboutWorkStarted, completeRequest || data);
    return { success: true, data: completeRequest || data };
  } catch (error) {
    console.error('Error starting maintenance work through lifecycle API:', error);
    return { success: false, error: error.message || 'Failed to start maintenance work' };
  }
};

export const completeMaintenanceRequest = async (id, completionData = {}) => {
  try {
    if (!id) return { success: false, error: 'Request ID is required' };

    const uploadedImages = await uploadLifecycleImages(id, completionData.images, 'completion');
    const { data, error } = await completeMaintenanceLifecycleRequest(id, {
      notes: completionData.notes || null,
      ...(completionData.completionCost !== undefined ? { completionCost: completionData.completionCost } : {})
    });
    if (error) throw error;

    const completeRequest = await fetchCompleteRequest(id).catch(() => data);
    await bestEffortNotify(notifyRenteeAboutCompletion, completeRequest || data);
    return {
      success: true,
      data: { ...(completeRequest || data), uploadedImages }
    };
  } catch (error) {
    console.error('Error completing maintenance request through lifecycle API:', error);
    return { success: false, error: error.message || 'Failed to complete maintenance request' };
  }
};

export const cancelMaintenanceRequest = async (id, reason) => {
  try {
    const { data, error } = await cancelMaintenanceLifecycleRequest(id, reason);
    if (error) throw error;
    const completeRequest = await fetchCompleteRequest(id).catch(() => data);
    await bestEffortNotify(notifyAboutCancellation, completeRequest || data);
    return { success: true, data: completeRequest || data };
  } catch (error) {
    console.error('Error cancelling maintenance request through lifecycle API:', error);
    return { success: false, error: error.message || 'Failed to cancel maintenance request' };
  }
};

export const updateMaintenanceStatus = async (id, status, additionalData = {}) => {
  if (status === 'in_progress') {
    const result = await startMaintenanceWork(id);
    if (!result.success) throw new Error(result.error);
    return result.data;
  }
  if (status === 'completed') {
    const result = await completeMaintenanceRequest(id, additionalData);
    if (!result.success) throw new Error(result.error);
    return result.data;
  }
  if (status === 'cancelled') {
    const reason = additionalData.cancellationreason || additionalData.reason;
    const result = await cancelMaintenanceRequest(id, reason);
    if (!result.success) throw new Error(result.error);
    return result.data;
  }
  throw new Error(`Unsupported maintenance lifecycle status: ${status}`);
};
