import { supabase } from './supabaseClient';
import { MAINTENANCE_STATUS, MAINTENANCE_PRIORITY } from '../utils/constants';
import { notifyUser } from './notificationService';
import { toDatabaseFormat, fromDatabaseFormat } from '../utils/databaseUtils';
import { fetchData, insertData, updateData, deleteData, checkUserExists } from './supabaseClient';
import { saveFile, uploadFile, STORAGE_BUCKETS, BUCKET_FOLDERS, saveImage } from './fileService';
import { 
  notifyStaffAboutNewRequest, 
  notifyAboutAssignment,
  notifyRenteeAboutWorkStarted,
  notifyRenteeAboutCompletion,
  notifyAboutCancellation,
  notifyAboutNewComment
} from './notificationService';

/**
 * Create a new maintenance request
 * @param {Object} input - Request data including images
 * @param {string} userId - Current user ID
 * @returns {Promise<Object>} - Response with success/error
 */
export const createMaintenanceRequest = async (input, userId) => {
  try {
    console.log('Creating maintenance request with input:', input);
    
    // Check for required fields - Modified to match what the form provides
    if (!input.title || !input.description || !input.propertyid) {
      return {
        success: false,
        error: 'Missing required fields'
      };
    }
    
    // Before creating request, get the user's profile ID from app_users
    let profileId = null;
    
    if (userId) {
      // Use the checkUserExists utility function with isAuthId=true since userId is an auth ID
      const { data: userData, exists, error: userError } = await checkUserExists(userId, true);
      
      if (userError) {
        console.error('Error fetching user profile:', userError);
      } else if (exists && userData) {
        profileId = userData.id;
        console.log('Found user profile ID:', profileId);
      } else {
        console.error('No user profile found for auth ID:', userId);
        return {
          success: false,
          error: 'User profile not found. Please contact support.'
        };
      }
    }
    
    if (!profileId) {
      return {
        success: false,
        error: 'Unable to determine user profile ID for maintenance request'
      };
    }
    
    // Construct the request object with the correct profileId as renteeid
    const request = {
      title: input.title,
      description: input.description,
      propertyid: input.propertyid,
      renteeid: profileId, // Use the profile ID from app_users table
      status: MAINTENANCE_STATUS.PENDING,
      priority: input.priority || MAINTENANCE_PRIORITY.MEDIUM,
      requesttype: input.requesttype || '',
      notes: input.notes || '',
      createdat: new Date().toISOString(),
      updatedat: new Date().toISOString()
    };
    
    console.log('Creating maintenance request with data:', request);
    
    // Insert the request first
    const { data: insertedRequest, error: insertError } = await supabase
      .from('maintenance_requests')
      .insert(request)
      .select('*');
    
    if (insertError) {
      console.error('Error inserting maintenance request:', insertError);
      throw insertError;
    }
    
    if (!insertedRequest || insertedRequest.length === 0) {
      throw new Error('Failed to create maintenance request');
    }
    
    const createdRequest = insertedRequest[0];
    console.log('Created maintenance request:', createdRequest);
    
    // Upload images and create entries in maintenance_request_images if images exist
    let imageUrls = [];
    
    if (input.images && input.images.length > 0) {
      // First, upload the images to storage
      imageUrls = await uploadMaintenanceImages(createdRequest.id, input.images, 'initial');
      console.log('Uploaded image URLs:', imageUrls);
      
      // Then create entries in maintenance_request_images table
      for (const imageUrl of imageUrls) {
        if (!imageUrl) continue;
        
        // Create entry in maintenance_request_images table
        const { error: imageInsertError } = await supabase
          .from('maintenance_request_images')
          .insert({
            maintenance_request_id: createdRequest.id,
            image_url: imageUrl,
            image_type: 'initial',
            description: '',
            uploaded_by: userId,
            uploaded_at: new Date().toISOString()
          });
        
        if (imageInsertError) {
          console.error('Error inserting image record:', imageInsertError);
          // Continue with other images even if one fails
        }
      }
    }
    
    // Fetch the complete request data with images
    const { data: requestWithImages, error: fetchError } = await supabase
      .from('maintenance_requests')
      .select(`
        *,
        property:properties(*),
        rentee:app_users!maintenance_requests_renteeid_fkey(*),
        maintenance_request_images(*)
      `)
      .eq('id', createdRequest.id)
      .single();
    
    if (fetchError) {
      console.error('Error fetching created request:', fetchError);
      throw fetchError;
    }
    
    // Notify staff about new request
    await notifyStaffAboutNewRequest(requestWithImages);
    
    return {
      success: true,
      data: requestWithImages
    };
  } catch (error) {
    console.error('Error creating maintenance request:', error.message || error);
    return {
      success: false,
      error: error.message || 'An error occurred while creating the maintenance request'
    };
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
              folder: 'maintenance'
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
              folder: 'maintenance'
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
                image_type: 'additional',
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
      // Send notifications about the assignment
      const notificationStatus = await notifyAboutAssignment(updatedRequest);
      console.log('Notification status:', notificationStatus);
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
 * @param {string} id - Request ID
 * @param {Object} completionData - Data for completion
 * @returns {Promise<Object>} - Response with success/error
 */
export const completeMaintenanceRequest = async (id, completionData) => {
  try {
    const { notes = '', images = [], userId = null } = completionData;
    
    if (!id) {
      console.error('Cannot complete maintenance request: Missing request ID');
      return { success: false, error: 'Request ID is required' };
    }
    
    // Get the current user information
    let userRole = 'staff';
    let userName = 'System';
    
    if (userId) {
      const { data: userData, exists } = await checkUserExists(userId);
      if (exists && userData) {
        userName = userData.name || 'Staff Member';
        userRole = userData.role || 'staff';
      }
    }
    
    // Create a timestamp for the completion
    const timestamp = new Date().toISOString();
    
    // Format the completion note as a JSON object
    const formattedNote = [{
      content: notes,
      createdBy: {
        name: userName,
        role: userRole
      },
      createdat: timestamp,
      role: userRole,
      name: userName,
      isAdminMessage: userRole === 'admin',
      isInternal: false
    }];
    
    console.log('Formatted completion note:', formattedNote);
    
    // Process completion images if provided
    let uploadedImages = [];
    if (images && images.length > 0) {
      try {
        // Use the utility function to upload multiple images
        uploadedImages = await uploadMaintenanceImages(id, images, 'completion');
        console.log(`Successfully uploaded ${uploadedImages.length} completion images`);
      } catch (imageError) {
        console.error('Error uploading completion images:', imageError);
        // Continue with completion even if image upload fails
      }
    }
    
    // Prepare the update data
    const updateData = {
      status: MAINTENANCE_STATUS.COMPLETED,
      completedat: timestamp,
      notes: JSON.stringify(formattedNote),
      updatedat: timestamp
    };
    
    // Update the maintenance request in the database
    const { data: updatedRequest, error: updateError } = await supabase
      .from('maintenance_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (updateError) {
      console.error('Error updating maintenance request status:', updateError);
      return { success: false, error: updateError.message };
    }
    
    console.log('Maintenance request completed successfully:', updatedRequest);
    
    // Notify the rentee about the completion if applicable
    if (updatedRequest?.renteeid) {
      try {
        const notificationResult = await notifyRenteeAboutCompletion(updatedRequest);
        console.log('Rentee notification result:', notificationResult);
      } catch (notificationError) {
        console.error('Error notifying rentee about completion:', notificationError);
        // Continue even if notification fails
      }
    }
    
    return { 
      success: true, 
      data: { 
        ...updatedRequest,
        uploadedImages
      } 
    };
  } catch (error) {
    console.error('Error completing maintenance request:', error);
    return { success: false, error: error.message };
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
 * @param {string} requestId - The maintenance request ID
 * @param {Array} images - Array of image files
 * @param {string} prefix - Image type/prefix
 * @returns {Promise<Array>} - Array of uploaded image URLs
 */
const uploadMaintenanceImages = async (requestId, images, prefix = 'request') => {
  if (!images || !Array.isArray(images) || images.length === 0) {
    console.log('No images to upload');
    return [];
  }
  
  console.log(`Uploading ${images.length} images for request ${requestId} with prefix ${prefix}`);
  
  const imageUrls = [];
  const errors = [];
  
  for (const image of images) {
    try {
      console.log('Processing image:', image);
      
      // Check if it's already a string URL
      if (typeof image === 'string') {
        imageUrls.push(image);
        continue;
      }
      
      // Check if it's an object with url property
      if (image && typeof image === 'object' && image.url) {
        imageUrls.push(image.url);
        continue;
      }
      
      // If the image is a new file, upload it using fileService
      if (image && (image.file || image instanceof File)) {
        const file = image.file || image;
        
        // Use the saveImage function instead of saveFile
        const result = await saveImage(file, {
          folder: 'maintenance'
        });
        
        if (!result.success) {
          console.error('Error uploading image:', result.error);
          errors.push(result.error);
          continue;
        }
        
        if (result.url) {
          imageUrls.push(result.url);
          console.log(`Uploaded new image: ${result.url}`);
        } else {
          console.error('No URL returned from saveImage');
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

// Update the attachImageToMaintenanceRequest function to handle user ID validation more reliably
const attachImageToMaintenanceRequest = async (requestId, imageUrl, imageType = 'additional', userId = null, description = '') => {
  // Validate required parameters
  if (!requestId) {
    console.error('Cannot attach image: Missing request ID');
    return { success: false, error: 'Missing maintenance request ID' };
  }
  
  if (!imageUrl) {
    console.error('Cannot attach image: Missing image URL');
    return { success: false, error: 'Missing image URL' };
  }

  try {
    console.log(`Attaching image ${imageUrl} to maintenance request ${requestId}`);
    
    // Validate and normalize the image URL
    let normalizedUrl = imageUrl;
    
    // Check if the URL is properly formatted
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      // Check if it's a relative path from Supabase storage
      if (imageUrl.startsWith('maintenance/') || imageUrl.startsWith('/maintenance/')) {
        // Construct the full URL using Supabase storage URL
        const storageUrl = import.meta.env.VITE_SUPABASE_URL + '/storage/v1/object/public/images/';
        normalizedUrl = storageUrl + imageUrl.replace(/^\//, ''); // remove leading slash if present
        console.log('Normalized relative URL to full URL:', normalizedUrl);
      }
    }
    
    // Prepare the data object with required fields
    const imageData = {
      maintenance_request_id: requestId,
      image_url: normalizedUrl,
      image_type: imageType || 'additional',
      uploaded_at: new Date().toISOString(),
      description: description || ''
    };
    
    // Handle user ID validation with our utility function
    if (userId) {
      const { exists } = await checkUserExists(userId);
      if (exists) {
        imageData.uploaded_by = userId;
        console.log('Successfully validated user ID for image upload:', userId);
      } else {
        console.warn('User validation failed or user not found - omitting uploaded_by field');
        // Continue without user ID to avoid foreign key constraint error
      }
    }
    
    // Insert the image record in the maintenance_request_images table
    const { data, error } = await supabase
      .from('maintenance_request_images')
      .insert(imageData)
      .select();
    
    if (error) {
      console.error('Error attaching image to maintenance request:', error);
      return { success: false, error: error.message };
    }
    
    console.log('Successfully attached image to maintenance request:', data);
    return { success: true, data };
  } catch (err) {
    console.error('Exception attaching image to maintenance request:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Add an image to a maintenance request
 * @param {Object} params - Parameters for the image
 * @param {string} params.maintenance_request_id - The request ID
 * @param {File|string} params.image - The image file or URL
 * @param {string} params.image_type - The type of image (initial, progress, etc.)
 * @param {string} params.description - Optional description
 * @param {string} params.userId - Optional user ID
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const addMaintenanceRequestImage = async ({
  maintenance_request_id,
  image,
  image_type = 'additional',
  description = '',
  userId = null
}) => {
  try {
    if (!maintenance_request_id) {
      throw new Error('Missing maintenance request ID');
    }

    if (!image) {
      throw new Error('No image provided');
    }
    
    // Validate user ID if provided
    let validatedUserId = null;
    if (userId) {
      const { exists, data } = await checkUserExists(userId);
      if (exists && data) {
        validatedUserId = userId;
        console.log('User ID validated for image upload:', validatedUserId);
      } else {
        console.warn('Invalid user ID provided for image upload, continuing without user attribution');
      }
    }
    
    // Handle file upload if the image is a File object
    let imageUrl = '';
    if (image instanceof File) {
      // Upload the file to storage using the new saveImage function
      console.log('Uploading file to storage:', image.name);
      const result = await saveImage(image, {
        folder: 'maintenance',
        compress: true,
        maxSize: 10 * 1024 * 1024 // 10MB
      });
      
      if (!result.success || !result.url) {
        console.error('Failed to upload image file:', result.error);
        throw new Error(`Failed to upload image: ${result.error || 'Unknown error'}`);
      }
      
      imageUrl = result.url;
      console.log('File uploaded successfully, URL:', imageUrl);
    } else if (typeof image === 'string') {
      // If the image is already a URL string
      imageUrl = image;
      console.log('Using existing image URL:', imageUrl);
    } else {
      throw new Error('Invalid image format. Expected File object or URL string.');
    }
    
    // Attach the image to the maintenance request
    const attachResult = await attachImageToMaintenanceRequest(
      maintenance_request_id,
      imageUrl,
      image_type || 'additional',
      validatedUserId, // Use the validated user ID
      description
    );
    
    if (!attachResult.success) {
      throw new Error(`Failed to attach image to maintenance request: ${attachResult.error}`);
    }
    
    return { success: true, data: attachResult.data };
  } catch (error) {
    console.error('Error in addMaintenanceRequestImage:', error);
    return { success: false, error: error.message };
  }
}; 