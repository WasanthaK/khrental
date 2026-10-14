import { platform as platformClient } from './platformClient';
import { sendDirectEmail } from './directEmailService';
import { requestMssqlApi } from './mssqlApiClient';

const loadAppUserService = () => import('./appUserService');

const fetchNotificationUser = async (userId) => {
  const { fetchAppUser } = await loadAppUserService();
  return fetchAppUser(userId);
};

const fetchNotificationUsersByType = async (userType) => {
  const { fetchAppUsers } = await loadAppUserService();
  return fetchAppUsers(userType);
};

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
      
      const { error: dbError } = await platformClient
        .from('notifications')
        .insert(notificationData);

      if (dbError) {
        console.error('Could not store in-app notification:', dbError.message);
        return {
          success: false,
          error: dbError.message || 'Unable to store in-app notification.',
          code: dbError.code || 'NOTIFICATION_PERSISTENCE_FAILED'
        };
      }
    } catch (dbError) {
      console.error('Could not store in-app notification:', dbError.message);
      return {
        success: false,
        error: dbError.message || 'Unable to store in-app notification.',
        code: dbError.code || 'NOTIFICATION_PERSISTENCE_FAILED'
      };
    }

    // Get user's contact info for email/SMS
    let userData = null;

    try {
      userData = await fetchNotificationUser(userId);
    } catch (userError) {
      console.warn('Cannot send email/SMS notification: failed to load contact info', userError);
    }

    const contactDetails = userData?.contact_details || userData?.contactDetails;

    if (!contactDetails) {
      console.warn('Cannot send email/SMS notification: missing contact info');
      // The notification was stored successfully; contact channels are
      // placeholders and are not claimed as delivered.
      return { success: true };
    }

    // Send email notification if email is available
    if (contactDetails.email) {
      // TODO: Implement email sending
      console.log('Would send email to:', contactDetails.email, 'with subject:', notification.title || 'Notification');
    }

    // Send SMS notification if phone is available
    if (contactDetails.phone) {
      // TODO: Implement SMS sending
      console.log('Would send SMS to:', contactDetails.phone);
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
 * The primary method of notification is email, implemented through the server-side Twilio SendGrid integration.
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
 * Note: This service requires proper server-side email configuration:
 * - TWILIO_SENDGRID_API_KEY or SENDGRID_API_KEY: Server-side Twilio SendGrid API key
 * - VITE_EMAIL_FROM: The sender email address
 * - VITE_EMAIL_FROM_NAME: The sender name
 * 
 * Alternatively, EmailJS is used as a fallback method if the backend email path is unavailable.
 */

/**
 * Send an email notification
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} body - Email body (HTML)
 * @param {Object} options - Additional options
 * @returns {Object} Result of the operation
 */
export const sendEmailNotification = async (to, subject, body, options = {}) => {
  console.log(`[notificationService] Sending email notification to ${to}`);
  
  try {
    // Call the direct email service
    const result = await sendDirectEmail({
      to,
      subject,
      html: body,
      ...options
    });
    
    // Check if successful
    if (result.success) {
      if (result.simulated || result.development || result.simulatedDespiteError) {
        console.log(`[notificationService] Email to ${to} simulated successfully in development mode`);
      } else {
        console.log(`[notificationService] Email sent successfully to ${to}`);
      }
      return { success: true, ...result };
    } else {
      throw new Error(result.message || 'Unknown error sending email');
    }
  } catch (error) {
    console.error(`[notificationService] Failed to send email to ${to}:`, error);
    throw new Error(`Failed to send email: ${error.message}`);
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
// The read/list contract is SELF-only; a caller-supplied legacy userId
// cannot override the authenticated session's user and tenant context.
export const getUserNotifications = async (_userId) => {
  try {
    const all = [];
    const seen = new Set();
    const pageSize = 100;
    for (let page = 1; page <= 100; page += 1) {
      const rows = await requestMssqlApi(`/api/notifications/me?page=${page}&pageSize=${pageSize}`);
      if (!Array.isArray(rows) || rows.length > pageSize || rows.some(
        row => !row || typeof row.id !== 'string' || !row.id
      )) {
        throw new Error('Notification list returned an invalid response.');
      }
      for (const row of rows) {
        if (seen.has(row.id)) throw new Error('Notification list contains repeated results.');
        seen.add(row.id);
        all.push({ ...row, title: 'Notification' });
      }
      if (rows.length < pageSize) {
        return { success: true, data: all, error: null };
      }
    }
    throw new Error('Notification history exceeded the supported page limit.');
  } catch (error) {
    console.error('Error fetching user notifications:', error.message);
    return { success: false, data: null, error: error.message };
  }
};

// An ID is only a locator. The server enforces BOTH the tenant and owner.
export const markNotificationAsRead = async (notificationId) => {
  try {
    if (!notificationId) throw new Error('Notification ID is required.');
    const record = await requestMssqlApi(
      `/api/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'PATCH' }
    );
    if (!record?.id) throw new Error('Notification update returned an invalid response.');
    return { success: true, data: [record], error: null };
  } catch (error) {
    console.error('Error marking notification as read:', error.message);
    return { success: false, data: null, error: error.message };
  }
};

// Function to get notification templates
export const getNotificationTemplates = async (type, language = 'English') => {
  try {
    const { data, error } = await platformClient
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
    const { data, error } = await platformClient
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
    const { data, error } = await platformClient
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
    const { error } = await platformClient
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
    let staffUsers = [];

    try {
      staffUsers = await fetchNotificationUsersByType('staff');
    } catch (staffError) {
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

    return { success: notifications.every(item => item?.success === true), data: notifications };
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
    let staffData = null;

    try {
      staffData = await fetchNotificationUser(assignedStaffId);
    } catch (staffError) {
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
        message: `Maintenance request #${request.id} has been assigned to ${staffData?.full_name || staffData?.name || 'a staff member'}`,
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

    return { success: notifications.every(item => item?.success === true), data: notifications };
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
      try {
        const userData = await fetchNotificationUser(commentedBy);
        if (userData) {
          commenterName = userData.full_name || userData.name || 'Someone';
        }
      } catch (userError) {
        console.warn('Error fetching commenter details:', userError);
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