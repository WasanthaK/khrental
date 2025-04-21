import { supabase } from './supabaseClient';
import { getAppBaseUrl } from '../utils/env';

/**
 * Direct email service that uses SendGrid API for emails
 */

// Get the API key with fallbacks
const getSendGridKey = () => {
  try {
    // Try to get the SendGrid key from different possible environment variables
    const key = window._env_?.VITE_SENDGRID_API_KEY || 
                import.meta.env?.VITE_SENDGRID_API_KEY || 
                process.env?.VITE_SENDGRID_API_KEY;
    
    // Log without revealing whether key was found for security
    console.log('[DirectEmail] Attempting to use SendGrid API');
    
    return key || null;
  } catch (error) {
    console.error('[DirectEmail] Error accessing environment variables:', error.message);
    return null;
  }
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
  
  console.error('[DirectEmail] Supabase anon key not found in environment variables');
  return null;
};

// Get the URL with fallbacks
const getSupabaseUrl = () => {
  // Try window._env_ first
  if (window._env_ && window._env_.VITE_SUPABASE_URL) {
    let url = window._env_.VITE_SUPABASE_URL;
    
    // Use CORS proxy in development environment
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (!url.includes('localhost:9090')) {
        console.log('[DirectEmail] Using CORS proxy for development:', url, '->', `http://localhost:9090/${url}`);
        url = `http://localhost:9090/${url}`;
      }
    }
    
    return url;
  }
  
  // Try import.meta.env next
  if (import.meta.env && import.meta.env.VITE_SUPABASE_URL) {
    let url = import.meta.env.VITE_SUPABASE_URL;
    
    // Use CORS proxy in development environment
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (!url.includes('localhost:9090')) {
        console.log('[DirectEmail] Using CORS proxy for development:', url, '->', `http://localhost:9090/${url}`);
        url = `http://localhost:9090/${url}`;
      }
    }
    
    return url;
  }
  
  console.error('[DirectEmail] Supabase URL not found in environment variables');
  return null;
};

// Get the from email with fallbacks
const getFromEmail = (from) => {
  const envEmail = window._env_?.VITE_EMAIL_FROM || 
                  import.meta.env?.VITE_EMAIL_FROM;
  
  return from || envEmail || null;
};

