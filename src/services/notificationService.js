import { supabase } from './supabaseClient';
import { toDatabaseFormat, fromDatabaseFormat } from '../utils/databaseUtils';
import { sendDirectEmail } from './directEmailService';

/**
 * Send a notification to a user
 * @param {string} userId - The ID of the user to notify
 * @param {Object} notification - The notification data
 * @returns {Promise<Object>} - Result object
 */
export const notifyUser = async (userId, notification) => {
  try {
    // Validate user ID
    if (!userId) {
      console.error('Cannot send notification: user ID is required');
      return { success: false, error: 'User ID is required' };
    }

    // Validate notification data
    if (!notification || !notification.message) {
      console.error('Cannot send notification: invalid notification data');
      return { success: false, error: 'Invalid notification data' };
    }

    // Store in-app notification using only columns that actually exist in the table
    try {
      // Prepare notification data based on database schema
      // ONLY include fields that are confirmed to exist in the database schema
      const notificationData = {
        user_id: userId,
        message: notification.message,
        is_read: false,
        createdat: new Date().toISOString()
      };
      
      // Log the exact notification data being sent
      console.log('Storing notification with exact fields:', notificationData);
      
      const { error: dbError } = await supabase
        .from('notifications')
        .insert(notificationData);

      if (dbError) {
        console.error('Could not store in-app notification:', dbError.message);
        // Continue execution even if notification fails
      }
    } catch (dbError) {
      console.error('Could not store in-app notification:', dbError.message);
      // Continue execution even if in-app notification fails
      // This allows email/SMS to still be sent
    }

    // Get user's contact info for email/SMS
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .select('contact_details')
      .eq('id', userId)
      .single();

    if (userError || !userData?.contact_details) {
      console.warn('Cannot send email/SMS notification: missing contact info');
      // Still return success because the in-app notification might have worked
      return { success: true };
    }

    // Send email notification if email is available
    if (userData.contact_details.email) {
      // TODO: Implement email sending
      console.log('Would send email to:', userData.contact_details.email, 'with subject:', notification.title || 'Notification');
    }

    // Send SMS notification if phone is available
    if (userData.contact_details.phone) {
      // TODO: Implement SMS sending
      console.log('Would send SMS to:', userData.contact_details.phone);
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notification Service
 * 
 * This service provides functions for sending various types of notifications to users.
 * The primary method of notification is email, implemented through SendGrid API.
 * 
 * Usage example:
 * ```
 * import { sendEmailNotification } from './services/notificationService';
 * 
 * // Send a notification email
 * const result = await sendEmailNotification(
 *   'user@example.com',
 *   'Your Account Update',
 *   '<h1>Account Updated</h1><p>Your account has been successfully updated.</p>'
 * );
 * 
 * if (result.success) {
 *   console.log('Email sent successfully');
 * } else {
 *   console.error('Failed to send email:', result.message);
 * }
 * ```
 * 
 * Note: This service requires proper configuration of email credentials in environment variables:
 * - VITE_SENDGRID_API_KEY: Your SendGrid API key
 * - VITE_EMAIL_FROM: The sender email address
 * - VITE_EMAIL_FROM_NAME: The sender name
 * 
 * Alternatively, EmailJS is used as a fallback method if SendGrid is not configured.
 */

/**
 * Sends an email notification to a user
 * @param {string} email - The recipient's email address
 * @param {string} subject - The email subject
 * @param {string} message - The email body content (HTML)
 * @param {string} plainText - Optional plain text version of the email
 * @returns {Promise<Object>} - Result of the email sending operation
 */
export const sendEmailNotification = async (email, subject, message, plainText = '') => {
  console.log(`Sending email notification to ${email}: ${subject}`);
  
  try {
    // Call the direct email service with proper parameters
    const result = await sendDirectEmail(
      email,
      subject,
      message,
      plainText
    );
    
    if (!result.success) {
      console.error('Failed to send email notification:', result.message);
    }
    
    return result;
  } catch (error) {
    console.error('Error in sendEmailNotification:', error);
    return { success: false, message: error.message || 'Unknown error sending notification' };
  }
};

// Function to send SMS notification
export const sendSmsNotification = async (phoneNumber, message, templateId = null) => {
  try {
    // In a real app, this would integrate with an SMS service
    console.log('SMS notification would be sent:', {
      phoneNumber,
      message,
      templateId
    });
    
    return { 
      success: true, 
      data: {
        phoneNumber,
        message,
        templateId,
        sentAt: new Date().toISOString()
      },
      error: null
    };
  } catch (error) {
    console.error('Error sending SMS notification:', error.message);
    return { 
      success: false, 
      data: null,
      error: error.message 
    };
  }
};

// Get user notifications
export const getUserNotifications = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('createdat', { ascending: false });

    if (error) {
      throw error;
    }

    // If the frontend expects title and type fields, add them as defaults here
    const enhancedData = data.map(notification => ({
      ...notification,
      // Add any fields that the frontend needs but aren't in the database
      title: 'Notification' // Add a default title
    }));

    return { 
      success: true, 
      data: enhancedData,
      error: null
    };
  } catch (error) {
    console.error('Error fetching user notifications:', error.message);
    return { 
      success: false, 
      data: null,
      error: error.message 
    };
  }
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId) => {
  try {
    // Use only fields that exist in the schema
    const updateData = { 
      is_read: true,
      updatedat: new Date().toISOString()
    };
    
    console.log('Marking notification as read:', notificationId);
    
    const { data, error } = await supabase
      .from('notifications')
      .update(updateData)
      .eq('id', notificationId)
      .select();

    if (error) {
      console.error('Error in markNotificationAsRead:', error);
      throw error;
    }

    return { 
      success: true, 
      data,
      error: null
    };
  } catch (error) {
    console.error('Error marking notification as read:', error.message);
    return { 
      success: false, 
      data: null,
      error: error.message 
    };
  }
};

// Function to get notification templates
export const getNotificationTemplates = async (type, language = 'English') => {
  try {
    const { data, error } = await supabase
      .from('letter_templates')
      .select('*')
      .eq('type', type)
      .eq('language', language);

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching notification templates:', error.message);
    return { success: false, error: error.message };
  }
};

// Function to create a new notification template
export const createNotificationTemplate = async (templateData) => {
  try {
    const { data, error } = await supabase
      .from('letter_templates')
      .insert(templateData)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error creating notification template:', error.message);
    return { success: false, error: error.message };
  }
};

// Function to update an existing notification template
export const updateNotificationTemplate = async (templateId, templateData) => {
  try {
    const { data, error } = await supabase
      .from('letter_templates')
      .update(templateData)
      .eq('id', templateId)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error updating notification template:', error.message);
    return { success: false, error: error.message };
  }
};

// Function to delete a notification template
export const deleteNotificationTemplate = async (templateId) => {
  try {
    const { error } = await supabase
      .from('letter_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting notification template:', error.message);
    return { success: false, error: error.message };
  }
};

// Function to notify staff about a new maintenance request
export const notifyStaffAboutNewRequest = async (request) => {
  try {
    if (!request) {
      console.error('Cannot notify about new request: request data is missing');
      return { success: false, error: 'Request data is missing' };
    }

    // Get staff users to notify
    const { data: staffUsers, error: staffError } = await supabase
      .from('app_users')
      .select('id, auth_id, contact_details')
      .eq('usertype', 'staff');

    if (staffError) {
      console.error('Error fetching staff users:', staffError);
      return { success: false, error: staffError.message };
    }

    // Prepare notification message
    const message = `New maintenance request: ${request.title} for property #${request.propertyid}`;
    
    // Send notification to each staff member
    const notifications = [];
    for (const staff of staffUsers) {
      const notification = await notifyUser(staff.id, {
        message: message,
        type: 'maintenance_new',
        data: { requestId: request.id }
      });
      
      notifications.push(notification);
    }

    return { success: true, data: notifications };
  } catch (error) {
    console.error('Error notifying staff about new request:', error);
    return { success: false, error: error.message };
  }
};

// Function to notify about assignment
export const notifyAboutAssignment = async (request, assignedStaffId) => {
  try {
    if (!request || !assignedStaffId) {
      console.error('Cannot notify about assignment: missing required data');
      return { success: false, error: 'Missing required data' };
    }

    // Get the assigned staff details
    const { data: staffData, error: staffError } = await supabase
      .from('app_users')
      .select('id, auth_id, full_name, contact_details')
      .eq('id', assignedStaffId)
      .single();

    if (staffError) {
      console.error('Error fetching staff details:', staffError);
      return { success: false, error: staffError.message };
    }

    // Notify the assigned staff
    const staffNotification = await notifyUser(assignedStaffId, {
      message: `You have been assigned to maintenance request #${request.id}: ${request.title}`,
      type: 'maintenance_assigned',
      data: { requestId: request.id }
    });

    // Notify the rentee if they exist
    let renteeNotification = { success: true };
    if (request.renteeid) {
      renteeNotification = await notifyUser(request.renteeid, {
        message: `Maintenance request #${request.id} has been assigned to ${staffData?.full_name || 'a staff member'}`,
        type: 'maintenance_assigned',
        data: { requestId: request.id, staffId: assignedStaffId }
      });
    }

    return { 
      success: staffNotification.success && renteeNotification.success,
      data: { staffNotification, renteeNotification }
    };
  } catch (error) {
    console.error('Error notifying about assignment:', error);
    return { success: false, error: error.message };
  }
};

// Function to notify rentee about work started
export const notifyRenteeAboutWorkStarted = async (request) => {
  try {
    if (!request || !request.renteeid) {
      console.error('Cannot notify about work started: missing required data');
      return { success: false, error: 'Missing required data' };
    }

    // Notify the rentee
    const notification = await notifyUser(request.renteeid, {
      message: `Work has started on your maintenance request: ${request.title}`,
      type: 'maintenance_started',
      data: { requestId: request.id }
    });

    return notification;
  } catch (error) {
    console.error('Error notifying rentee about work started:', error);
    return { success: false, error: error.message };
  }
};

// Function to notify rentee about completion
export const notifyRenteeAboutCompletion = async (request) => {
  try {
    if (!request || !request.renteeid) {
      console.error('Cannot notify about completion: missing required data');
      return { success: false, error: 'Missing required data' };
    }

    // Notify the rentee
    const notification = await notifyUser(request.renteeid, {
      message: `Your maintenance request has been completed: ${request.title}`,
      type: 'maintenance_completed',
      data: { requestId: request.id }
    });

    return notification;
  } catch (error) {
    console.error('Error notifying rentee about completion:', error);
    return { success: false, error: error.message };
  }
};

// Function to notify about cancellation
export const notifyAboutCancellation = async (request, cancelledBy) => {
  try {
    if (!request) {
      console.error('Cannot notify about cancellation: missing required data');
      return { success: false, error: 'Missing required data' };
    }

    const notifications = [];

    // Notify rentee if they exist and didn't cancel it themselves
    if (request.renteeid && (!cancelledBy || cancelledBy !== request.renteeid)) {
      const renteeNotification = await notifyUser(request.renteeid, {
        message: `Your maintenance request has been cancelled: ${request.title}`,
        type: 'maintenance_cancelled',
        data: { requestId: request.id }
      });
      notifications.push(renteeNotification);
    }

    // Notify assigned staff if they exist and didn't cancel it themselves
    if (request.assignedstaff && (!cancelledBy || cancelledBy !== request.assignedstaff)) {
      const staffNotification = await notifyUser(request.assignedstaff, {
        message: `Maintenance request has been cancelled: ${request.title}`,
        type: 'maintenance_cancelled',
        data: { requestId: request.id }
      });
      notifications.push(staffNotification);
    }

    return { success: true, data: notifications };
  } catch (error) {
    console.error('Error notifying about cancellation:', error);
    return { success: false, error: error.message };
  }
};

// Function to notify about new comment
export const notifyAboutNewComment = async (request, comment, commentedBy) => {
  try {
    if (!request || !comment) {
      console.error('Cannot notify about new comment: missing required data');
      return { success: false, error: 'Missing required data' };
    }

    const notifications = [];
    
    // Get commenter name
    let commenterName = 'Someone';
    if (commentedBy) {
      const { data: userData, error: userError } = await supabase
        .from('app_users')
        .select('full_name')
        .eq('id', commentedBy)
        .single();
        
      if (!userError && userData) {
        commenterName = userData.full_name || 'Someone';
      }
    }

    // Notify rentee if they exist and didn't comment themselves
    if (request.renteeid && commentedBy !== request.renteeid) {
      const notification = await notifyUser(request.renteeid, {
        message: `${commenterName} commented on your maintenance request: ${request.title}`,
        type: 'maintenance_comment',
        data: { requestId: request.id, commentId: comment.id }
      });
      notifications.push(notification);
    }

    // Notify assigned staff if they exist and didn't comment themselves
    if (request.assignedstaff && commentedBy !== request.assignedstaff) {
      const notification = await notifyUser(request.assignedstaff, {
        message: `${commenterName} commented on maintenance request: ${request.title}`,
        type: 'maintenance_comment',
        data: { requestId: request.id, commentId: comment.id }
      });
      notifications.push(notification);
    }

    return { success: true, data: notifications };
  } catch (error) {
    console.error('Error notifying about new comment:', error);
    return { success: false, error: error.message };
  }
}; 