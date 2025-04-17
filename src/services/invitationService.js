import { supabase } from './supabaseClient';
import { toast } from 'react-hot-toast';

/**
 * Send an invitation to a user with the specified role
 * @param {string} email - Email address to invite
 * @param {string} role - Role to assign ('rentee', 'admin', 'manager', etc.)
 * @returns {Promise<{success: boolean, message: string, error: string|null}>}
 */
export const inviteUser = async (email, role = 'rentee') => {
  try {
    console.log(`[Invitation] Inviting user ${email} with role ${role}`);
    
    // First check if email exists in the system
    const { data: existingUser } = await supabase
      .from('app_users')
      .select('id, email, role, status')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    
    if (existingUser) {
      console.log('[Invitation] User already exists:', existingUser);
      return { 
        success: false, 
        message: `User with email ${email} already exists in the system with role: ${existingUser.role}`,
        error: 'USER_EXISTS'
      };
    }
    
    // Generate a secure random password
    const tempPassword = Array(16)
      .fill('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+')
      .map(x => x[Math.floor(Math.random() * x.length)])
      .join('');
    
    // Use standard signup instead of admin invite
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: {
          role: role
        }
      }
    });
    
    if (signupError) {
      console.error('[Invitation] Signup error:', signupError);
      return {
        success: false,
        message: `Failed to create user: ${signupError.message}`,
        error: signupError.message
      };
    }
    
    if (!data?.user) {
      console.error('[Invitation] No user returned from signup');
      return {
        success: false,
        message: 'Failed to create user: No user data returned',
        error: 'NO_USER_DATA'
      };
    }
    
    // Create the app_user record
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .insert({
        auth_id: data.user.id,
        email: email.toLowerCase(),
        role: role,
        status: 'invited',
        name: email.split('@')[0],
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString()
      })
      .select();
    
    if (userError) {
      console.error('[Invitation] Error creating user record:', userError);
      return {
        success: false,
        message: `User created but failed to create profile: ${userError.message}`,
        error: userError.message
      };
    }
    
    // Request password reset to allow user to set their own password
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    
    if (resetError) {
      console.warn('[Invitation] Error sending password reset:', resetError);
      // Not returning an error as the user is created
    }
    
    return {
      success: true,
      message: `User ${email} created successfully with role ${role}. A password reset email has been sent.`
    };
  } catch (error) {
    console.error('[Invitation] Error inviting user:', error);
    return {
      success: false,
      message: `Error inviting user: ${error.message}`,
      error: error.message
    };
  }
};

/**
 * Invite a team member with specified role and send notification
 * @param {string} email - Email address to invite
 * @param {string} role - Staff role to assign
 * @param {object} details - Additional details about the staff member
 * @returns {Promise<{success: boolean, message: string, userId: string|null}>}
 */
export const inviteTeamMember = async (email, role, details = {}) => {
  try {
    // Create a basic name if not provided
    const name = details.name || email.split('@')[0];
    
    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('app_users')
      .select('id, email, role, status')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    
    if (existingUser) {
      console.log('[Invitation] Team member already exists:', existingUser);
      return { 
        success: false, 
        message: `User with email ${email} already exists with role: ${existingUser.role}`,
        error: 'USER_EXISTS'
      };
    }
    
    // Generate a secure random password
    const tempPassword = Array(16)
      .fill('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+')
      .map(x => x[Math.floor(Math.random() * x.length)])
      .join('');
    
    // Use standard signup
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: {
          role: role,
          user_type: 'staff'
        }
      }
    });
    
    if (signupError) {
      console.error('[Team] Signup error:', signupError);
      return {
        success: false,
        message: `Failed to create team member: ${signupError.message}`,
        error: signupError.message
      };
    }
    
    if (!data?.user) {
      console.error('[Team] No user returned from signup');
      return {
        success: false,
        message: 'Failed to create team member: No user data returned',
        error: 'NO_USER_DATA'
      };
    }
    
    // Create the staff user record
    const { data: userData, error: userError } = await supabase
      .from('app_users')
      .insert({
        auth_id: data.user.id,
        email: email.toLowerCase(),
        role: role,
        status: 'invited',
        name: name,
        user_type: 'staff',
        contact_details: details.contactDetails || {},
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString()
      })
      .select();
    
    if (userError) {
      console.error('[Team] Error creating staff record:', userError);
      return {
        success: false,
        message: `User created but failed to create profile: ${userError.message}`,
        error: userError.message
      };
    }
    
    // Request password reset to allow user to set their own password
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    
    if (resetError) {
      console.warn('[Team] Error sending password reset:', resetError);
      // We'll still consider this successful since the user was created
    }
    
    toast.success(`Team member ${email} created successfully`);
    return {
      success: true,
      message: `Team member ${email} created with role ${role}. A password reset email has been sent.`,
      userId: userData?.[0]?.id || null
    };
  } catch (error) {
    console.error('[Invitation] Error inviting team member:', error);
    toast.error(`Error inviting team member: ${error.message}`);
    return {
      success: false,
      message: `Error inviting team member: ${error.message}`,
      error: error.message
    };
  }
};

/**
 * Resend an invitation to a user who hasn't completed registration
 * @param {string} userId - ID of the user to resend invitation to
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const resendInvitation = async (userId) => {
  try {
    // Get the user's email and role
    const { data: user, error } = await supabase
      .from('app_users')
      .select('id, email, role, status, auth_id')
      .eq('id', userId)
      .single();
    
    if (error || !user) {
      return {
        success: false,
        message: `User not found: ${error?.message || 'Unknown error'}`
      };
    }
    
    if (!user.email) {
      return {
        success: false,
        message: 'Cannot resend invitation: user has no email address'
      };
    }
    
    // Send a password reset email which effectively serves as a re-invitation
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    
    if (resetError) {
      console.error('[Invitation] Error sending reset email:', resetError);
      return {
        success: false,
        message: `Failed to send reset email: ${resetError.message}`
      };
    }
    
    // Update the user status if it's not already 'invited'
    if (user.status !== 'invited') {
      const { error: updateError } = await supabase
        .from('app_users')
        .update({
          status: 'invited',
          updatedat: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (updateError) {
        console.warn('[Invitation] Error updating user status:', updateError);
        // Not returning error as the main operation succeeded
      }
    }
    
    return {
      success: true,
      message: `Reset email sent to ${user.email}`
    };
  } catch (error) {
    console.error('[Invitation] Error resending invitation:', error);
    return {
      success: false,
      message: `Error resending invitation: ${error.message}`
    };
  }
}; 