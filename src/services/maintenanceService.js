import { supabase } from './supabaseClient';
import { MAINTENANCE_STATUS } from '../utils/constants';
import { notifyUser } from './notificationService';
import { toDatabaseFormat, fromDatabaseFormat } from '../utils/databaseUtils';
import { fetchData, insertData, updateData, deleteData } from './supabaseClient';
import { saveFile, STORAGE_BUCKETS, BUCKET_FOLDERS } from './fileService';

/**
 * Create a new maintenance request
 * @param {Object} input - The maintenance request input data
 * @param {string} userId - The ID of the user creating the request
 * @returns {Promise<Object>} The created maintenance request
 */
export const createMaintenanceRequest = async (input, userId) => {
  try {
    console.log('Creating maintenance request with:', { input, userId });
    
    // Create maintenance request first (without images)
    const requestData = { ...input };
    delete requestData.images; // Remove images from the main request data

    // Fetch user data to verify role and get user information
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .select('id, role, associated_property_ids')
      .eq('auth_id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      throw new Error('Could not verify user information');
    }

    if (!userData) {
      console.error('User not found in app_users');
      throw new Error('User not found');
    }

    console.log('Found user in app_users:', userData);

    // Ensure propertyid is set correctly
    let propertyId = requestData.propertyid || requestData.propertyId;

    // If no property ID is provided, try to get it from user's associated properties
    if (!propertyId && userData.associated_property_ids && userData.associated_property_ids.length > 0) {
      propertyId = userData.associated_property_ids[0];
      console.log('Using first associated property:', propertyId);
    }

    if (!propertyId) {
      console.error('No property ID provided or found in user data');
      throw new Error('Property ID is required for maintenance requests');
    }

    console.log('Using property ID for request:', propertyId);

    // Convert camelCase to snake_case for database
    const dbRequestData = {
      propertyid: propertyId,
      renteeid: userData.id,
      title: requestData.title,
      description: requestData.description,
      priority: requestData.priority,
      status: 'pending',
      requesttype: requestData.requesttype || requestData.requestType,
      notes: requestData.notes || ''
    };

    console.log('Creating maintenance request with data:', dbRequestData);

    const { data: request, error: requestError } = await supabase
      .from('maintenance_requests')
      .insert(dbRequestData)
      .select(`
        *,
        property:properties(*),
        rentee:app_users!renteeid(*),
        maintenance_request_images(*)
      `)
      .single();

    if (requestError) {
      console.error('Error creating maintenance request:', requestError);
      throw requestError;
    }

    console.log('Created maintenance request:', request);

    // Upload images and create entries in maintenance_request_images if images exist
    if (input.images && Array.isArray(input.images) && input.images.length > 0) {
      console.log('Processing images:', input.images);
      
      for (const imageUrl of input.images) {
        try {
          console.log('Creating image record for URL:', imageUrl);
          
          // Create entry in maintenance_request_images table
          const { data: imageData, error: imageError } = await supabase
            .from('maintenance_request_images')
            .insert({
              maintenance_request_id: request.id,
              image_url: imageUrl,
              image_type: 'initial',
              uploaded_by: userData.id,
              uploaded_at: new Date().toISOString(),
              description: 'Initial maintenance request image'
            })
            .select()
            .single();

          if (imageError) {
            console.error('Error creating image record:', imageError);
            // Don't throw here, just log and continue
            continue;
          }

          console.log('Successfully created image record:', imageData);
        } catch (imageError) {
          console.error('Error processing image:', imageError);
          // Don't throw here, just log and continue
          continue;
        }
      }
    } else {
      console.log('No images to process');
    }

    // Fetch the complete request with images
    const { data: completeRequest, error: fetchError } = await supabase
      .from('maintenance_requests')
      .select(`
        *,
        property:properties(*),
        rentee:app_users!renteeid(*),
        assigned_staff:app_users!assignedto(*),
        maintenance_request_images(*)
      `)
      .eq('id', request.id)
      .single();

    if (fetchError) {
      console.error('Error fetching complete request:', fetchError);
      return request; // Return the original request if we can't fetch the complete one
    }

    console.log('Complete request with images:', completeRequest);
    return completeRequest;
  } catch (error) {
    console.error('Error creating maintenance request:', error);
    throw error;
  }
};

