import { supabase } from './supabaseClient';
import { toDatabaseFormat, fromDatabaseFormat } from '../utils/databaseUtils';

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

    // Store in-app notification
    try {
      const { error: dbError } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          message: notification.message,
          title: notification.title || 'Notification',
          type: notification.type || 'general',
          reference_id: notification.referenceId || null,
          created_at: new Date().toISOString(),
          is_read: false
        });

      if (dbError) {
        console.error('Could not store in-app notification:', dbError.message);
        return { success: false, error: dbError.message };
      }
    } catch (dbError) {
      console.error('Could not store in-app notification:', dbError.message);
    }

    // Get user's contact info for email/SMS
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .select('contact_details')
      .eq('id', userId)
      .single();

    if (userError || !userData?.contact_details) {
      console.error('Cannot send email notification: missing contact info');
      return { success: false, error: 'Missing contact info' };
    }

    // Send email notification if email is available
    if (userData.contact_details.email) {
      // TODO: Implement email sending
      console.log('Would send email to:', userData.contact_details.email);
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

// Function to send email notification
export const sendEmailNotification = async (recipient, subject, content, templateId = null) => {
  try {
    // In a real app, this would integrate with an email service
    console.log('Email notification would be sent:', {
      recipient,
      subject,
      content,
      templateId
    });
    
    return { 
      success: true, 
      data: {
        recipient,
        subject,
        content,
        templateId,
        sentAt: new Date().toISOString()
      },
      error: null
    };
  } catch (error) {
    console.error('Error sending email notification:', error.message);
    return { 
      success: false, 
      data: null,
      error: error.message 
    };
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
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return { 
      success: true, 
      data,
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
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .select();

    if (error) {
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