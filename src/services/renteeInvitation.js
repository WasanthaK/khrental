/**
 * RENTEE INVITATION SERVICE
 * 
 * This service provides a clean, direct way to invite rentees,
 * without any dependencies on other invitation services.
 */

import { supabase } from './supabaseClient';
import { toast } from 'react-hot-toast';
import { generateToken } from '../utils/tokenUtils';

/**
 * Send an invitation to a rentee using a direct invitation link
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
    
    // Create a secure token with all user information
    const token = generateToken({
      userId: userId,
      email: email,
      name: name,
      role: 'rentee'
    }, '7d'); // Token valid for 7 days
    
    // Build the direct invitation URL
    let inviteUrl;
    const origin = window.location.origin;
    
    // Force HTTPS if not already using it
    if (origin.startsWith('http://') && !origin.includes('localhost')) {
      inviteUrl = origin.replace('http://', 'https://') + '/setup-account';
    } else {
      inviteUrl = origin + '/setup-account';
    }
    
    // Add token as query parameter
    inviteUrl += `?token=${encodeURIComponent(token)}`;
    
    console.log(`[renteeInvitation] Generated direct invitation URL: ${inviteUrl}`);
    
    // For development/demo, return the invitation URL so it can be displayed to the user
    // In production, this would send an email with the URL
    return {
      success: true,
      message: `Invitation prepared for ${email}`,
      invitationUrl: inviteUrl,
      token,
      // In production, you would integrate with your email service here
      // For now, we'll just return the URL so you can test it
      note: "In production, this would send an email. For now, please copy and share this URL manually."
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