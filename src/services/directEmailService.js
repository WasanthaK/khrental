import { supabase } from './supabaseClient';
import { getAppBaseUrl } from '../utils/env';

/**
 * Direct email service that uses SendGrid API for emails
 */

// Get the API key with fallbacks
const getSendGridKey = () => {
  // Try to get the SendGrid key from different possible environment variables
  const key = window._env_?.VITE_SENDGRID_API_KEY || 
              import.meta.env?.VITE_SENDGRID_API_KEY || 
              process.env?.VITE_SENDGRID_API_KEY || 
              process.env?.SENDGRID_API_KEY ||
              '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'; // Directly use provided key as fallback
  
  console.log('[DirectEmail] Using SendGrid API key:', key ? 'Found key (hidden)' : 'No key found');
  
  if (!key) {
    console.error('[DirectEmail] SendGrid API key not found in environment variables');
    return null;
  }
  
  return key;
};

// Get the Supabase key with fallbacks
const getSupabaseKey = () => {
  // Try window._env_ first (usually most reliable)
  if (window._env_ && window._env_.VITE_SUPABASE_ANON_KEY) {
    return window._env_.VITE_SUPABASE_ANON_KEY;
  }
  
  // Try import.meta.env next (for development)
  if (import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return import.meta.env.VITE_SUPABASE_ANON_KEY;
  }
  
  // Hardcoded fallback as absolute last resort
  return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjb3J3ZmlseWxndHZ6a3RzenZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE1NzIyODUsImV4cCI6MjA1NzE0ODI4NX0.SS7Z6iXHn4QoZsGK37xkQTWq_aqpGA3kT8VXpxgdblc";
};

// Get the URL with fallbacks
const getSupabaseUrl = () => {
  // Try window._env_ first
  if (window._env_ && window._env_.VITE_SUPABASE_URL) {
    return window._env_.VITE_SUPABASE_URL;
  }
  
  // Try import.meta.env next
  if (import.meta.env && import.meta.env.VITE_SUPABASE_URL) {
    return import.meta.env.VITE_SUPABASE_URL;
  }
  
  // Hardcoded fallback
  return "https://vcorwfilylgtvzktszvi.supabase.co";
};

// Get the from email with fallbacks
const getFromEmail = (from) => {
  return from || window._env_?.VITE_EMAIL_FROM || 
         import.meta.env?.VITE_EMAIL_FROM || 
         'noreply@kubeira.com';
};

// Get the from name with fallbacks
const getFromName = (fromName) => {
  return fromName || window._env_?.VITE_EMAIL_FROM_NAME || 
         import.meta.env?.VITE_EMAIL_FROM_NAME || 
         'KH Rentals';
};

/**
 * Create a user with email and password and send invite email
 * 
 * @param {Object} options - Options for user creation
 * @param {string} options.email - Email of the user
 * @param {string} options.name - Name of the user
 * @param {string} options.role - Role of the user
 * @param {string} options.userType - Type of the user
 * @returns {Promise<Object>} - Result of the operation
 */
