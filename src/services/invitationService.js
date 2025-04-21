/**
 * Unified Invitation Service
 * 
 * Handles invitations for all user types:
 * - Staff members
 * - Rentees
 * - Admin users
 * 
 * Provides a consistent interface for sending invitations regardless of source.
 */

import { supabase } from './supabaseClient';
import { sendDirectEmail } from './directEmailService';
import { getAppBaseUrl } from '../utils/env';

// Add a debug helper to log even in production
const logInvitationDebug = (requestId, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}][${requestId}][InvitationService] ${message}`;
  
  console.log(logMsg, data);
  
  // Log to application insights or other production logging
  if (window.appInsights && window.appInsights.trackTrace) {
    window.appInsights.trackTrace({ message: logMsg, properties: data });
  }
};

/**
 * Send an invitation to a user
 * 
 * @param {Object} userDetails User details object
 * @param {string} userDetails.email User's email
 * @param {string} userDetails.name User's name
 * @param {string} userDetails.role User's role (staff, rentee, admin)
 * @param {string} userDetails.id User's ID in the app_users table
 * @param {boolean} simulated Whether to simulate email sending (for testing)
 * @returns {Promise<Object>} Result object
 */
export const inviteUser = async (userDetails, simulated = false) => {
  // Generate unique ID for this invitation request
  const requestId = `invite_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  try {
    // Check for required parameters
    if (!userDetails.email || !userDetails.id) {
      logInvitationDebug(requestId, 'Missing required parameters:', userDetails);
      return {
        success: false,
        error: 'Missing required fields: email and id are required',
        debug: { userDetails }
      };
    }
    
    logInvitationDebug(requestId, `Inviting user ${userDetails.name} (${userDetails.email}) with ID ${userDetails.id}`);
    
    // Update the app_users table to mark as invited
    const { error: updateError } = await supabase
      .from('app_users')
      .update({
        invited: true,
        updatedat: new Date().toISOString()
      })
      .eq('id', userDetails.id);
    
    if (updateError) {
      logInvitationDebug(requestId, 'Error updating invitation status:', updateError);
      // Continue with invitation despite the error
    }
    
    // Generate a redirect URL for the invitation using the app base URL
    const baseUrl = getAppBaseUrl();
    logInvitationDebug(requestId, 'Base URL for invitation:', { baseUrl });
    
    const redirectUrl = `${baseUrl}/accept-invite`;
    logInvitationDebug(requestId, 'Using redirect URL:', { redirectUrl });
    
    // Try to use Supabase Auth to send the invitation
    logInvitationDebug(requestId, 'Attempting to send invitation via Supabase Auth to:', { email: userDetails.email });
    
    const resetOptions = {
      redirectTo: redirectUrl,
      data: {
        app_user_id: userDetails.id,
        name: userDetails.name,
        role: userDetails.role
      }
    };
    logInvitationDebug(requestId, 'Reset options:', resetOptions);
    
    const { data: resetData, error: resetError } = await supabase.auth.resetPasswordForEmail(
      userDetails.email,
      resetOptions
    );
    
    logInvitationDebug(requestId, 'Supabase auth reset result:', { data: resetData, error: resetError });
    
    // If Supabase invitation fails or is simulated, use direct email
    // Generate a magic link to the accept-invite page with parameters
    const inviteLink = `${baseUrl}/accept-invite?email=${encodeURIComponent(userDetails.email)}&user_id=${userDetails.id}&name=${encodeURIComponent(userDetails.name || '')}&type=invite`;
    logInvitationDebug(requestId, 'Created invite link:', { inviteLink });
    
    // Send a direct email with the invitation link
    logInvitationDebug(requestId, 'Sending direct email invitation to:', { email: userDetails.email });
    
    const emailResult = await sendDirectEmail({
      to: userDetails.email,
      subject: 'Your Invitation to KH Rentals',
      html: getInvitationEmailTemplate(userDetails.name, inviteLink, userDetails.role),
      simulated: simulated
    });
    
    logInvitationDebug(requestId, 'Direct email result:', emailResult);
    
    if (!emailResult.success) {
      logInvitationDebug(requestId, 'Failed to send direct invitation email:', emailResult);
      return {
        success: false,
        error: 'Failed to send invitation email',
        debug: { emailError: emailResult }
      };
    }
    
    // Return success with simulated flag
    return {
      success: true,
      simulated: emailResult.simulated || simulated,
      message: emailResult.simulated ? 'Invitation email was simulated' : 'Invitation sent successfully via direct email',
      method: 'direct_email'
    };
  } catch (error) {
    logInvitationDebug(requestId, 'Unexpected error:', { error: error.message, stack: error.stack });
    return {
      success: false,
      error: error.message,
      debug: { stack: error.stack }
    };
  }
};