/**
 * Get a maintenance request by ID
 * @param {string} requestId - The maintenance request ID
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export async function getMaintenanceRequest(requestId) {
  try {
    // Use fetchData from supabaseClient with the correct parameters
    const { data, error } = await fetchData({
      table: 'maintenance_requests',
      id: requestId,
      select: `
        *,
        maintenance_request_images (
          id,
          maintenance_request_id,
          image_url,
          image_type,
          uploaded_by,
          uploaded_at,
          description
        )
      `
    });

    if (error) {
      throw error;
    }

    return { data, error };
  } catch (error) {
    console.error('Error fetching maintenance request:', error.message);
    return { data: null, error: new Error('Failed to fetch maintenance request details.') };
  }
}

/**
 * Update an existing maintenance request
 * @param {string} id - The maintenance request ID
 * @param {Object} updateData - The updated maintenance request data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export async function updateMaintenanceRequest(id, updateData) {
  try {
    // Process images if any
    let processedImages = [];
    if (updateData.images && updateData.images.length > 0) {
      processedImages = await Promise.all(
        updateData.images.map(async (image) => {
          if (image.file) {
            // Use fileService instead of uploadImage
            const { url } = await saveFile(image.file, {
              bucket: STORAGE_BUCKETS.IMAGES,
              folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
            });
            return url;
          }
          return image.url || image;
        })
      );
    }

    // Convert to database format (lowercase keys)
    const dbData = toDatabaseFormat({
      ...updateData,
      images: processedImages,
      updatedAt: new Date().toISOString(),
    });

    // Remove any temporary properties
    delete dbData.file;

    // Update in database
    const { data, error } = await supabase
      .from('maintenance_requests')
      .update(dbData)
      .eq('id', id)
      .select();

    if (error) {
      throw error;
    }

    // Convert back to camelCase for frontend
    return {
      success: true,
      data: fromDatabaseFormat(data[0]),
      error: null
    };
  } catch (error) {
    console.error('Error updating maintenance request:', error.message);
    return {
      success: false,
      data: null,
      error: 'Failed to update maintenance request. Please try again.'
    };
  }
}

/**
 * Assign a maintenance request to a staff member
 * @param {string} id - The request ID
 * @param {Object} assignmentData - The assignment data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const assignMaintenanceRequest = async (id, assignmentData) => {
  try {
    console.log(`Assigning maintenance request ${id} to staff ${assignmentData.staffId}`);
    
    // Validate the assignment data
    if (!id || !assignmentData || !assignmentData.staffId) {
      return { success: false, error: 'Invalid assignment data' };
    }
    
    // Create the update object
    const dataToUpdate = {
      assignedto: assignmentData.staffId,
      assignedat: assignmentData.scheduledDate,
      updatedat: new Date().toISOString()
    };
    
    // Add notes if provided
    if (assignmentData.notes) {
      dataToUpdate.notes = assignmentData.notes;
    }

    // First update the maintenance request
    const { data: updatedRequest, error: updateError } = await updateData('maintenance_requests', id, dataToUpdate);
    
    if (updateError) {
      console.error('Error updating request:', updateError.message || JSON.stringify(updateError));
      return { 
        success: false, 
        error: updateError.message || 'Failed to assign request' 
      };
    }

    // If there are assignment images, create entries in maintenance_request_images
    if (assignmentData.assignmentImages && assignmentData.assignmentImages.length > 0) {
      console.log('Processing assignment images:', assignmentData.assignmentImages);
      
      for (const image of assignmentData.assignmentImages) {
        try {
          // Skip if image is undefined or null
          if (!image) {
            console.log('Skipping undefined/null image');
            continue;
          }

          // If image is a File object, upload it first
          let imageUrl = null;
          if (image instanceof File) {
            const result = await saveFile(image, {
              bucket: STORAGE_BUCKETS.IMAGES,
              folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
            });
            if (!result.success) {
              console.error('Failed to upload image:', result.error);
              continue;
            }
            imageUrl = result.url;
          } else {
            // If image is already a URL string
            imageUrl = image;
          }

          // Only create record if we have a valid URL
          if (imageUrl) {
            const { error: imageError } = await supabase
              .from('maintenance_request_images')
              .insert({
                maintenance_request_id: id,
                image_url: imageUrl,
                image_type: 'assignment',
                uploaded_by: assignmentData.staffId,
                uploaded_at: new Date().toISOString(),
                description: 'Assignment inspection image'
              });

            if (imageError) {
              console.error('Error creating image record:', imageError);
            }
          }
        } catch (imageError) {
          console.error('Error processing image:', imageError);
          // Continue with other images even if one fails
        }
      }
    }
    
    // Try to send notifications
    try {
      // Notify the assigned staff member
      await notifyStaffAboutAssignment(updatedRequest);
      
      // Notify the rentee about the assignment
      await notifyRenteeAboutAssignment(updatedRequest);
    } catch (notificationError) {
      console.error('Error sending notifications:', notificationError.message || JSON.stringify(notificationError));
      // Continue even if notifications fail
    }

    // Fetch the updated request with images
    const { data: completeRequest, error: fetchError } = await supabase
      .from('maintenance_requests')
      .select(`
        *,
        maintenance_request_images (*)
      `)
      .eq('id', id)
      .single();
    
    return { 
      success: true, 
      data: completeRequest || updatedRequest 
    };
  } catch (error) {
    console.error('Error assigning maintenance request:', error.message || JSON.stringify(error));
    return { 
      success: false, 
      error: error.message || 'Failed to assign maintenance request' 
    };
  }
};

/**
 * Start work on a maintenance request
 * @param {string} id - The request ID
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const startMaintenanceWork = async (id) => {
  try {
    const requestUpdateData = {
      status: MAINTENANCE_STATUS.IN_PROGRESS,
      updatedat: new Date().toISOString(),
    };
    
    // Use updateData from supabaseClient
    const { data, error } = await updateData('maintenance_requests', id, requestUpdateData);
    
    if (error) {
      throw error;
    }
    
    // Notify the rentee that work has started only if data exists
    if (data) {
      await notifyRenteeAboutWorkStarted(data);
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error starting maintenance work:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Complete a maintenance request
 * @param {string} id - The request ID
 * @param {Object} completionData - The completion data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const completeMaintenanceRequest = async (id, completionData) => {
  try {
    // Upload completion images if any
    let completionImageUrls = [];
    if (completionData.images && completionData.images.length > 0) {
      completionImageUrls = await uploadMaintenanceImages(id, completionData.images, 'completion');
      console.log('Uploaded completion images:', completionImageUrls);
    }
    
    // Create update object
    const updateObject = {
      status: MAINTENANCE_STATUS.COMPLETED,
      completedat: new Date().toISOString(),
      notes: completionData.notes,
      updatedat: new Date().toISOString()
    };
    
    console.log('Updating maintenance request with completion data:', updateObject);
    
    // Update the request
    const { data, error } = await updateData('maintenance_requests', id, updateObject);
    
    if (error) {
      throw error;
    }
    
    // Notify the rentee that the request has been completed
    await notifyRenteeAboutCompletion(data);
    
    return { success: true, data };
  } catch (error) {
    console.error('Error completing maintenance request:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to complete maintenance request' 
    };
  }
};

/**
 * Cancel a maintenance request
 * @param {string} id - The request ID
 * @param {string} reason - The cancellation reason
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const cancelMaintenanceRequest = async (id, reason) => {
  try {
    console.log(`Cancelling maintenance request ${id} with reason: ${reason}`);
    
    // First get the current request to preserve existing notes
    const { data: currentRequest, error: fetchError } = await supabase
      .from('maintenance_requests')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      console.error('Error fetching request for cancellation:', fetchError);
      throw new Error('Could not fetch maintenance request');
    }
    
    console.log('Current request before cancellation:', currentRequest);
    
    // Get the current user's role and ID
    const { data: { user } } = await supabase.auth.getUser();
    const { data: userData } = await supabase
      .from('app_users')
      .select('id, role')
      .eq('auth_id', user.id)
      .single();
    
    console.log('Current user data:', userData);
    console.log('Request renteeid:', currentRequest.renteeid);
    
    const cancellationNote = `Cancellation reason: ${reason}`;
    let updatedNotes = cancellationNote;
    
    // Only try to access notes if currentRequest exists
    if (currentRequest && currentRequest.notes) {
      updatedNotes = `${currentRequest.notes}\n\n${cancellationNote}`;
    }
    
    const updateFields = {
      status: 'cancelled',
      notes: updatedNotes,
      cancellationreason: reason,
      cancelledat: new Date().toISOString(), 
      updatedat: new Date().toISOString(),
    };
    
    console.log('Updating request with cancellation data:', updateFields);
    
    // Update the request
    const { error: updateError } = await supabase
      .from('maintenance_requests')
      .update(updateFields)
      .eq('id', id);
    
    if (updateError) {
      console.error('Error updating maintenance request:', updateError);
      throw updateError;
    }
    
    // Then fetch the updated request with all relations
    const { data: updatedRequest, error: selectError } = await supabase
      .from('maintenance_requests')
      .select(`
        *,
        property:properties!maintenance_requests_propertyid_fkey(*),
        rentee:app_users!maintenance_requests_renteeid_fkey(*),
        assigned_staff:app_users!maintenance_requests_assignedto_fkey(*),
        maintenance_request_images(*)
      `)
      .eq('id', id)
      .single();
    
    if (selectError) {
      console.error('Error fetching updated request:', selectError);
      throw selectError;
    }
    
    console.log('Updated request after cancellation:', updatedRequest);
    
    return {
      success: true,
      data: updatedRequest
    };
    
  } catch (error) {
    console.error('Error cancelling maintenance request:', error);
    return {
      success: false,
      error: error.message || 'Failed to cancel maintenance request'
    };
  }
};

/**
 * Add a comment to a maintenance request
 * @param {string} requestId - The request ID
 * @param {Object} commentData - The comment data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const addMaintenanceComment = async (requestId, commentData) => {
  try {
    // Get current request to preserve existing notes
    const { data: currentRequest, error: fetchError } = await supabase
      .from('maintenance_requests')
      .select('notes')
      .eq('id', requestId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    // Parse existing notes
    let existingNotes = [];
    try {
      existingNotes = currentRequest.notes ? JSON.parse(currentRequest.notes) : [];
      if (!Array.isArray(existingNotes)) {
        existingNotes = [existingNotes];
      }
    } catch (e) {
      // If parsing fails, treat existing notes as a single comment
      existingNotes = currentRequest.notes ? [{
        content: currentRequest.notes,
        createdat: new Date().toISOString()
      }] : [];
    }

    // Create new comment object
    const newComment = {
      content: commentData.content,
      createdBy: commentData.createdBy,
      role: commentData.role,
      createdat: new Date().toISOString(),
      isInternal: commentData.isInternal || false,
      isAdminMessage: commentData.isAdminMessage || false
    };

    // Add new comment to existing notes
    const updatedNotes = [...existingNotes, newComment];

    // Update the request with new notes
    const { error: updateError } = await supabase
      .from('maintenance_requests')
      .update({
        notes: JSON.stringify(updatedNotes),
        updatedat: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      throw updateError;
    }

    return {
      success: true,
      data: updatedNotes
    };

  } catch (error) {
    console.error('Error adding maintenance comment:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Upload images for a maintenance request
 * @param {string} requestId - The request ID
 * @param {Array} images - Array of image files or objects
 * @param {string} prefix - Optional prefix for the image filenames
 * @returns {Promise<Array>} - Array of image URLs
 */