export const createUserWithEmail = async ({ email, name, role, userType }) => {
  try {
    console.log(`[DirectEmailService] Creating user account for ${email}`);
    
    // Generate a secure temporary password
    const tempPassword = Array(16)
      .fill('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*')
      .map(x => x[Math.floor(Math.random() * x.length)])
      .join('');
    
    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
    });
    
    if (authError) {
      console.error('[DirectEmailService] Error creating user account:', authError);
      return { success: false, error: authError.message };
    }
    
    // Add user to app_users table
    const { error: dbError } = await supabase
      .from('app_users')
      .insert([
        {
          auth_id: authData.user.id,
          email,
          name,
          role,
          user_type: userType,
          is_invited: true,
          invitation_date: new Date().toISOString(),
        }
      ]);
    
    if (dbError) {
      console.error('[DirectEmailService] Error adding user to database:', dbError);
      return { success: false, error: dbError.message };
    }
    
    // Send password reset email to let user set their own password
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    if (resetError) {
      console.log('[DirectEmailService] Error sending reset password email. Falling back to direct email:', resetError);
      
      // Prepare a custom invitation email
      const userTypeLabel = userType === 'staff' ? 'Team Member' : 'Rentee';
      const subject = `Welcome to KH Rentals - Your ${userTypeLabel} Account`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to KH Rentals</h2>
          <p>Hello ${name},</p>
          <p>Your ${userTypeLabel.toLowerCase()} account has been created. Please set up your password to access the system.</p>
          <p>
            <a href="${window.location.origin}/reset-password?email=${encodeURIComponent(email)}" 
               style="display: inline-block; background-color: #4a90e2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
              Set Your Password
            </a>
          </p>
          <p>If the button above doesn't work, copy and paste this link into your browser:</p>
          <p>${window.location.origin}/reset-password?email=${encodeURIComponent(email)}</p>
          <p>This link will expire in 24 hours.</p>
          <p>Thank you,<br>KH Rentals Team</p>
        </div>
      `;
      
      const text = `
Welcome to KH Rentals

Hello ${name},

Your ${userTypeLabel.toLowerCase()} account has been created. Please set up your password to access the system.

Set your password here: ${window.location.origin}/reset-password?email=${encodeURIComponent(email)}

This link will expire in 24 hours.

Thank you,
KH Rentals Team
      `;
      
      // Send the custom email with SendGrid
      const emailResult = await sendDirectEmail({
        to: email,
        subject,
        html,
        text
      });
      
      if (!emailResult.success) {
        console.error('[DirectEmailService] Failed to send invitation email:', emailResult.message);
      }
    }
    
    return {
      success: true,
      user: {
        id: authData.user.id,
        email,
        name,
        role
      }
    };
  } catch (error) {
    console.error('[DirectEmailService] Unexpected error creating user:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Sends an email using SendGrid API with fallback to EmailJS
 * @param {Object|string} toParam - Either email address string or object with email properties
 * @param {string} [subjectParam] - Email subject (if toParam is a string)
 * @param {string} [htmlParam] - HTML content (if toParam is a string) 
 * @param {Object} [optionsParam] - Additional options (if toParam is a string)
 * @returns {Promise<Object>} - Result of the send operation
 */
export const sendDirectEmail = async (toParam, subjectParam, htmlParam, optionsParam = {}) => {
  // Normalize parameters to support both object and individual parameter styles
  const params = typeof toParam === 'object' 
    ? toParam 
    : { 
        to: toParam, 
        subject: subjectParam, 
        html: htmlParam,
        ...optionsParam
      };
  
  const { 
    to, 
    subject, 
    html, 
    text, 
    from, 
    fromName,
    attachments = [],
    simulated = false
  } = params;

  console.log(`[directEmailService] Attempting to send email to ${to} with subject "${subject}"`);

  // Get SendGrid API key
  const apiKey = getSendGridKey();
  const fromEmail = getFromEmail(from);
  const fromDisplayName = getFromName(fromName);
  
  // Check if we're in development mode
  const isDevelopment = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1';
  
  // If simulation is explicitly requested or we're in development mode without API key
  if (simulated || (isDevelopment && !apiKey)) {
    console.log(`[directEmailService] SIMULATING email to ${to}:`, {
      subject,
      from: `${fromDisplayName} <${fromEmail}>`,
      content: html || text || '(No content provided)'
    });
    
    return {
      success: true,
      simulated: true,
      message: 'Email simulated - not actually sent',
      to,
      subject,
      timestamp: new Date().toISOString()
    };
  }

  try {
    // If we have SendGrid API key, attempt to send with SendGrid first
    if (apiKey) {
      const payload = {
        personalizations: [
          {
            to: [{ email: to }],
            subject: subject,
          },
        ],
        from: {
          email: fromEmail,
          name: fromDisplayName,
        },
        content: [
          {
            type: 'text/html',
            value: html || `<p>${text || ''}</p>`,
          },
        ],
      };
      
      // Add plain text if provided
      if (text) {
        payload.content.push({
          type: 'text/plain',
          value: text,
        });
      }
      
      // Add attachments if any
      if (attachments && attachments.length > 0) {
        payload.attachments = attachments.map(attachment => ({
          content: typeof attachment.content === 'string' 
            ? attachment.content 
            : btoa(String.fromCharCode.apply(null, new Uint8Array(attachment.content))),
          filename: attachment.filename,
          type: attachment.type || 'application/octet-stream',
          disposition: 'attachment',
        }));
      }

      try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });
        
        if (response.ok) {
          console.log(`[directEmailService] Email sent successfully to ${to} using SendGrid`);
          return {
            success: true,
            message: 'Email sent successfully',
            to,
            subject,
            service: 'sendgrid',
            timestamp: new Date().toISOString()
          };
        } else {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          console.error(`[directEmailService] SendGrid API error:`, errorData);
          throw new Error(`SendGrid API error: ${errorData.message || response.statusText}`);
        }
      } catch (error) {
        // Check if it's a CORS error 
        if (error.message?.includes('CORS') || error.message?.includes('Failed to fetch')) {
          console.warn(`[directEmailService] CORS error sending via SendGrid API - falling back to EmailJS:`, error);
          // Fall back to EmailJS
          return await sendWithEmailJS(to, subject, html, text, fromEmail, fromDisplayName);
        }
        throw error;
      }
    } else {
      console.warn(`[directEmailService] No SendGrid API key found, falling back to EmailJS`);
      return await sendWithEmailJS(to, subject, html, text, fromEmail, fromDisplayName);
    }
  } catch (error) {
    console.error(`[directEmailService] Error sending email:`, error);
    
    // Last resort fallback - try EmailJS if we haven't already
    if (!error.message?.includes('EmailJS')) {
      try {
        console.warn('[directEmailService] Attempting final fallback to EmailJS');
        return await sendWithEmailJS(to, subject, html, text, fromEmail, fromDisplayName);
      } catch (emailjsError) {
        console.error(`[directEmailService] EmailJS fallback also failed:`, emailjsError);
        return {
          success: false,
          error: `Failed to send email: ${error.message}. EmailJS fallback also failed: ${emailjsError.message}`,
          service: 'both-failed'
        };
      }
    }
    
    return {
      success: false,
      error: `Failed to send email: ${error.message}`,
      service: error.message?.includes('EmailJS') ? 'emailjs' : 'sendgrid'
    };
  }
};

// Helper function to send via EmailJS
async function sendWithEmailJS(to, subject, html, text, fromEmail, fromDisplayName) {
  if (typeof window === 'undefined' || !window.emailjs) {
    console.error('[directEmailService] EmailJS not available');
    return {
      success: false,
      error: 'EmailJS not available',
      service: 'emailjs-unavailable'
    };
  }
  
  try {
    console.log(`[directEmailService] Attempting to send via EmailJS to ${to}`);
    const serviceId = window._env_?.EMAILJS_SERVICE_ID 
      || import.meta.env?.VITE_EMAILJS_SERVICE_ID 
      || 'default_service';
      
    const templateId = window._env_?.EMAILJS_TEMPLATE_ID 
      || import.meta.env?.VITE_EMAILJS_TEMPLATE_ID 
      || 'default_template';
      
    const userId = window._env_?.EMAILJS_USER_ID 
      || import.meta.env?.VITE_EMAILJS_USER_ID;
    
    const result = await window.emailjs.send(
      serviceId,
      templateId,
      {
        to_email: to,
        subject: subject,
        message_html: html,
        message: text || '',
        from_name: fromDisplayName,
        from_email: fromEmail,
      },
      userId
    );
    
    console.log(`[directEmailService] Email sent successfully via EmailJS:`, result);
    return {
      success: true,
      message: 'Email sent successfully via EmailJS',
      to,
      subject,
      service: 'emailjs',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[directEmailService] EmailJS error:`, error);
    throw new Error(`EmailJS error: ${error.message}`);
  }
}

