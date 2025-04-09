import { supabase } from './supabaseClient';
import { 
  MaintenanceRequest, 
  MaintenanceRequestImage, 
  MaintenanceRequestComment,
  CreateMaintenanceRequestInput,
  UpdateMaintenanceRequestInput,
  AddMaintenanceRequestImageInput,
  AddMaintenanceRequestCommentInput,
  MaintenanceStatus,
  MaintenanceImageType
} from '../types/maintenance';
import { saveFile, STORAGE_BUCKETS, BUCKET_FOLDERS } from './fileService';
import { notifyUser } from './notificationService';

/**
 * Create a new maintenance request
 */
export const createMaintenanceRequest = async (
  input: CreateMaintenanceRequestInput,
  userId: string
): Promise<MaintenanceRequest> => {
  try {
    // Upload initial images if any
    const imageUrls: string[] = [];
    if (input.images && input.images.length > 0) {
      for (const file of input.images) {
        const { url } = await saveFile(file, {
          bucket: STORAGE_BUCKETS.IMAGES,
          folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
        });
        imageUrls.push(url);
      }
    }

    // Create maintenance request
    const { data: request, error } = await supabase
      .from('maintenance_requests')
      .insert({
        ...input,
        renteeid: userId,
        status: MaintenanceStatus.PENDING,
        images: imageUrls
      })
      .select(`
        *,
        property:propertyid(*),
        rentee:renteeid(*)
      `)
      .single();

    if (error) throw error;

    // Notify staff about new request
    await notifyUser({
      type: 'new_maintenance_request',
      userId: request.id,
      title: 'New Maintenance Request',
      message: `A new maintenance request has been created for ${request.property.name}`
    });

    return request;
  } catch (error) {
    console.error('Error creating maintenance request:', error);
    throw error;
  }
};

/**
 * Get maintenance requests based on user role
 */
