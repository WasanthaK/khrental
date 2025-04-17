import { supabase } from './supabaseClient';
import { sendEmailNotification } from './notificationService';
import { USER_ROLES } from '../utils/constants';

/**
 * Utility function to ensure a record has valid timestamp fields
 * @param {Object} record - Record to validate
 * @returns {Object} - Record with valid timestamp fields
 */
export const ensureValidTimestamps = (record) => {
  if (!record) { return record; }
  
  const now = new Date().toISOString();
  return {
    ...record,
    createdat: record.createdat || now,
    updatedat: record.updatedat || record.createdat || now
  };
};

/**
 * Create a new app user (staff or rentee)
 * @param {Object} userData - User data
 * @param {string} userType - 'staff' or 'rentee'
 * @returns {Promise<Object>} - Result of the creation
 */
export const createAppUser = async (userData, userType) => {
  if (!userData) {
    return { success: false, error: 'No user data provided' };
  }

  try {
    // Format data for insertion
    const now = new Date().toISOString();
    const dataToInsert = {
      ...userData,
      user_type: userType,
      createdat: now,
      updatedat: now,
      // Extract email from contact_details if not directly provided
      email: userData.email || (userData.contact_details && userData.contact_details.email) || (userData.contactDetails && userData.contactDetails.email)
    };

    // Validate email
    if (!dataToInsert.email) {
      return { success: false, error: 'Email is required' };
    }

    const { data, error } = await supabase
      .from('app_users')
      .insert(dataToInsert)
      .select('*')
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return { success: false, error: error.message };
    }

    if (userType === USER_ROLES.RENTEE && dataToInsert.email) {
      // Send welcome email to new rentee
      await sendEmailNotification({
        to: dataToInsert.email,
        subject: 'Welcome to KH Rentals',
        body: `Welcome to KH Rentals, ${userData.name}! Your account has been created.`
      });
    }

    return { success: true, data: ensureValidTimestamps(data) };
  } catch (error) {
    console.error('Error in createAppUser:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Invite a user to create an account
 * @param {string} email - User's email
 * @param {string} name - User's name
 * @param {string} userType - 'staff' or 'rentee'
 * @param {string} userId - ID of the user in app_users table
 * @returns {Promise<Object>} - Result of the invitation
 */
export const inviteAppUser = async (email, name, userType, userId) => {
  console.log(`[inviteAppUser] Inviting ${userType} ${name} (${email}) with ID ${userId}`);
  
  try {
    if (!email || !name || !userType || !userId) {
      console.error('[inviteAppUser] Missing required parameters:', { email, name, userType, userId });
      return { 
        success: false, 
        error: 'Missing required parameters for invitation',
        debug: { email, name, userType, userId }
      };
    }
    
    // Determine auth role based on user type
    let authRole = userType === 'staff' ? 'staff' : 'rentee';
    
    // First check if the app_user exists
    console.log(`[inviteAppUser] Checking if app_user ${userId} exists`);
    const { data: appUser, error: userCheckError } = await supabase
      .from('app_users')
      .select('id, email, auth_id, invited')
      .eq('id', userId)
      .single();
      
    if (userCheckError) {
      console.error(`[inviteAppUser] Error checking app_user ${userId}:`, userCheckError);
      return { 
        success: false, 
        error: `Error checking app_user: ${userCheckError.message}`,
        debug: { userCheckError }
      };
    }
    
    if (!appUser) {
      console.error(`[inviteAppUser] App user ${userId} not found`);
      return { 
        success: false, 
        error: 'App user not found',
        debug: { userId }
      };
    }
    
    // If user already has auth_id, check if it's a valid Supabase user
    if (appUser.auth_id) {
      console.log(`[inviteAppUser] User ${userId} already has auth_id ${appUser.auth_id}, checking if valid`);
      
      // For security reasons, we'll just send a new magic link rather than checking if the user exists
      console.log(`[inviteAppUser] User has existing auth_id, sending magic link anyway`);
    }
    
    // Send magic link email - this will create a new user if one doesn't exist
    // or send a magic link to an existing user
    console.log(`[inviteAppUser] Sending magic link to ${email}`);
    const { data: otpData, error: magicLinkError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: { 
          role: authRole,
          user_type: userType,
          name: name,
          app_user_id: userId
        },
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    
    if (magicLinkError) {
      console.error(`[inviteAppUser] Error sending magic link to ${email}:`, magicLinkError);
      return { 
        success: false, 
        error: magicLinkError.message,
        debug: { magicLinkError }
      };
    }
    
    console.log(`[inviteAppUser] Magic link sent successfully to ${email}`, otpData);
    
    // Update the app_users table to mark as invited
    // We'll set the auth_id when the user actually signs in via AuthCallback component
    console.log(`[inviteAppUser] Updating app_user ${userId} as invited`);
    const { error: updateError } = await supabase
      .from('app_users')
      .update({ 
        invited: true,
        updatedat: new Date().toISOString()
      })
      .eq('id', userId);
    
    if (updateError) {
      console.error(`[inviteAppUser] Error updating app_user ${userId} as invited:`, updateError);
      return { 
        success: false, 
        error: `Error updating user as invited: ${updateError.message}`,
        debug: { updateError, otpSent: true }
      };
    }
    
    // Send a custom email notification with more information
    const subject = userType === 'staff' 
      ? 'Welcome to KH Rentals Staff Portal' 
      : 'Welcome to KH Rentals - Complete Your Registration';
    
    const message = userType === 'staff'
      ? `
Hello ${name},

You have been invited to join KH Rentals as a ${authRole}. We've sent a magic link to this email address that will allow you to sign in without a password.

Simply click the "Sign In" button in the email you receive, and you'll be logged in automatically to access the staff portal.

Once you're logged in, you will be able to access all the features and tools necessary for your role.

If you have any questions, please contact the admin team.

Regards,
KH Rentals Team
      `
      : `
Hello ${name},

You have been registered as a rentee with KH Rentals. We've sent a magic link to this email address that will allow you to sign in without a password.

Simply click the "Sign In" button in the email you receive, and you'll be logged in automatically to access your rentee portal.

Once you're logged in, you will be able to:
- View your rental agreements
- Submit maintenance requests
- Pay invoices
- Communicate with your property manager

If you have any questions, please contact your property manager.

Regards,
KH Rentals Team
      `;
    
    try {
      console.log(`[inviteAppUser] Sending custom email notification to ${email}`);
      await sendEmailNotification(email, subject, message);
      console.log(`[inviteAppUser] Custom email notification sent successfully to ${email}`);
    } catch (emailError) {
      console.error(`[inviteAppUser] Error sending custom email notification to ${email}:`, emailError);
      // Continue with the invitation process even if email fails
    }
    
    console.log(`[inviteAppUser] Invitation process completed successfully for ${email}`);
    return { 
      success: true, 
      data: {
        email,
        user_type: userType,
        invited: true
      }
    };
  } catch (error) {
    console.error(`[inviteAppUser] Unexpected error inviting user ${email}:`, error);
    return { 
      success: false, 
      error: error.message,
      debug: { error: error.toString(), stack: error.stack }
    };
  }
};

/**
 * Link a Supabase auth user to an app_user record
 * @param {string} authId - Auth user ID from Supabase
 * @param {string} appUserId - ID of the app_user record
 * @returns {Promise<Object>} - Result of the linking operation
 */
export const linkAppUser = async (authId, appUserId) => {
  console.log(`[linkAppUser] Linking auth user ${authId} to app_user ${appUserId}`);
  
  if (!authId || !appUserId) {
    console.error('[linkAppUser] Missing required parameters:', { authId, appUserId });
    return { 
      success: false, 
      error: 'Auth ID and app_user ID are both required',
      debug: { authId, appUserId }
    };
  }

  try {
    // First check if the app_user record exists
    const { data: existingUser, error: checkError } = await supabase
      .from('app_users')
      .select('id, auth_id')
      .eq('id', appUserId)
      .single();
    
    if (checkError) {
      console.error(`[linkAppUser] Error checking app_user ${appUserId}:`, checkError);
      return { 
        success: false, 
        error: `Error checking app_user: ${checkError.message}`,
        debug: { checkError }
      };
    }
    
    if (!existingUser) {
      console.error(`[linkAppUser] App user ${appUserId} not found`);
      return { 
        success: false, 
        error: 'App user not found',
        debug: { appUserId }
      };
    }
    
    console.log(`[linkAppUser] Found app_user ${appUserId}, current auth_id:`, existingUser.auth_id);
    
    // Update the app_user record with the auth user ID
    const { data, error } = await supabase
      .from('app_users')
      .update({ 
        auth_id: authId, 
        invited: true,
        updatedat: new Date().toISOString()
      })
      .eq('id', appUserId)
      .select();
    
    if (error) {
      console.error(`[linkAppUser] Error updating app_user ${appUserId}:`, error);
      return { 
        success: false, 
        error: `Error updating app_user: ${error.message}`,
        debug: { error }
      };
    }
    
    if (!data || data.length === 0) {
      console.error(`[linkAppUser] No data returned after update for app_user ${appUserId}`);
      return { 
        success: false, 
        error: 'No data returned after update',
        debug: { data }
      };
    }
    
    console.log(`[linkAppUser] Successfully linked auth user ${authId} to app_user ${appUserId}`);
    return { success: true, data: data[0] };
  } catch (error) {
    console.error(`[linkAppUser] Exception linking user record:`, error);
    return { 
      success: false, 
      error: `Exception: ${error.message}`,
      debug: { error: error.toString(), stack: error.stack }
    };
  }
};

/**
 * Find app_user by email
 * @param {string} email - User's email
 * @returns {Promise<Object>} - Result with user data
 */
export const findAppUserByEmail = async (email) => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error finding user by email:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Find app_user by auth ID
 * @param {string} authId - Auth user ID
 * @returns {Promise<Object>} - Result with user data
 */
export const findAppUserByAuthId = async (authId) => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error finding user by auth ID:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Check if an invitation has been sent to a user
 * @param {string} userId - ID of the app_user
 * @returns {Promise<Object>} - Result with invitation status
 */
export const checkAppUserInvitationStatus = async (userId) => {
  console.log(`Checking invitation status for user ${userId}`);
  
  try {
    if (!userId) {
      console.error('No userId provided to checkAppUserInvitationStatus');
      throw new Error('User ID is required');
    }
    
    // First check if the app_users table exists
    try {
      // Use a simpler query that's less likely to cause parsing errors
      const { data: testData, error: testError } = await supabase
        .from('app_users')
        .select('id')
        .limit(1);
      
      if (testError) {
        console.error('Error checking app_users table:', testError);
        throw new Error(`The app_users table might not exist: ${testError.message}`);
      }
    } catch (tableError) {
      console.error('Error checking app_users table:', tableError);
      throw new Error(`The app_users table might not exist: ${tableError.message}`);
    }
    
    // If we get here, the table exists, so we can check the user
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, invited, auth_id')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error(`Error fetching user ${userId} from app_users:`, error);
      throw error;
    }
    
    console.log(`User data for ${userId}:`, data);
    
    // Determine status
    let status = 'not_invited';
    if (data.auth_id) {
      status = 'registered';
    } else if (data.invited) {
      status = 'invited';
    }
    
    console.log(`Determined status for ${userId}: ${status}`);
    
    return { 
      success: true, 
      data: {
        ...data,
        status
      }
    };
  } catch (error) {
    console.error(`Error checking invitation status for ${userId}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Update an existing app user (staff or rentee)
 * @param {string} id - ID of the user to update
 * @param {Object} userData - Updated user data
 * @returns {Promise<Object>} - Result of the update
 */
export const updateAppUser = async (id, userData) => {
  if (!id || !userData) {
    return { success: false, error: 'User ID and update data are required' };
  }

  try {
    // Always update the updatedat timestamp
    const dataToUpdate = {
      ...userData,
      updatedat: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('app_users')
      .update(dataToUpdate)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: ensureValidTimestamps(data) };
  } catch (error) {
    console.error('Error in updateAppUser:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Fetch app_user by ID
 * @param {string} id - ID of the user
 * @returns {Promise<Object>} - Result with user data
 */
export const fetchAppUser = async (id) => {
  if (!id) {
    throw new Error('User ID is required');
  }

  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      throw error;
    }

    if (!data) {
      throw new Error('User not found');
    }

    return ensureValidTimestamps(data);
  } catch (error) {
    console.error('Error in fetchAppUser:', error);
    throw error;
  }
};

/**
 * Fetch multiple app_users
 * @param {string} userType - Filter by user type
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array<Object>>} - Result with user data
 */
export const fetchAppUsers = async (userType, filters = {}) => {
  try {
    let query = supabase
      .from('app_users')
      .select('*');
    
    // Filter by user_type if provided
    if (userType) {
      query = query.eq('user_type', userType);
    }
    
    // Apply any additional filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
    
    // Apply timestamp validation to all records
    return data ? data.map(record => ensureValidTimestamps(record)) : [];
  } catch (error) {
    console.error('Error in fetchAppUsers:', error);
    throw error;
  }
}; 