/**
 * Send an email directly via EmailJS
 * This is a dedicated function for using EmailJS directly, without trying SendGrid first
 * 
 * @param {string|Object} toOrOptions - Recipient email or options object
 * @param {string} [subjectParam] - Email subject (when using individual parameters)
 * @param {string} [htmlContent] - HTML content (when using individual parameters)
 * @returns {Promise<Object>} - Result of the operation
 */
export const sendEmailViaEmailJS = async (toOrOptions, subjectParam, htmlContent) => {
  try {
    // Handle both parameter styles
    let to, html, subject;
    
    // Check if first parameter is an object (options style)
    if (typeof toOrOptions === 'object' && toOrOptions !== null) {
      to = toOrOptions.to;
      subject = toOrOptions.subject;
      html = toOrOptions.html;
    } else {
      // Individual parameters style
      to = toOrOptions;
      subject = subjectParam;
      html = htmlContent;
    }
    
    console.log('[DirectEmail] Sending via EmailJS to:', to);
    
    if (typeof window === 'undefined' || !window.emailjs) {
      return {
        success: false,
        message: 'EmailJS not available'
      };
    }
    
    // Initialize EmailJS if not already initialized
    if (typeof window.emailjs.init === 'function' && !window._emailjsInitialized) {
      const emailJsUserId = window._env_?.VITE_EMAILJS_USER_ID || 
                           import.meta.env?.VITE_EMAILJS_USER_ID || 
                           'ufEQ7lI3syjLwu1SO'; // Fallback ID
      
      window.emailjs.init(emailJsUserId);
      window._emailjsInitialized = true;
    }
    
    // Get service and template IDs from environment or use fallbacks
    const serviceId = window._env_?.VITE_EMAILJS_SERVICE_ID || 
                      import.meta.env?.VITE_EMAILJS_SERVICE_ID || 
                      'service_48cvcae';  // Fallback service ID
                      
    const templateId = window._env_?.VITE_EMAILJS_TEMPLATE_ID || 
                       import.meta.env?.VITE_EMAILJS_TEMPLATE_ID || 
                       'template_ihjqp5c';  // Fallback template ID
    
    const emailParams = {
      to_email: to,
      to_name: to.split('@')[0],
      subject,
      message: html
    };
    
    const result = await window.emailjs.send(
      serviceId,
      templateId,
      emailParams
    );
    
    console.log('[DirectEmail] EmailJS result:', result);
    return {
      success: true,
      data: { to, subject, sentAt: new Date().toISOString() }
    };
  } catch (error) {
    console.error('[DirectEmail] EmailJS error:', error);
    return {
      success: false,
      message: error.message
    };
  }
};

