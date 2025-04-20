/**
 * INVITATION SERVICE - CONSOLIDATED VERSION
 * 
 * This is the canonical invitation service for KH Rentals.
 * It implements a token-based approach for secure user invitations.
 * 
 * HOW TO USE:
 * - For inviting users: import { sendInvitation } from './invitation'
 * - For checking token validity: import { verifyInvitationToken } from './invitation'
 * - For completing registration: import { completeUserSetup } from './invitation'
 * 
 * NOTE: Do not use invitationService.js which is deprecated.
 */

import { supabase } from './supabaseClient';
import { toDatabaseFormat } from '../utils/databaseUtils';
import { sendMagicLink } from './directEmailService';
import { getAppBaseUrl } from '../utils/env';
import { sendEmailNotification } from './notificationService';
import { v4 as uuidv4 } from 'uuid';
import { sendDirectEmail } from './directEmailService';
import { generateToken, verifyToken } from '../utils/tokenUtils';

// Token expiration time in seconds (24 hours)
const TOKEN_EXPIRATION = 24 * 60 * 60;

/**
 * Generate a secure token for invitation
 * 
 * @param {string} userId - User ID for whom the token is generated
 * @param {string} email - Email address of the user
 * @returns {Promise<Object>} - Result with the generated token or error
 */
export const generateInvitationToken = async (userId, email) => {
  try {
    // Generate a unique token
    const token = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION * 1000).toISOString();
    
    // Store the token in the database
    const { error } = await supabase
      .from('invitation_tokens')
      .insert({
        token,
        user_id: userId,
        email,
        created_at: now,
        expires_at: expiresAt,
        used: false
      });
    
    if (error) {
      console.error(`[Invitation] Error storing token:`, error);
      return { success: false, error: error.message };
    }
    
    return {
      success: true,
      token,
      expiresAt
    };
  } catch (error) {
    console.error(`[Invitation] Error generating token:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Verify an invitation token
 * 
 * @param {string} token - The token to verify
 * @returns {Promise<Object>} - Result with token validity and associated data
 */
export const verifyInvitationToken = async (token) => {
  try {
    if (!token) {
      return { success: false, error: 'No token provided' };
    }
    
    // Verify the JWT token
    try {
      const decodedToken = verifyToken(token);
      console.log('[Invitation] Token verified successfully:', decodedToken);
      
      // Extract data from the token
      const { userId, email, role } = decodedToken;
      
      if (!userId || !email) {
        return { success: false, error: 'Invalid token format' };
      }
      
      // Get user information
      const { data: userData, error: userError } = await supabase
        .from('app_users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (userError || !userData) {
        console.error(`[Invitation] User not found:`, userError);
        return { success: false, error: 'User not found' };
      }
      
      return {
        success: true,
        data: {
          userId,
          email,
          userType: userData.user_type || role,
          name: userData.name
        }
      };
    } catch (tokenError) {
      console.error('[Invitation] Token verification failed:', tokenError);
      return { success: false, error: 'Invalid or expired invitation token' };
    }
  } catch (error) {
    console.error(`[Invitation] Error verifying token:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Complete user setup with password
 * 
 * @param {string} token - Invitation token
 * @param {string} password - User password
 * @returns {Promise<Object>} - Result of the user creation
 */
export const completeUserSetup = async (token, password) => {
  try {
    // Verify token 
    const verifyResult = await verifyInvitationToken(token);
    if (!verifyResult.success) {
      return verifyResult;
    }
    
    const { userId, email, userType, name } = verifyResult.data;
    
    // Create the user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_type: userType,
          role: userType === 'staff' ? 'staff' : 'rentee',
          name,
        }
      }
    });
    
    if (authError) {
      console.error(`[Invitation] Error creating auth user:`, authError);
      return { success: false, error: authError.message };
    }
    
    // Update the app_user record with the auth user ID
    const { error: updateError } = await supabase
      .from('app_users')
      .update({
        auth_id: authData.user.id,
        invited: true,
        registered: true,
        updatedat: new Date().toISOString()
      })
      .eq('id', userId);
    
    if (updateError) {
      console.error(`[Invitation] Error updating app_user:`, updateError);
      return { success: false, error: updateError.message };
    }
    
    return {
      success: true,
      message: 'Account created successfully'
    };
  } catch (error) {
    console.error(`[Invitation] Error completing user setup:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Sends an invitation email with a secure token link
 * @param {Object} userDetails - User details object
 * @param {string} userDetails.id - User ID
 * @param {string} userDetails.email - User email address
 * @param {string} userDetails.name - User name
 * @param {string} userDetails.role - User role
 * @returns {Promise<Object>} Result object with success status
 */
export const sendInvitation = async (userDetails) => {
  const { id, email, name, role } = userDetails;
  
  try {
    // Generate a secure token with 7-day expiration
    const token = generateToken({ userId: id, email, role }, '7d');
    
    // Build the invitation URL with the token
    const baseUrl = window.location.origin;
    const invitationUrl = `${baseUrl}/setup-account?token=${encodeURIComponent(token)}`;
    
    // Check if we're in development mode to allow simulation
    const isDevelopment = 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1';
    
    console.log(`[invitation] Sending invitation email to ${email} with token`);
    
    // Send the email using the directEmailService
    const emailResult = await sendDirectEmail({
      to: email,
      subject: 'Welcome to KH Rentals - Account Setup',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to KH Rentals!</h2>
          <p>Hello ${name},</p>
          <p>You have been invited to set up your account on KH Rentals as a ${role}.</p>
          <p style="margin: 20px 0;">
            <a href="${invitationUrl}" 
               style="background-color: #4CAF50; color: white; padding: 10px 20px; 
                      text-decoration: none; border-radius: 4px; display: inline-block;">
              Set Up Your Account
            </a>
          </p>
          <p>Alternatively, you can copy and paste the following URL into your browser:</p>
          <p style="word-break: break-all; font-size: 14px; color: #666;">
            ${invitationUrl}
          </p>
          <p><strong>Note:</strong> This invitation link will expire in 7 days.</p>
          <p>If you have any questions, please contact your administrator.</p>
          <p>Best regards,<br>KH Rentals Team</p>
        </div>
      `,
      // Allow simulation in development mode
      simulated: isDevelopment
    });
    
    if (emailResult.success) {
      console.log(`[invitation] Invitation email sent successfully to ${email}`, emailResult);
      return {
        success: true,
        message: 'Invitation sent successfully',
        ...emailResult,
        token, // Return token for testing purposes in development
        userId: id
      };
    } else {
      console.error(`[invitation] Failed to send invitation email:`, emailResult.error);
      return {
        success: false,
        error: `Failed to send invitation: ${emailResult.error}`,
        userId: id
      };
    }
  } catch (error) {
    console.error(`[invitation] Error in sendInvitation:`, error);
    return {
      success: false,
      error: `Invitation error: ${error.message}`,
      userId: id
    };
  }
};

