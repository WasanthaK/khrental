/**
 * User Management Service
 * Uses the platform auth layer for reliable user creation and management
 */

import { platform as platformClient } from './platformClient';
import { sendDirectEmail } from './directEmailService';
import { checkAppUserInvitationStatus, createAppUser, fetchAppUser, findAppUserByEmail } from './appUserService';

/**
 * Invite a new user with email/password
 * 
 * @param {Object} userData User data object
 * @param {string} userData.email User's email address
 * @param {string} userData.name User's name
 * @param {string} userData.role User's role
 * @param {string} userData.userType User type (staff/rentee)
 * @returns {Promise<Object>} Result object
 */
export const inviteUser = async (userData) => {
  const { email, name, role, userType } = userData;
  
  try {
    console.log(`[UserManagement] Inviting user: ${email} (${name}) as ${role}`);
    
    // Check if user exists in app_users table
    const existingUserResult = await findAppUserByEmail(email.toLowerCase());
    const existingUser = existingUserResult.success ? existingUserResult.data : null;
    
    if (existingUser) {
      console.log(`[UserManagement] User ${email} already exists in app_users`);
      return {
        success: false,
        error: 'User with this email already exists in the system'
      };
    }
    
    // Generate a random secure password
    const tempPassword = Array(12)
      .fill('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')
      .map(x => x[Math.floor(Math.random() * x.length)])
      .join('');
    
    // Create user with the platform auth layer
    const { data: authData, error: authError } = await platformClient.auth.signUp({
      email: email.toLowerCase(),
      password: tempPassword,
      options: {
        data: {
          name,
          role,
          user_type: userType
        }
      }
    });
    
    if (authError) {
      console.error('[UserManagement] Error creating auth user:', authError);
      return {
        success: false,
        error: authError.message
      };
    }
    
    const userId = authData.user.id;
    
    // Create record in app_users table
    const appUserResult = await createAppUser({
        auth_id: userId,
        email: email.toLowerCase(),
        name,
        role,
        user_type: userType,
        invited: true,
        invitation_date: new Date().toISOString()
      }, userType);
    
    if (!appUserResult.success) {
      console.error('[UserManagement] Error creating app_user record:', appUserResult.error);
      return {
        success: false,
        error: appUserResult.error
      };
    }

    const appUser = appUserResult.data;
    
    // Send password reset email to let them set their password
    const { error: resetError } = await platformClient.auth.resetPasswordForEmail(
      email.toLowerCase(),
      {
        redirectTo: `${window.location.origin}/reset-password`
      }
    );
    
    if (resetError) {
      console.error('[UserManagement] Error sending password reset email:', resetError);
      
      // If the platform auth email fails, send a direct email as fallback
      await sendWelcomeEmail(email, name, userType);
      
      return {
        success: true,
        user: appUser,
        emailSent: false,
        message: 'User created but there was an issue sending the email. A manual invitation email was sent instead.'
      };
    }
    
    return {
      success: true,
      user: appUser,
      emailSent: true,
      message: 'User created and invitation email sent successfully'
    };
  } catch (error) {
    console.error('[UserManagement] Unexpected error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send a welcome email with password reset link
 * Used as fallback if platform auth emails fail
 */
const sendWelcomeEmail = async (email, name, userType) => {
  const resetLink = `${window.location.origin}/reset-password?email=${encodeURIComponent(email)}`;
  const userTypeLabel = userType === 'staff' ? 'Team Member' : 'Rentee';
  
  return sendDirectEmail({
    to: email,
    subject: `Welcome to Quixo.Homes - Your ${userTypeLabel} Account`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Quixo.Homes</h2>
        <p>Hello ${name},</p>
        <p>Your ${userTypeLabel.toLowerCase()} account has been created. Please set up your password to access the system.</p>
        <p>
          <a href="${resetLink}" 
             style="display: inline-block; background-color: #4a90e2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
            Set Your Password
          </a>
        </p>
        <p>If the button above doesn't work, copy and paste this link into your browser:</p>
        <p>${resetLink}</p>
        <p>Thank you,<br>Quixo.Homes Team</p>
      </div>
    `
  });
};

/**
 * Resend invitation to an existing user
 */
export const resendInvitation = async (userId) => {
  try {
    // Get user details from app_users table
    let user = null;
    let userError = null;

    try {
      user = await fetchAppUser(userId);
    } catch (error) {
      userError = error;
    }
    
    if (userError || !user) {
      console.error('[UserManagement] Error fetching user:', userError);
      return {
        success: false,
        error: userError?.message || 'User not found'
      };
    }
    
    // Send password reset email
    const { error: resetError } = await platformClient.auth.resetPasswordForEmail(
      user.email,
      {
        redirectTo: `${window.location.origin}/reset-password`
      }
    );
    
    if (resetError) {
      console.error('[UserManagement] Error sending password reset:', resetError);
      
      // Fallback to direct email
      await sendWelcomeEmail(user.email, user.name, user.user_type);
      
      return {
        success: true,
        emailSent: false,
        message: 'There was an issue with the email service. A manual invitation email was sent instead.'
      };
    }
    
    return {
      success: true,
      emailSent: true,
      message: 'Invitation email resent successfully'
    };
  } catch (error) {
    console.error('[UserManagement] Error resending invitation:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if a user has a valid platform auth account
 */
export const checkUserAuthStatus = async (userId) => {
  try {
    const result = await checkAppUserInvitationStatus(userId);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'User not found'
      };
    }

    if (!result.data.hasAuthId) {
      return {
        success: true,
        registered: false
      };
    }
    
    return {
      success: true,
      registered: true
    };
  } catch (error) {
    console.error('[UserManagement] Error checking user status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}; 