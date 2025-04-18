import { supabase } from './supabaseClient';

/**
 * Direct email service that uses SendGrid API for emails
 */

// Get the API key with fallbacks
const getSendGridKey = () => {
  // Try to get the SendGrid key from different possible environment variables
  const key = window._env_?.VITE_SENDGRID_API_KEY || 
              import.meta.env?.VITE_SENDGRID_API_KEY || 
              process.env?.VITE_SENDGRID_API_KEY || 
              process.env?.SENDGRID_API_KEY;
  
  if (!key) {
    console.error('SendGrid API key not found in environment variables');
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
const getFromEmail = () => {
  return window._env_?.VITE_EMAIL_FROM || 
         import.meta.env?.VITE_EMAIL_FROM || 
         'noreply@khrentals.com';
};

// Get the from name with fallbacks
const getFromName = () => {
  return window._env_?.VITE_EMAIL_FROM_NAME || 
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
 * Send a direct email using SendGrid API
 * 
 * @param {string|Object} toOrOptions - Recipient email or options object
 * @param {string} [subject] - Email subject (when using individual parameters)
 * @param {string} [htmlContent] - HTML content (when using individual parameters)
 * @param {string} [textContent] - Plain text content (when using individual parameters)
 * @param {string} [fromEmail] - Sender email (when using individual parameters)
 * @param {string} [fromName] - Sender name (when using individual parameters)
 * @returns {Promise<Object>} - Result of the operation
 */
export const sendDirectEmail = async (toOrOptions, subject, htmlContent, textContent = '', fromEmail = null, fromName = null) => {
  try {
    // Handle both parameter styles
    let to, html, text, from, name;
    
    // Check if first parameter is an object (options style)
    if (typeof toOrOptions === 'object' && toOrOptions !== null) {
      to = toOrOptions.to;
      subject = toOrOptions.subject;
      html = toOrOptions.html;
      text = toOrOptions.text;
      from = toOrOptions.from || fromEmail || getFromEmail();
      name = toOrOptions.fromName || fromName || getFromName();
    } else {
      // Individual parameters style
      to = toOrOptions;
      html = htmlContent;
      text = textContent;
      from = fromEmail || getFromEmail();
      name = fromName || getFromName();
    }
    
    console.log(`Sending email to ${to} with subject: ${subject}`);
    
    const sendGridKey = getSendGridKey();
    if (!sendGridKey) {
      console.error('Cannot send email: SendGrid API key is missing');
      throw new Error('SendGrid API key not configured');
    }
    
    // Prepare the email payload for SendGrid
    const emailPayload = {
      personalizations: [
        {
          to: [{ email: to }],
          subject: subject,
        },
      ],
      from: {
        email: from,
        name: name,
      },
      content: [
        {
          type: 'text/plain',
          value: text || html.replace(/<[^>]*>/g, ''), // Fallback to stripped HTML if text not provided
        },
        {
          type: 'text/html',
          value: html,
        },
      ],
    };
    
    // Send email using SendGrid API
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sendGridKey}`
      },
      body: JSON.stringify(emailPayload),
    });
    
    // Check response
    if (!response.ok) {
      const errorText = await response.text();
      console.error('SendGrid API error:', response.status, errorText);
      
      // Try fallback to EmailJS if SendGrid fails
      if (window.emailjs) {
        console.log('Attempting fallback to EmailJS...');
        await sendWithEmailJS(to, subject, html);
        return { success: true, message: 'Email sent via EmailJS fallback' };
      }
      
      throw new Error(`SendGrid API error: ${response.status} ${errorText}`);
    }
    
    console.log('Email sent successfully via SendGrid');
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, message: error.message || 'Failed to send email' };
  }
};

// Helper function to send via EmailJS as fallback
const sendWithEmailJS = async (to, subject, htmlContent) => {
  if (!window.emailjs) {
    throw new Error('EmailJS not available for fallback');
  }
  
  try {
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
    
    await window.emailjs.send(
      serviceId,
      templateId,
      {
        to_email: to,
        to_name: to.split('@')[0],
        subject: subject,
        message: htmlContent
      }
    );
    
    console.log('Email sent successfully via EmailJS fallback');
    return true;
  } catch (error) {
    console.error('EmailJS fallback error:', error);
    throw error;
  }
};

/**
 * Send an email directly via EmailJS
 * This is a dedicated function for using EmailJS directly, without trying SendGrid first
 * 
 * @param {string|Object} toOrOptions - Recipient email or options object
 * @param {string} [subject] - Email subject (when using individual parameters)
 * @param {string} [htmlContent] - HTML content (when using individual parameters)
 * @returns {Promise<Object>} - Result of the operation
 */
export const sendEmailViaEmailJS = async (toOrOptions, subject, htmlContent) => {
  try {
    // Handle both parameter styles
    let to, html;
    
    // Check if first parameter is an object (options style)
    if (typeof toOrOptions === 'object' && toOrOptions !== null) {
      to = toOrOptions.to;
      subject = toOrOptions.subject;
      html = toOrOptions.html;
    } else {
      // Individual parameters style
      to = toOrOptions;
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
 * @returns {Promise<Object>} - Result of the operation
 */
export const sendMagicLink = async (emailOrOptions, options = {}) => {
  try {
    // Handle both function signatures
    let email, redirectTo;
    
    if (typeof emailOrOptions === 'object' && emailOrOptions !== null) {
      email = emailOrOptions.email;
      redirectTo = emailOrOptions.redirectTo;
    } else {
      email = emailOrOptions;
      redirectTo = options.redirectTo;
    }
    
    console.log(`[DirectEmailService] Sending magic link to ${email}`);
    
    // Try Supabase's built-in magic link feature first
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo
      }
    });
    
    if (!error) {
      console.log(`[DirectEmailService] Magic link sent via Supabase to ${email}`);
      return { success: true };
    }
    
    console.warn(`[DirectEmailService] Supabase magic link failed: ${error.message}. Trying direct email...`);
    
    // Create a custom magic link email as fallback using SendGrid
    const magicLinkUrl = `${window.location.origin}/auth/callback?email=${encodeURIComponent(email)}&type=magiclink&redirect=${encodeURIComponent(redirectTo || '/')}`;
    
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