/**
 * Invite a team member (staff)
 * 
 * @param {string} email - Email of the team member to invite
 * @param {string} name - Name of the team member
 * @param {string} role - Role (manager, staff, maintenance, etc.)
 * @returns {Promise<Object>} - Result with success or error information
 */
export const inviteTeamMember = async (email, name, role) => {
  console.log(`[Invitation] Inviting team member ${name} (${email}) with role ${role}`);
  
  try {
    // First check if user already exists
    const { data: existingUser } = await supabase
      .from('app_users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .maybeSingle();
      
    if (existingUser) {
      return {
        success: false,
        error: `User with email ${email} already exists in the system`
      };
    }
    
    // Create app_user record first
    const { data: newUser, error: createError } = await supabase
      .from('app_users')
      .insert({
        email: email.toLowerCase(),
        name: name,
        role: role,
        user_type: 'staff',
        invited: false,
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString()
      })
      .select();
      
    if (createError) {
      console.error(`[Invitation] Failed to create app_user:`, createError);
      return {
        success: false,
        error: createError.message
      };
    }
    
    // Send the invitation and return the result directly
    return await sendInvitation(
      newUser[0]
    );
  } catch (error) {
    console.error(`[Invitation] Unexpected error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Resend invitation to an existing user
 * 
 * @param {string} userId - ID of the user in app_users table
 * @returns {Promise<Object>} - Result with success or error information
 */
export const resendInvitation = async (userId) => {
  console.log(`[Invitation] Resending invitation to user ID ${userId}`);
  
  try {
    // Get user details
    const { data: user, error: fetchError } = await supabase
      .from('app_users')
      .select('id, email, name, user_type')
      .eq('id', userId)
      .single();
      
    if (fetchError || !user) {
      console.error(`[Invitation] Failed to fetch user:`, fetchError);
      return {
        success: false,
        error: fetchError?.message || 'User not found'
      };
    }
    
    // Send the invitation
    return await sendInvitation(
      user
    );
  } catch (error) {
    console.error(`[Invitation] Unexpected error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}; 