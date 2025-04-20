/**
 * RENTEE INVITATION SERVICE
 * 
 * This service provides a clean, direct way to invite rentees,
 * without any dependencies on other invitation services.
 */

import { supabase } from './supabaseClient';
import { toast } from 'react-hot-toast';

/**
 * Send an invitation to a rentee using magic link instead of admin API
 * @param {string} email - Rentee's email
 * @param {string} name - Rentee's name
 * @param {string} userId - ID of the rentee in app_users table
 * @returns {Promise<Object>} - Result of the invitation
 */
export const sendRenteeInvitation = async (email, name, userId) => {
  console.log(`[renteeInvitation] Sending invitation to ${name} (${email}) with ID ${userId}`);
  
  try {
    if (!email || !userId) {
      const error = 'Email and user ID are required for sending invitation';
      console.error(`[renteeInvitation] ${error}`);
      return { success: false, error };
    }
    
    // First, mark the user as invited in the database
    console.log(`[renteeInvitation] Updating invitation status for user ${userId}`);
    const { error: updateError } = await supabase
      .from('app_users')
      .update({ 
        invited: true,
        updatedat: new Date().toISOString()
      })
      .eq('id', userId);
    
    if (updateError) {
      console.error(`[renteeInvitation] Failed to update invitation status:`, updateError);
      return { success: false, error: `Failed to update user status: ${updateError.message}` };
    }
    
    // Then send the magic link (non-admin approach)
    console.log(`[renteeInvitation] Sending magic link to ${email}`);

    // Build a proper redirect URL with HTTPS
    let redirectUrl;
    const origin = window.location.origin;

    // Force HTTPS if not already using it
    if (origin.startsWith('http://') && !origin.includes('localhost')) {
      redirectUrl = origin.replace('http://', 'https://') + '/accept-invite';
    } else {
      redirectUrl = origin + '/accept-invite';
    }

    // Add query parameters for user identification
    redirectUrl += `?user_id=${userId}&name=${encodeURIComponent(name || 'User')}&email=${encodeURIComponent(email)}`;

    console.log(`[renteeInvitation] Using redirect URL: ${redirectUrl}`);
    
    // Use the standard auth.signInWithOtp instead of admin.inviteUserByEmail
    const { data, error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          name: name || 'Rentee',
          role: 'rentee',
          user_type: 'rentee',
          app_user_id: userId
        }
      }
    });
    
    if (error) {
      console.error(`[renteeInvitation] Failed to send magic link:`, error);
      // Don't revert the invited status since we still want to track that we tried
      return { success: false, error: `Failed to send invitation: ${error.message}` };
    }
    
    console.log(`[renteeInvitation] Successfully sent magic link to ${email}`, data);
    return {
      success: true,
      message: `Invitation magic link sent to ${email}`,
      data
    };
  } catch (error) {
    console.error(`[renteeInvitation] Unexpected error:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Check the invitation status of a rentee
 * @param {string} userId - ID of the rentee in app_users table
 * @returns {Promise<Object>} - Status information
 */
export const checkRenteeInvitationStatus = async (userId) => {
  console.log(`[renteeInvitation] Checking status for user ${userId}`);
  
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, invited, auth_id')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error(`[renteeInvitation] Error fetching user status:`, error);
      return { success: false, error: error.message };
    }
    
    let status = 'not_invited';
    if (data.auth_id) {
      status = 'registered';
    } else if (data.invited) {
      status = 'invited';
    }
    
    console.log(`[renteeInvitation] Status for user ${userId}: ${status}`);
    return { 
      success: true, 
      data: {
        ...data,
        status
      }
    };
  } catch (error) {
    console.error(`[renteeInvitation] Error checking status:`, error);
    return { success: false, error: error.message };
  }
}; 