const uploadMaintenanceImages = async (requestId, images, prefix = 'request') => {
  const imageUrls = [];
  const errors = [];
  
  if (!images || images.length === 0) {
    console.log('No images to upload');
    return imageUrls;
  }
  
  console.log(`Uploading ${images.length} images for request ${requestId} with prefix ${prefix}`);
  
  for (const image of images) {
    try {
      // If the image is already a URL (not a new file), add it to the array
      if (typeof image === 'string' || (image && image.url)) {
        const url = typeof image === 'string' ? image : image.url;
        imageUrls.push(url);
        console.log(`Added existing image URL: ${url}`);
        continue;
      }
      
      // If the image is a new file, upload it using fileService
      if (image && (image.file || image instanceof File)) {
        const file = image.file || image;
        const subfolder = `${requestId}`;
        
        // Use fileService to save the file
        const result = await saveFile(file, {
          bucket: STORAGE_BUCKETS.IMAGES,
          folder: BUCKET_FOLDERS[STORAGE_BUCKETS.IMAGES].MAINTENANCE
        });
        
        if (result.error) {
          console.error('Error uploading image:', result.error);
          errors.push(result.error);
          continue;
        }
        
        if (result.url) {
          imageUrls.push(result.url);
          console.log(`Uploaded new image: ${result.url}`);
        } else {
          console.error('No URL returned from saveFile');
          errors.push('No URL returned from file upload');
        }
      }
    } catch (error) {
      console.error('Error processing image:', error.message || JSON.stringify(error));
      errors.push(error.message || 'Unknown error processing image');
    }
  }
  
  if (errors.length > 0) {
    console.warn(`Completed image upload with ${errors.length} errors and ${imageUrls.length} successful uploads`);
  }
  
  console.log(`Successfully uploaded ${imageUrls.length} images`);
  return imageUrls;
};

