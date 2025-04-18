import { supabase } from './supabaseClient';
import { toDatabaseFormat } from '../utils/databaseUtils';
import { sendMagicLink } from './directEmailService';
import { getAppBaseUrl } from '../utils/env';

/**
 * Invite a user using Supabase's auth system
 * 
 * @param {string} email - Email of the user to invite
 * @param {string} name - Name of the user
 * @param {string} userType - Type of user (staff or rentee)
 * @param {string} userId - ID of the user in app_users table
 * @returns {Promise<Object>} - Result with success or error information
 */
export const sendInvitation = async (email, name, userType, userId) => {
  console.log(`[Invitation] Inviting ${userType} ${name} (${email}) with ID ${userId}`);
  
  if (!email || !userType || !userId) {
    return {
      success: false,
      error: 'Missing required parameters',
      details: { email, userType, userId }
    };
  }
  
  try {
    // First check if the app_user exists
    const { data: appUser, error: userCheckError } = await supabase
      .from('app_users')
      .select('id, email, auth_id, invited')
      .eq('id', userId)
      .single();
      
    if (userCheckError) {
      console.error(`[Invitation] Error checking app_user ${userId}:`, userCheckError);
      return { 
        success: false, 
        error: `Error checking app_user: ${userCheckError.message}`,
      };
    }
    
    if (!appUser) {
      console.error(`[Invitation] App user ${userId} not found`);
      return { 
        success: false, 
        error: 'App user not found',
      };
    }
    
    // Get the base URL for the application
    const baseUrl = getAppBaseUrl();
    
    // User metadata to include in the magic link
    const userData = { 
      name,
      role: userType === 'staff' ? 'staff' : 'rentee',
      user_type: userType,
      force_password_change: true,
      app_user_id: userId
    };
    
    // Redirect to our callback page that will handle linking the user
    const redirectUrl = `${baseUrl}/auth/callback?type=invite&userId=${userId}`;
    
    // Try method 1: Supabase's built-in signInWithOtp function
    let magicLinkSuccess = false;
    let originalError = null;
    
    try {
      console.log(`[Invitation] Trying magic link via signInWithOtp for ${email}`);
      const { data, error: magicLinkError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: userData,
          emailRedirectTo: redirectUrl
        }
      });
      
      if (!magicLinkError) {
        console.log(`[Invitation] Successfully sent magic link via signInWithOtp`);
        magicLinkSuccess = true;
      } else {
        console.warn(`[Invitation] Failed to send magic link via signInWithOtp:`, magicLinkError);
        originalError = magicLinkError;
      }
    } catch (e) {
      console.error(`[Invitation] Error with signInWithOtp method:`, e);
      originalError = e;
    }
    
    // If method 1 fails, try method 2: Direct API call
    if (!magicLinkSuccess) {
      try {
        console.log(`[Invitation] Trying direct API call for magic link to ${email}`);
        const result = await sendMagicLink(email, {
          redirectTo: redirectUrl,
          userData: userData
        });
        
        if (result.success) {
          console.log(`[Invitation] Successfully sent magic link via direct API`);
          magicLinkSuccess = true;
          originalError = null;
        } else {
          console.warn(`[Invitation] Failed to send magic link via direct API:`, result.error);
          // Don't overwrite error if it already exists
          if (originalError === null) {
            originalError = new Error(result.error);
          }
        }
      } catch (directApiError) {
        console.error(`[Invitation] Error with direct API method:`, directApiError);
        // Don't overwrite error if it already exists
        if (originalError === null) {
          originalError = directApiError;
        }
      }
    }
    
    // If both methods fail, return error
    if (!magicLinkSuccess) {
      console.error(`[Invitation] All magic link methods failed for ${email}`);
      return {
        success: false,
        error: originalError?.message || 'Failed to send magic link'
      };
    }
    
    // Update app_user record to mark as invited
    console.log(`[Invitation] Updating app_user as invited`);
    const { error: updateError } = await supabase
      .from('app_users')
      .update({
        invited: true,
        updatedat: new Date().toISOString()
      })
      .eq('id', userId);
      
    if (updateError) {
      console.error(`[Invitation] Failed to update app_user:`, updateError);
      // Continue anyway since the invitation was sent
    }
    
    console.log(`[Invitation] Successfully sent magic link to ${email}`);
    return {
      success: true,
      message: `Magic link sent to ${email}`
    };
  } catch (error) {
    console.error(`[Invitation] Unexpected error:`, error);
    return {
      success: false,
      error: error.message
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
      email, 
      name, 
      'staff', 
      newUser[0].id
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
      user.email,
      user.name,
      user.user_type,
      user.id
    );
  } catch (error) {
    console.error(`[Invitation] Unexpected error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}; 