// Get the from name with fallbacks
const getFromName = (fromName) => {
  const envName = window._env_?.VITE_EMAIL_FROM_NAME || 
                 import.meta.env?.VITE_EMAIL_FROM_NAME;
  
  return fromName || envName || null;
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
    
    // Get the app base URL
    const baseUrl = getAppBaseUrl();
    
    // Send password reset email to let user set their own password
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/reset-password`,
    });
    
    if (resetError) {
      console.log('[DirectEmailService] Error sending reset password email:', resetError);
      
      // In development, just simulate successful invitation
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('[DirectEmailService] Development mode - simulating successful invitation');
        console.log(`[DirectEmailService] In production, user would get email with link to: ${baseUrl}/reset-password?email=${encodeURIComponent(email)}`);
        
        return {
          success: true,
          simulated: true,
          user: {
            id: authData.user.id,
            email,
            name,
            role
          }
        };
      }
      
      return { success: false, error: resetError.message };
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
 * Sends an email using SendGrid API via Supabase Edge function
 * @param {Object|string} toParam - Either email address string or object with email properties
 * @param {string} [subjectParam] - Email subject (if toParam is a string)
 * @param {string} [htmlParam] - HTML content (if toParam is a string) 
 * @param {Object} [optionsParam] - Additional options (if toParam is a string)
 * @returns {Promise<Object>} - Result of the send operation
 */
export const sendDirectEmail = async (toParam, subjectParam, htmlParam, optionsParam = {}) => {
  // Generate unique request ID to track this email through logs
  const requestId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Normalize parameters to support both object and individual parameter styles
  const params = typeof toParam === 'object' 
    ? toParam 
    : { 
        to: toParam, 
        subject: subjectParam, 
        html: htmlParam,
        ...optionsParam
      };
  
  const { to, subject, html } = params;

  console.log(`[${requestId}][directEmailService] Email to ${to} with subject "${subject}" would be sent in production`);
  
  try {
    // If simulated or no API key, simulate the email
    if (simulated || !apiKey) {
      console.log(`[${requestId}][directEmailService] 🔵 SIMULATING email to ${to}:`, {
        subject,
        from: `${fromDisplayName} <${fromEmail}>`,
        content: html ? `[HTML ${html.length} chars]` : text ? `[TEXT ${text.length} chars]` : '(No content provided)'
      });
      
      return {
        success: true,
        simulated: true,
        message: 'Email simulated (not actually sent)',
        requestId
      };
    }
    
    // Get the Supabase URL
    const supabaseUrl = getSupabaseUrl();
    if (!supabaseUrl) {
      console.error(`[${requestId}][directEmailService] ❌ Supabase URL not configured in environment variables`);
      return {
        success: false,
        message: 'Email service not configured properly (missing Supabase URL)',
        requestId
      };
    }
    
    // Get Supabase anon key for authentication
    const supabaseAnonKey = getSupabaseKey();
    if (!supabaseAnonKey) {
      console.error(`[${requestId}][directEmailService] ❌ Supabase anon key not available`);
      return {
        success: false, 
        message: 'Email service authentication not configured properly',
        requestId
      };
    }
    
    console.log(`[${requestId}][directEmailService] 🔄 Sending email via Supabase Edge Function to ${to}`);
    
    // Prepare email payload
    const payload = {
      to,
      subject,
      from: fromEmail,
      fromName: fromDisplayName,
      attachments
    };
    
    // Add content - IMPORTANT: text/plain MUST come before text/html for SendGrid
    // If only HTML is provided, create a basic text version
    if (!text && html) {
      // Create a simple text version from HTML by removing tags
      payload.text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    } else if (text) {
      payload.text = text;
    }
    
    // Add HTML content AFTER text content
    if (html) {
      payload.html = html;
    }
    
    // Calculate payload size for logging (useful for debugging large emails)
    const payloadSize = JSON.stringify(payload).length;
    console.log(`[${requestId}][directEmailService] 📦 Request payload size: ${payloadSize} bytes`);
    
    // Construct the URL for the Supabase Edge Function
    // Make sure the URL follows the correct format for Supabase Edge Functions
    let functionUrl = `${supabaseUrl}/functions/v1/sendgrid-email`;
    
    // Ensure the URL doesn't have double slashes between functions/v1 and the function name
    functionUrl = functionUrl.replace('functions/v1//sendgrid-email', 'functions/v1/sendgrid-email');
    
    console.log(`[${requestId}][directEmailService] 🌐 Function URL: ${functionUrl}`);
    
    // Start timing the request
    const startTime = Date.now();
    
    // Make the request to the Supabase Edge Function
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify(payload)
    });
    
    // Calculate duration
    const duration = Date.now() - startTime;
    console.log(`[${requestId}][directEmailService] ⏱️ Supabase Edge Function response time: ${duration.toFixed(2)}ms`);
    
    // Log response status
    console.log(`[${requestId}][directEmailService] 📊 Response status: ${response.status} ${response.statusText}`);
    
    // Parse the response
    const result = await response.json();
    
    if (!response.ok) {
      console.error(`[${requestId}][directEmailService] ❌ Error from Edge Function:`, result);
      
      // Extract error details if available
      let errorMessage = 'Unknown error sending email';
      if (result.error) {
        errorMessage = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
      }
      
      return {
        success: false,
        message: errorMessage,
        requestId,
        statusCode: response.status
      };
    }
    
    console.log(`[${requestId}][directEmailService] ✅ Email sent successfully to ${to}`);
    
    return {
      success: true,
      message: 'Email sent successfully',
      requestId,
      ...result
    };
  } catch (error) {
    console.error(`[${requestId}][directEmailService] ❌ Error sending email:`, error);
    
    // Extract browser info for debugging
    let browserInfo = {};
    try {
      browserInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor
      };
    } catch (e) {
      // Ignore errors while getting browser info
    }
    
    console.error(`[${requestId}][directEmailService] Browser information:`, browserInfo);
    
    // Try falling back to EmailJS
    try {
      return await sendWithEmailJS(to, subject, html, text, fromEmail, fromDisplayName);
    } catch (fallbackError) {
      return {
        success: false,
        message: `Error sending email: ${error.message}. Fallback also failed: ${fallbackError.message}`,
        requestId
      };
    }
  }
  
  // For production, use Supabase Auth's built-in email functionality
  // This would be implemented based on your production needs
  
  return {
    success: true,
    simulated: true,
    message: 'Email would be sent in production',
    to,
    subject,
    timestamp: new Date().toISOString()
  };
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
    
    // Initialize EmailJS if not already initialized
    if (typeof window.emailjs.init === 'function' && !window._emailjsInitialized) {
      const emailJsUserId = window._env_?.VITE_EMAILJS_USER_ID || 
                           import.meta.env?.VITE_EMAILJS_USER_ID;
      
      if (!emailJsUserId) {
        console.error('[DirectEmail] EmailJS User ID not found');
        return {
          success: false,
          message: 'EmailJS User ID not configured'
        };
      }
      
      window.emailjs.init(emailJsUserId);
      window._emailjsInitialized = true;
    }
    
    // Get service and template IDs from environment
    const serviceId = window._env_?.VITE_EMAILJS_SERVICE_ID || 
                      import.meta.env?.VITE_EMAILJS_SERVICE_ID;
                      
    const templateId = window._env_?.VITE_EMAILJS_TEMPLATE_ID || 
                       import.meta.env?.VITE_EMAILJS_TEMPLATE_ID;
    
    if (!serviceId || !templateId) {
      console.error('[DirectEmail] EmailJS config missing (service ID or template ID)');
      return {
        success: false,
        message: 'EmailJS configuration is incomplete. Please check your environment variables.'
      };
    }
    
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
                           import.meta.env?.VITE_EMAILJS_USER_ID;
      
      if (!emailJsUserId) {
        console.error('[DirectEmail] EmailJS User ID not found');
        return {
          success: false,
          message: 'EmailJS User ID not configured'
        };
      }
      
      window.emailjs.init(emailJsUserId);
      window._emailjsInitialized = true;
    }
    
    // Get service and template IDs from environment
    const serviceId = window._env_?.VITE_EMAILJS_SERVICE_ID || 
                      import.meta.env?.VITE_EMAILJS_SERVICE_ID;
                      
    const templateId = window._env_?.VITE_EMAILJS_TEMPLATE_ID || 
                       import.meta.env?.VITE_EMAILJS_TEMPLATE_ID;
    
    if (!serviceId || !templateId) {
      console.error('[DirectEmail] EmailJS config missing (service ID or template ID)');
      return {
        success: false,
        message: 'EmailJS configuration is incomplete. Please check your environment variables.'
      };
    }
    
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

/**
 * Tests the email configuration and logs detailed debug information
 * @returns {Object} Configuration status and details
 */
export const testEmailConfiguration = async () => {
  // Generate a request ID for tracking
  const requestId = `email_test_${Date.now()}`;
  
  try {
    // Get configuration values
    const sendgridKey = getSendGridKey();
    const fromEmail = getFromEmail();
    const fromName = getFromName();
    const baseUrl = getAppBaseUrl();
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseKey();
    
    const config = {
      sendgridKey: sendgridKey ? "Present" : "Missing",
      fromEmail,
      fromName,
      baseUrl,
      supabaseUrl: supabaseUrl ? "Present" : "Missing",
      supabaseKey: supabaseKey ? "Present" : "Missing",
      timestamp: new Date().toISOString(),
      environment: import.meta.env.MODE || 'unknown',
      browserInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      }
    };
    
    console.log(`[${requestId}][EmailTest] Configuration:`, config);
    
    // Attempt to send a test email to verify configuration
    if (sendgridKey && fromEmail) {
      console.log(`[${requestId}][EmailTest] Attempting to send a test email...`);
      
      const testResult = await sendDirectEmail({
        to: fromEmail, // Send to the from email for testing
        subject: `[TEST] Email Configuration Test - ${new Date().toISOString()}`,
        html: `
          <div style="padding: 20px; font-family: Arial, sans-serif;">
            <h2>Email Configuration Test</h2>
            <p>This is a test email to verify your email configuration is working correctly.</p>
            <p>Configuration details:</p>
            <ul>
              <li>Base URL: ${baseUrl}</li>
              <li>From Email: ${fromEmail}</li>
              <li>From Name: ${fromName}</li>
              <li>SendGrid API: ${sendgridKey ? "Configured" : "Missing"}</li>
              <li>Test Time: ${new Date().toISOString()}</li>
            </ul>
            <p>If you received this email, your configuration is working!</p>
          </div>
        `,
        text: `Email Configuration Test\n\nThis is a test email to verify your email configuration is working correctly.\n\nConfiguration details:\n- Base URL: ${baseUrl}\n- From Email: ${fromEmail}\n- From Name: ${fromName}\n- SendGrid API: ${sendgridKey ? "Configured" : "Missing"}\n- Test Time: ${new Date().toISOString()}\n\nIf you received this email, your configuration is working!`,
        simulated: false
      });
      
      console.log(`[${requestId}][EmailTest] Test email result:`, testResult);
      
      return {
        success: true,
        configuration: config,
        testResult
      };
    } else {
      console.log(`[${requestId}][EmailTest] Email configuration incomplete, not sending test`);
      
      return {
        success: false,
        configuration: config,
        error: "Email configuration incomplete. Missing SendGrid API key or sender email."
      };
    }
  } catch (error) {
    console.error(`[EmailTest] Test failed:`, error);
    
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}; 