/**
 * Handle status changes and trigger appropriate notifications
 * @param {string} id - The request ID
 * @param {string} newStatus - The new status
 * @param {Object} requestData - The request data
 */
const handleStatusChange = async (id, newStatus, requestData) => {
  if (!requestData || !id) {
    console.log('Cannot handle status change: request data or ID is missing');
    return;
  }

  switch (newStatus) {
    case MAINTENANCE_STATUS.IN_PROGRESS:
      // Add startedAt timestamp if not present
      if (!requestData.startedAt) {
        await updateData('maintenance_requests', id, { startedat: new Date().toISOString() });
      }
      
      // Notify rentee
      await notifyRenteeAboutWorkStarted(requestData);
      break;
      
    case MAINTENANCE_STATUS.COMPLETED:
      // Add completedDate timestamp if not present
      if (!requestData.completedDate) {
        await updateData('maintenance_requests', id, { completeddate: new Date().toISOString() });
      }
      
      // Notify rentee
      await notifyRenteeAboutCompletion(requestData);
      break;
      
    case MAINTENANCE_STATUS.CANCELLED:
      // Add cancelledAt timestamp if not present
      if (!requestData.cancelledat) {
        await updateData('maintenance_requests', id, { cancelledat: new Date().toISOString() });
      }
      
      // Notify relevant parties
      await notifyAboutCancellation(requestData);
      break;
  }
};

