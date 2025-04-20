/**
 * User Management Service
 * Uses Supabase Auth for reliable user creation and management
 */

import { supabase } from './supabaseClient';
import { sendDirectEmail } from './directEmailService';

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
    const { data: existingUser } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    
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
    
    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
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
    const { data: appUser, error: dbError } = await supabase
      .from('app_users')
      .insert({
        auth_id: userId,
        email: email.toLowerCase(),
        name,
        role,
        user_type: userType,
        invited: true,
        invitation_date: new Date().toISOString()
      })
      .select()
      .single();
    
    if (dbError) {
      console.error('[UserManagement] Error creating app_user record:', dbError);
      return {
        success: false,
        error: dbError.message
      };
    }
    
    // Send password reset email to let them set their password
    const { data: resetData, error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.toLowerCase(),
      {
        redirectTo: `${window.location.origin}/reset-password`
      }
    );
    
    if (resetError) {
      console.error('[UserManagement] Error sending password reset email:', resetError);
      
      // If Supabase email fails, send a direct email as fallback
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
 * Used as fallback if Supabase auth emails fail
 */
const sendWelcomeEmail = async (email, name, userType) => {
  const resetLink = `${window.location.origin}/reset-password?email=${encodeURIComponent(email)}`;
  const userTypeLabel = userType === 'staff' ? 'Team Member' : 'Rentee';
  
  return sendDirectEmail({
    to: email,
    subject: `Welcome to KH Rentals - Your ${userTypeLabel} Account`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to KH Rentals</h2>
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
        <p>Thank you,<br>KH Rentals Team</p>
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
    const { data: user, error: userError } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (userError || !user) {
      console.error('[UserManagement] Error fetching user:', userError);
      return {
        success: false,
        error: userError?.message || 'User not found'
      };
    }
    
    // Send password reset email
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
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
 * Check if a user has a valid Supabase Auth account
 */
export const checkUserAuthStatus = async (userId) => {
  try {
    // Get user from app_users table
    const { data: user, error: userError } = await supabase
      .from('app_users')
      .select('auth_id')
      .eq('id', userId)
      .single();
    
    if (userError || !user) {
      return {
        success: false,
        error: userError?.message || 'User not found'
      };
    }
    
    // If no auth_id, they haven't completed registration
    if (!user.auth_id) {
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