/**
 * Resend an invitation to an existing user
 * 
 * @param {string} userId User ID in the app_users table
 * @param {boolean} simulated Whether to simulate email sending
 * @returns {Promise<Object>} Result object
 */
export const resendInvitation = async (userId, simulated = false) => {
  try {
    console.log(`[InvitationService] Resending invitation for user ${userId}`);
    
    // Get user details from app_users table
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .select('id, email, name, role, user_type')
      .eq('id', userId)
      .single();
    
    if (userError || !userData) {
      console.error('[InvitationService] Error fetching user data:', userError);
      return {
        success: false,
        error: userError ? userError.message : 'User not found',
        debug: { userId }
      };
    }
    
    // Map user data to the format expected by inviteUser
    const userDetails = {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      role: userData.role || userData.user_type
    };
    
    // Use the standard invitation flow
    return inviteUser(userDetails, simulated);
  } catch (error) {
    console.error('[InvitationService] Error resending invitation:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if a user has accepted their invitation
 * 
 * @param {string} userId User ID in the app_users table
 * @returns {Promise<Object>} Result object with invitation status
 */
export const checkInvitationStatus = async (userId) => {
  try {
    if (!userId) {
      return {
        success: false,
        error: 'User ID is required'
      };
    }
    
    // Query the app_users table to get auth_id and invited status
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .select('id, auth_id, invited')
      .eq('id', userId)
      .single();
    
    if (userError) {
      console.error(`[InvitationService] Error fetching invitation status for ${userId}:`, userError);
      return {
        success: false,
        error: userError.message
      };
    }
    
    if (!userData) {
      return {
        success: false,
        error: 'User not found'
      };
    }
    
    // Determine the invitation status
    let status = 'not_invited';
    
    if (userData.auth_id) {
      status = 'registered'; // User has linked their auth account
    } else if (userData.invited) {
      status = 'invited'; // User has been invited but not registered
    }
    
    return {
      success: true,
      status,
      hasAuthId: !!userData.auth_id
    };
  } catch (error) {
    console.error('[InvitationService] Error checking invitation status:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Generate HTML email template for invitations
 * 
 * @param {string} name Recipient's name
 * @param {string} inviteLink Invitation link
 * @param {string} role User's role (staff, rentee, admin)
 * @returns {string} HTML email template
 */
function getInvitationEmailTemplate(name, inviteLink, role) {
  const userTypeLabel = role === 'staff' || role === 'admin' ? 'Team Member' : 'Rentee';
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #4a90e2;">Welcome to KH Rentals</h1>
      </div>
      
      <p>Hello ${name || 'there'},</p>
      
      <p>You have been invited to join KH Rentals as a ${userTypeLabel}. Please click the button below to set up your account and get started.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteLink}" style="background-color: #4a90e2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
          Set Up Your Account
        </a>
      </div>
      
      <p>If the button above doesn't work, you can copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #4a90e2;">${inviteLink}</p>
      
      <p>This invitation link will expire in 24 hours for security reasons.</p>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #777; font-size: 12px;">
        <p>If you did not expect this invitation, you can safely ignore this email.</p>
        <p>© ${new Date().getFullYear()} KH Rentals. All rights reserved.</p>
      </div>
    </div>
  `;
} 