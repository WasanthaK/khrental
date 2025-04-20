/**
 * INVITATION SERVICE - SUPABASE AUTH INTEGRATION
 * 
 * This service provides invitation functionality using Supabase's built-in auth systems
 * with the SendGrid SMTP configuration you've already set up.
 */

import { supabase } from './supabaseClient';
import { toast } from 'react-hot-toast';

/**
 * Invite a user to create an account
 * @param {string} email - User's email
 * @param {string} name - User's name
 * @param {string} userType - 'staff' or 'rentee'
 * @param {string} userId - ID of the user in app_users table
 * @param {boolean} sendReal - Whether to send a real email or simulate
 * @returns {Promise<Object>} - Result of the invitation
 */
export const inviteUser = async (email, name, userType, userId, sendReal = false) => {
  console.log(`[invitationService] Inviting ${userType} ${name} (${email}) with ID ${userId}${sendReal ? ' - SENDING REAL EMAIL' : ''}`);
  
  try {
    if (!email || !name || !userType || !userId) {
      console.error('[invitationService] Missing required parameters for invitation');
      return { 
        success: false, 
        error: 'Missing required parameters for invitation',
        debug: { email, name, userType, userId }
      };
    }
    
    // Mark the user as invited in app_users table
    const { error: updateError } = await supabase
      .from('app_users')
      .update({ 
        invited: true,
        updatedat: new Date().toISOString()
      })
      .eq('id', userId);
    
    if (updateError) {
      console.error(`[invitationService] Error updating user invitation status:`, updateError);
      // We'll continue anyway as this is not critical
    }
    
    // Get the full origin
    const origin = window.location.origin;
    const redirectUrl = `${origin}/accept-invite`;
    
    // If sendReal is false, check if we should simulate
    // Use the REACT_APP_SIMULATE_EMAILS environment variable if it exists (only if sendReal is false)
    const shouldSimulate = !sendReal && (process.env.REACT_APP_SIMULATE_EMAILS === 'true');
    
    if (shouldSimulate) {
      console.log(`[invitationService] SIMULATING invitation email to ${email}`);
      // Just log that we would have sent an invitation
      console.log(`[invitationService] Would have sent invitation to ${email} with redirect to ${redirectUrl}`);
      toast.success(`SIMULATED: Invitation would be sent to ${email}`);
      
      return {
        success: true,
        data: {
          email,
          user_type: userType,
          invited: true,
          simulated: true,
          message: `SIMULATED: User invitation to ${email}`
        }
      };
    }
    
    // Use Supabase's built-in invitation system
    // This will automatically use your SendGrid SMTP configuration
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectUrl,
      data: {
        name: name,
        role: userType,
        user_type: userType,
        app_user_id: userId
      }
    });
    
    if (error) {
      console.error(`[invitationService] Error sending invitation:`, error);
      return {
        success: false,
        error: error.message,
        debug: { error }
      };
    }
    
    console.log(`[invitationService] Invitation sent successfully to ${email}`, data);
    return {
      success: true,
      data: {
        email,
        user_type: userType,
        invited: true,
        simulated: false,
        message: `User invitation sent successfully to ${email}`
      }
    };
  } catch (error) {
    console.error(`[invitationService] Unexpected error inviting user ${email}:`, error);
    return { 
      success: false, 
      error: error.message,
      debug: { error: error.toString(), stack: error.stack }
    };
  }
};

/**
 * Resend invitation to an existing user
 * @param {string} userId - ID of the user in app_users table
 * @returns {Promise<Object>} - Result of the invitation
 */
export const resendInvitation = async (userId) => {
  console.log(`[invitationService] Resending invitation to user ID ${userId}`);
  
  try {
    // Get user details
    const { data: user, error: fetchError } = await supabase
      .from('app_users')
      .select('id, email, name, user_type')
      .eq('id', userId)
      .single();
      
    if (fetchError || !user) {
      console.error(`[invitationService] Failed to fetch user:`, fetchError);
      return {
        success: false,
        error: fetchError?.message || 'User not found'
      };
    }
    
    // Send the invitation
    return await inviteUser(user.email, user.name, user.user_type, user.id);
  } catch (error) {
    console.error(`[invitationService] Unexpected error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if a user has accepted their invitation
 * @param {string} userId - ID of the user in app_users table
 * @returns {Promise<Object>} - Result with invitation status
 */
export const checkInvitationStatus = async (userId) => {
  console.log(`[invitationService] Checking invitation status for user ${userId}`);
  
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, invited, auth_id')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error(`[invitationService] Error fetching user ${userId}:`, error);
      throw error;
    }
    
    // Determine status
    let status = 'not_invited';
    if (data.auth_id) {
      status = 'registered';
    } else if (data.invited) {
      status = 'invited';
    }
    
    return { 
      success: true, 
      data: {
        ...data,
        status
      }
    };
  } catch (error) {
    console.error(`[invitationService] Error checking invitation status:`, error);
    return { success: false, error: error.message };
  }
};

export default {
  inviteUser,
  resendInvitation,
  checkInvitationStatus
}; 