/**
 * =========================================================================
 * DEPRECATED: This file exists only for backward compatibility.
 * Use invitationService.js directly for all user invitation and management.
 * =========================================================================
 */

import { supabase } from './supabaseClient';
import { 
  inviteUser, 
  resendInvitation as resendInvite,
  checkInvitationStatus as checkStatus
} from './invitationService';

// Re-export the functions from invitationService.js
export const sendInvitation = inviteUser;
export { inviteUser, resendInvite as resendInvitation, checkStatus as checkInvitationStatus };

// For backwards compatibility
export const inviteTeamMember = async (email, name, role) => {
  console.log('[Deprecated] Using inviteTeamMember from invitation.js - please update to use invitationService.js directly');
  
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
    return await inviteUser(
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

// Log a deprecation warning
console.warn('[Deprecated] invitation.js is deprecated and will be removed in a future version. Please update imports to use invitationService.js directly.'); 