/**
 * Send a magic link (OTP) to a user for passwordless login
 * 
 * @param {Object|string} emailOrOptions - Email to send the magic link to or options object
 * @param {Object} [options] - Options for sending magic link
 * @param {string} [options.redirectTo] - URL to redirect after authentication
 * @param {Object} [options.userData] - User metadata to include in the OTP
 * @returns {Promise<Object>} - Result of the operation
 */
export const sendMagicLink = async (emailOrOptions, options = {}) => {
  try {
    // Handle both function signatures
    const email = typeof emailOrOptions === 'object' && emailOrOptions !== null 
      ? emailOrOptions.email 
      : emailOrOptions;
      
    const redirectTo = typeof emailOrOptions === 'object' && emailOrOptions !== null
      ? emailOrOptions.redirectTo
      : options.redirectTo;
      
    const userData = typeof emailOrOptions === 'object' && emailOrOptions !== null
      ? emailOrOptions.userData
      : options.userData;
    
    console.log(`[DirectEmailService] Sending magic link to ${email}`);
    
    // Try Supabase's built-in magic link feature first
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: userData,
        emailRedirectTo: redirectTo
      }
    });
    
    if (!error) {
      console.log(`[DirectEmailService] Magic link sent via Supabase to ${email}`);
      return { success: true };
    }
    
    console.warn(`[DirectEmailService] Supabase magic link failed: ${error.message}. Trying direct email...`);
    
    // Create a custom magic link email as fallback using SendGrid
    const baseUrl = getAppBaseUrl();
    const magicLinkUrl = `${baseUrl}/auth/callback?email=${encodeURIComponent(email)}&type=magiclink&redirect=${encodeURIComponent(redirectTo || '/')}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Sign in to KH Rentals</h2>
        <p>Hello,</p>
        <p>Click the button below to sign in to your KH Rentals account. This link will expire in 24 hours.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${magicLinkUrl}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Sign In to KH Rentals</a>
        </div>
        <p>If you didn't request this email, you can safely ignore it.</p>
        <p>Best regards,<br>KH Rentals Team</p>
      </div>
    `;
    
    const plainTextContent = `
Sign in to KH Rentals

Hello,

Click the link below to sign in to your KH Rentals account. This link will expire in 24 hours.

${magicLinkUrl}

If you didn't request this email, you can safely ignore it.

Best regards,
KH Rentals Team
    `;
    
    // Send the fallback email via SendGrid
    return sendDirectEmail({
      to: email,
      subject: 'Sign in to KH Rentals',
      html: htmlContent,
      text: plainTextContent
    });
  } catch (error) {
    console.error(`[DirectEmailService] Error sending magic link:`, error);
    return { success: false, error: error.message };
  }
}; 