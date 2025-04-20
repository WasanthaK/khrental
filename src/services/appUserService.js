import { supabase } from './supabaseClient';
import { sendEmailNotification } from './notificationService';
import { USER_ROLES } from '../utils/constants';
import { sendInvitation } from './invitation';

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
 * @param {boolean} [sendReal=false] - Send real emails instead of simulating
 * @returns {Promise<Object>} - Result of the invitation
 */
export const inviteAppUser = async (email, name, userType, userId, sendReal = false) => {
  console.log(`[appUserService] Inviting ${userType} ${name} (${email}) with ID ${userId} - CONSOLIDATED VERSION`);
  
  try {
    if (!email || !name || !userType || !userId) {
      console.error('[appUserService] Missing required parameters for invitation');
      return { 
        success: false, 
        error: 'Missing required parameters for invitation',
        debug: { email, name, userType, userId }
      };
    }
    
    // Use the token-based invitation system to create a secure setup link
    console.log(`[appUserService] Calling sendInvitation to generate token for user ${userId}`);
    
    // Create userDetails object to match the expected format in sendInvitation
    const userDetails = {
      id: userId,
      email: email,
      name: name,
      role: userType
    };
    
    // Pass forceSimulation=false if sendReal is true
    const result = await sendInvitation(userDetails, !sendReal);
    
    if (!result.success) {
      console.error(`[appUserService] Invitation failed:`, result.error);
      return {
        success: false,
        error: result.error,
        debug: result
      };
    }
    
    console.log(`[appUserService] Invitation sent successfully to ${email}`, result);
    return {
      success: true,
      data: {
        email,
        user_type: userType,
        invited: true,
        message: `User invitation sent successfully to ${email}`
      }
    };
  } catch (error) {
    console.error(`[appUserService] Unexpected error inviting user ${email}:`, error);
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

// Helper functions for handling structured property associations
const STORAGE_KEY = 'kh_rentals_structured_associations';

/**
 * Store structured property associations in session storage
 * @param {string} userId - ID of the user
 * @param {Array} associations - Structured property associations
 */
export const storeStructuredAssociations = (userId, associations) => {
  try {
    // Get existing data
    const existingData = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    
    // Update with new data
    existingData[userId] = associations;
    
    // Save back to storage
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(existingData));
    console.log(`[appUserService] Stored ${associations.length} structured associations for user ${userId}`);
    return true;
  } catch (error) {
    console.error('[appUserService] Error storing structured associations:', error);
    return false;
  }
};

/**
 * Get structured property associations from session storage
 * @param {string} userId - ID of the user
 * @returns {Array} - Structured property associations
 */
export const getStructuredAssociations = (userId) => {
  try {
    // Get existing data
    const existingData = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    
    // Return data for the user
    return existingData[userId] || [];
  } catch (error) {
    console.error('[appUserService] Error getting structured associations:', error);
    return [];
  }
}; 