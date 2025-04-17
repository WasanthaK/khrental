import { supabase } from './supabaseClient';
import { sendEmailNotification } from './notificationService';
import { USER_ROLES } from '../utils/constants';

/**
 * Invite a rentee to create an account
 * @param {string} email - Rentee's email address
 * @param {string} name - Rentee's name
 * @param {string} renteeId - ID of the rentee record in the database
 * @returns {Promise<Object>} - Result of the invitation
 */
export const inviteRentee = async (email, name, renteeId) => {
  try {
    // Generate a secure temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    
    // Create user with Supabase Auth
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: { 
          role: USER_ROLES.RENTEE
        }
      }
    });
    
    if (authError) {
      console.error('Error creating rentee account:', authError);
      return { success: false, error: authError.message };
    }
    
    // Update the rentee record to mark as invited and add auth_id
    const { error: updateError } = await supabase
      .from('rentees')
      .update({ 
        invited: true,
        auth_id: data.user.id
      })
      .eq('id', renteeId);
    
    if (updateError) {
      console.error('Error updating rentee as invited:', updateError);
      // Continue with the invitation process even if update fails
    }
    
    // Send password reset email to let the user set their own password
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`
    });
    
    if (resetError) {
      console.error('Error sending password reset email:', resetError);
      // Continue anyway since the user was created
    }
    
    // Send a custom email notification with more information
    const subject = 'Welcome to KH Rentals - Complete Your Registration';
    const message = `
Hello ${name},

You have been registered as a rentee with KH Rentals. To complete your registration and access your rentee portal, please check your email for a password reset link to create your account.

Once your account is set up, you will be able to:
- View your rental agreements
- Submit maintenance requests
- Pay invoices
- Communicate with your property manager

If you have any questions, please contact your property manager.

Regards,
KH Rentals Team
    `;
    
    try {
      await sendEmailNotification(email, subject, message);
    } catch (emailError) {
      console.error('Error sending custom email notification:', emailError);
      // Continue with the invitation process even if email fails
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error inviting rentee:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Invite a team member to create an account
 * @param {string} email - Team member's email address
 * @param {string} name - Team member's name
 * @param {string} role - Team member's role
 * @param {string} teamMemberId - ID of the team member record in the database
 * @returns {Promise<Object>} - Result of the invitation
 */
export const inviteTeamMember = async (email, name, role, teamMemberId) => {
  try {
    // Map team_members role to auth role (may differ between tables)
    let authRole = USER_ROLES.STAFF;
    if (role === 'admin') {
      authRole = USER_ROLES.ADMIN;
    } else if (role === 'maintenance') {
      authRole = USER_ROLES.MAINTENANCE_STAFF;
    }
    
    // Generate a secure temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    
    // Create user with Supabase Auth
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: { 
          role: authRole
        }
      }
    });
    
    if (authError) {
      console.error('Error creating team member account:', authError);
      return { success: false, error: authError.message };
    }
    
    // Update the team member record to mark as invited and add auth_id
    const { error: updateError } = await supabase
      .from('app_users')
      .update({ 
        invited: true,
        auth_id: data.user.id
      })
      .eq('id', teamMemberId);
    
    if (updateError) {
      console.error('Error updating team member as invited:', updateError);
      // Continue with the invitation process even if update fails
    }
    
    // Send password reset email to let the user set their own password
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`
    });
    
    if (resetError) {
      console.error('Error sending password reset email:', resetError);
      // Continue anyway since the user was created
    }
    
    // Send a custom email notification with more information
    const subject = 'Welcome to KH Rentals Staff Portal';
    const message = `
Hello ${name},

You have been invited to join KH Rentals as a ${role}. To complete your registration and access the staff portal, please check your email for a password reset link to create your account.

Once your account is set up, you will be able to access all the features and tools necessary for your role.

If you have any questions, please contact the admin team.

Regards,
KH Rentals Team
    `;
    
    try {
      await sendEmailNotification(email, subject, message);
    } catch (emailError) {
      console.error('Error sending custom email notification:', emailError);
      // Continue with the invitation process even if email fails
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error inviting team member:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Link a Supabase auth user to an existing rentee or team member record
 * @param {string} authId - Auth user ID from Supabase
 * @param {string} recordId - ID of the rentee or team member record
 * @param {string} type - Type of record ('rentee' or 'team_member')
 * @returns {Promise<Object>} - Result of the linking operation
 */
export const linkUserRecord = async (authId, recordId, type) => {
  try {
    // Update the appropriate record with the auth user ID
    let table = type === 'rentee' ? 'rentees' : 'app_users';
    
    const { data, error } = await supabase
      .from(table)
      .update({ auth_id: authId, invited: true })
      .eq('id', recordId)
      .select();
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error(`Error linking ${type} record:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Check if an invitation has been sent to a user
 * @param {string} id - ID of the rentee or team member
 * @param {string} type - Type of user ('rentee' or 'team_member')
 * @returns {Promise<Object>} - Result with invitation status
 */
export const checkInvitationStatus = async (id, type) => {
  try {
    const table = type === 'rentee' ? 'rentees' : 'app_users';
    
    const { data, error } = await supabase
      .from(table)
      .select('id, email, invited, auth_id')
      .eq('id', id)
      .single();
    
    if (error) {
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
    console.error(`Error checking invitation status for ${type}:`, error.message);
    return { success: false, error: error.message };
  }
}; 