export const getMaintenanceRequests = async (userId: string, userRole: string): Promise<MaintenanceRequest[]> => {
  try {
    let query = supabase
      .from('maintenance_requests')
      .select(`
        *,
        property:propertyid(*),
        rentee:renteeid(*),
        assignedStaff:assignedto(*),
        images:maintenance_request_images(*),
        comments:maintenance_request_comments(*)
      `)
      .order('createdat', { ascending: false });

    // Filter based on user role
    if (userRole === 'rentee') {
      query = query.eq('renteeid', userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error fetching maintenance requests:', error);
    throw error;
  }
};

/**
 * Get a single maintenance request
 */
export const getMaintenanceRequest = async (id: string): Promise<MaintenanceRequest> => {
  try {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .select(`
        *,
        property:propertyid(*),
        rentee:renteeid(*),
        assignedStaff:assignedto(*),
        images:maintenance_request_images(*),
        comments:maintenance_request_comments(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching maintenance request:', error);
    throw error;
  }
};

/**
 * Update a maintenance request
 */
export const updateMaintenanceRequest = async (
  id: string,
  input: UpdateMaintenanceRequestInput
): Promise<MaintenanceRequest> => {
  try {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .update({
        ...input,
        updatedat: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        property:propertyid(*),
        rentee:renteeid(*),
        assignedStaff:assignedto(*),
        images:maintenance_request_images(*),
        comments:maintenance_request_comments(*)
      `)
      .single();

    if (error) throw error;

    // Notify relevant users about status changes
    if (input.status) {
      await notifyUser({
        type: 'maintenance_status_update',
        userId: data.renteeid,
        title: 'Maintenance Request Status Updated',
        message: `Your maintenance request for ${data.property.name} has been updated to ${input.status}`
      });
    }

    return data;
  } catch (error) {
    console.error('Error updating maintenance request:', error);
    throw error;
  }
};

/**
 * Add an image to a maintenance request
 */
export const addMaintenanceRequestImage = async (
  input: AddMaintenanceRequestImageInput,
  userId: string
): Promise<MaintenanceRequestImage> => {
  try {
    // Upload image
    const { url } = await saveFile(input.image, {
      bucket: STORAGE_BUCKETS.IMAGES,
      folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
    });

    // Create image record
    const { data, error } = await supabase
      .from('maintenance_request_images')
      .insert({
        maintenance_request_id: input.maintenance_request_id,
        image_url: url,
        image_type: input.image_type,
        uploaded_by: userId,
        description: input.description
      })
      .select(`
        *,
        uploadedByUser:uploaded_by(*)
      `)
      .single();

    if (error) throw error;

    // Notify relevant users about new image
    await notifyUser({
      type: 'maintenance_image_added',
      userId: input.maintenance_request_id,
      title: 'New Maintenance Request Image',
      message: 'A new image has been added to your maintenance request'
    });

    return data;
  } catch (error) {
    console.error('Error adding maintenance request image:', error);
    throw error;
  }
};

/**
 * Add a comment to a maintenance request
 */
export const addMaintenanceRequestComment = async (
  input: AddMaintenanceRequestCommentInput,
  userId: string
): Promise<MaintenanceRequestComment> => {
  try {
    const { data, error } = await supabase
      .from('maintenance_request_comments')
      .insert({
        ...input,
        user_id: userId
      })
      .select(`
        *,
        user:user_id(*)
      `)
      .single();

    if (error) throw error;

    // Notify relevant users about new comment
    await notifyUser({
      type: 'maintenance_comment_added',
      userId: input.maintenance_request_id,
      title: 'New Maintenance Request Comment',
      message: 'A new comment has been added to your maintenance request'
    });

    return data;
  } catch (error) {
    console.error('Error adding maintenance request comment:', error);
    throw error;
  }
};

/**
 * Assign staff to a maintenance request
 */
export const assignMaintenanceRequest = async (
  requestId: string,
  staffId: string
): Promise<MaintenanceRequest> => {
  try {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .update({
        assignedto: staffId,
        assignedat: new Date().toISOString(),
        status: MaintenanceStatus.ASSIGNED
      })
      .eq('id', requestId)
      .select(`
        *,
        property:propertyid(*),
        rentee:renteeid(*),
        assignedStaff:assignedto(*),
        images:maintenance_request_images(*),
        comments:maintenance_request_comments(*)
      `)
      .single();

    if (error) throw error;

    // Notify relevant users
    await notifyUser({
      type: 'maintenance_assigned',
      userId: data.renteeid,
      title: 'Maintenance Request Assigned',
      message: `Your maintenance request for ${data.property.name} has been assigned to staff`
    });

    return data;
  } catch (error) {
    console.error('Error assigning maintenance request:', error);
    throw error;
  }
};

/**
 * Start maintenance work
 */
export const startMaintenanceWork = async (requestId: string): Promise<MaintenanceRequest> => {
  try {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .update({
        status: MaintenanceStatus.IN_PROGRESS,
        startedat: new Date().toISOString()
      })
      .eq('id', requestId)
      .select(`
        *,
        property:propertyid(*),
        rentee:renteeid(*),
        assignedStaff:assignedto(*),
        images:maintenance_request_images(*),
        comments:maintenance_request_comments(*)
      `)
      .single();

    if (error) throw error;

    // Notify relevant users
    await notifyUser({
      type: 'maintenance_started',
      userId: data.renteeid,
      title: 'Maintenance Work Started',
      message: `Work has started on your maintenance request for ${data.property.name}`
    });

    return data;
  } catch (error) {
    console.error('Error starting maintenance work:', error);
    throw error;
  }
};

/**
 * Complete maintenance request
 */
export const completeMaintenanceRequest = async (
  requestId: string,
  notes: string,
  images?: File[]
): Promise<MaintenanceRequest> => {
  try {
    // Upload completion images if any
    const imageUrls: string[] = [];
    if (images && images.length > 0) {
      for (const file of images) {
        const { url } = await saveFile(file, {
          bucket: STORAGE_BUCKETS.IMAGES,
          folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
        });
        imageUrls.push(url);
      }
    }

    // Update request status
    const { data, error } = await supabase
      .from('maintenance_requests')
      .update({
        status: MaintenanceStatus.COMPLETED,
        completedat: new Date().toISOString(),
        notes
      })
      .eq('id', requestId)
      .select(`
        *,
        property:propertyid(*),
        rentee:renteeid(*),
        assignedStaff:assignedto(*),
        images:maintenance_request_images(*),
        comments:maintenance_request_comments(*)
      `)
      .single();

    if (error) throw error;

    // Add completion images if any
    if (imageUrls.length > 0) {
      for (const url of imageUrls) {
        await supabase
          .from('maintenance_request_images')
          .insert({
            maintenance_request_id: requestId,
            image_url: url,
            image_type: MaintenanceImageType.COMPLETION,
            uploaded_by: data.assignedto
          });
      }
    }

    // Notify relevant users
    await notifyUser({
      type: 'maintenance_completed',
      userId: data.renteeid,
      title: 'Maintenance Request Completed',
      message: `Your maintenance request for ${data.property.name} has been completed`
    });

    return data;
  } catch (error) {
    console.error('Error completing maintenance request:', error);
    throw error;
  }
};

/**
 * Cancel maintenance request
 */
export const cancelMaintenanceRequest = async (
  requestId: string,
  reason: string
): Promise<MaintenanceRequest> => {
  try {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .update({
        status: MaintenanceStatus.CANCELLED,
        cancelledat: new Date().toISOString(),
        cancellationreason: reason
      })
      .eq('id', requestId)
      .select(`
        *,
        property:propertyid(*),
        rentee:renteeid(*),
        assignedStaff:assignedto(*),
        images:maintenance_request_images(*),
        comments:maintenance_request_comments(*)
      `)
      .single();

    if (error) throw error;

    // Notify relevant users
    await notifyUser({
      type: 'maintenance_cancelled',
      userId: data.renteeid,
      title: 'Maintenance Request Cancelled',
      message: `Your maintenance request for ${data.property.name} has been cancelled`
    });

    return data;
  } catch (error) {
    console.error('Error cancelling maintenance request:', error);
    throw error;
  }
};

const uploadMaintenanceImage = async (file: File) => {
  const result = await saveFile(file, {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to upload maintenance image');
  }

  return { url: result.url };
};

const uploadImage = async (image: File) => {
  const result = await saveFile(image, {
    bucket: STORAGE_BUCKETS.IMAGES,
    folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to upload image');
  }

  return { url: result.url };
}; 