// Notification helper functions
// In a real app, these would send actual notifications

const notifyStaffAboutNewRequest = async (request) => {
  // This is a placeholder for notification functionality
  if (!request) {
    console.log('Cannot notify staff: request data is missing');
    return;
  }
  console.log(`Notifying staff about new maintenance request #${request.id}`);
};

const notifyStaffAboutAssignment = async (request) => {
  if (!request) {
    console.log('Cannot notify staff about assignment: request data is missing');
    return;
  }
  if (!request.assignedto) {
    console.log(`Cannot notify staff about assignment to request #${request.id}: assignedto data is missing`);
    return;
  }
  
  console.log(`Notifying staff member about assignment to request #${request.id}`);
  
  try {
    await notifyUser(request.assignedto, {
      title: 'New Maintenance Assignment',
      message: `You have been assigned to maintenance request #${request.id}`,
      type: 'maintenance_assignment',
      referenceId: request.id
    });
  } catch (error) {
    console.error('Error notifying staff:', error);
  }
};

const notifyRenteeAboutAssignment = async (request) => {
  if (!request) {
    console.log('Cannot notify rentee about assignment: request data is missing');
    return;
  }
  if (!request.renteeid) {
    console.log(`Cannot notify rentee about request #${request.id}: renteeid is missing`);
    return;
  }
  
  console.log(`Notifying rentee about maintenance request #${request.id} assignment`);
  
  try {
    const assignedtoName = 'a staff member'; // In a real app, you'd fetch the staff member's name
    const scheduledInfo = request.assignedat ? ` and scheduled for ${new Date(request.assignedat).toLocaleDateString()}` : '';
    
    await notifyUser(request.renteeid, {
      title: 'Maintenance Request Update',
      message: `Your maintenance request has been assigned to ${assignedtoName}${scheduledInfo}.`,
      type: 'maintenance_update',
      referenceId: request.id
    });
  } catch (error) {
    console.error('Error notifying rentee:', error);
  }
};

const notifyRenteeAboutWorkStarted = async (request) => {
  // This is a placeholder for notification functionality
  if (!request) {
    console.log('Cannot notify rentee: request data is missing');
    return;
  }
  console.log(`Notifying rentee that work has started on request #${request.id}`);
};

const notifyRenteeAboutCompletion = async (request) => {
  // This is a placeholder for notification functionality
  if (!request) {
    console.log('Cannot notify rentee: request data is missing');
    return;
  }
  console.log(`Notifying rentee that request #${request.id} has been completed`);
};

const notifyAboutCancellation = async (request) => {
  // This is a placeholder for notification functionality
  if (!request) {
    console.log('Cannot notify about cancellation: request data is missing');
    return;
  }
  console.log(`Notifying about cancellation of request #${request.id}`);
};

const notifyAboutNewComment = async (request, comment) => {
  // This is a placeholder for notification functionality
  if (!request || !comment) {
    console.log('Cannot notify about new comment: request or comment data is missing');
    return;
  }
  
  console.log(`Notifying about new comment on request #${request.id}`);
  
  // Don't notify about internal comments to rentees
  if (comment.isInternal) {
    return;
  }
  
  // In a real app, you would determine who to notify based on the comment author
  if (comment.createdBy && comment.createdBy.role === 'rentee' && request.assignedto) {
    // Notify assigned staff about rentee comment
    console.log(`Notifying staff member about new comment from rentee`);
  } else if (comment.createdBy && comment.createdBy.role !== 'rentee' && request.renteeid) {
    // Notify rentee about staff comment
    console.log(`Notifying rentee about new comment from staff`);
  }
};

export async function deleteMaintenanceRequest(id) {
  try {
    // Use the deleteData function from supabaseClient
    const { error } = await deleteData('maintenance_requests', id);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error deleting maintenance request:', error.message);
    throw new Error('Failed to delete maintenance request.');
  }
}

export async function updateMaintenanceStatus(id, status, additionalData = {}) {
  try {
    console.log('Updating maintenance status:', { id, status, additionalData });
    
    const updateFields = {
      status,
      updatedat: new Date().toISOString(),
      ...additionalData
    };

    // Add status-specific timestamps
    if (status === 'in_progress' && !additionalData.startedat) {
      updateFields.startedat = new Date().toISOString();
    } else if (status === 'completed' && !additionalData.completedat) {
      updateFields.completedat = new Date().toISOString();
    }

    console.log('Update fields:', updateFields);

    // Use the updateData function from supabaseClient with correct parameter order
    const { data, error } = await supabase
      .from('maintenance_requests')
      .update(updateFields)
      .eq('id', id)
      .select(`
        *,
        property:properties!maintenance_requests_propertyid_fkey(
          id,
          name,
          address
        ),
        rentee:app_users!maintenance_requests_renteeid_fkey(
          id,
          name,
          email,
          contact_details
        ),
        assigned_staff:app_users!maintenance_requests_assignedto_fkey(
          id,
          name,
          email,
          contact_details
        ),
        maintenance_request_images(*)
      `)
      .single();

    if (error) {
      console.error('Error updating maintenance status:', error);
      throw error;
    }

    console.log('Updated maintenance request:', data);
    return data;
  } catch (error) {
    console.error('Error updating maintenance status:', error.message);
    throw new Error('Failed to update maintenance status.');
  }
}

/**
 * Get maintenance requests based on user role and ID
 * @param {string} userId - The user ID
 * @param {string} role - The user role
 * @returns {Promise<Array>} - Array of maintenance requests
 */
export const getMaintenanceRequests = async (userId, role) => {
  try {
    console.log('Fetching maintenance requests for user:', { userId, role });
    
    // First, fetch the maintenance requests with detailed logging
    const { data: requests, error: requestsError } = await supabase
      .from('maintenance_requests')
      .select(`
        *,
        property:properties!maintenance_requests_propertyid_fkey(
          id,
          name,
          address,
          property_type,
          status
        ),
        rentee:app_users!maintenance_requests_renteeid_fkey(
          id,
          name,
          email,
          contact_details
        ),
        assigned_staff:app_users!maintenance_requests_assignedto_fkey(
          id,
          name,
          email,
          contact_details
        ),
        maintenance_request_images(
          id,
          image_url,
          image_type,
          uploaded_at,
          uploaded_by
        )
      `)
      .order('createdat', { ascending: false });

    if (requestsError) {
      console.error('Error fetching maintenance requests:', requestsError);
      throw requestsError;
    }

    console.log('Raw maintenance requests:', requests);

    // Normalize the data with detailed logging
    const normalizedData = requests.map(request => {
      console.log('Processing request:', request);
      console.log('Property data:', request.property);
      
      const normalizedRequest = {
        ...request,
        property: request.property || { name: 'Unknown property', id: request.propertyid },
        rentee: request.rentee || { name: 'Unknown rentee', id: request.renteeid },
        assigned_staff: request.assigned_staff || null,
        maintenance_request_images: request.maintenance_request_images || [],
        notes: request.notes || '',
        cancellationreason: request.cancellationreason || '',
        startedat: request.startedat || null
      };

      console.log('Normalized request:', normalizedRequest);
      return normalizedRequest;
    });

    // Filter based on role if needed
    if (role === 'rentee') {
      return normalizedData.filter(request => request.renteeid === userId);
    }

    return normalizedData;
  } catch (error) {
    console.error('Error fetching maintenance requests:', error);
    throw error;
  }
}; 