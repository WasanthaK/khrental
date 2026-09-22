import { inviteUser } from './invitationService';
import {
  checkAppUserInvitationStatusRecord,
  createAppUserRecord,
  deleteAppUserRecord,
  fetchAppUserRecord,
  fetchAppUsersRecord,
  findAppUserByAuthIdRecord,
  findAppUserByEmailRecord,
  linkAppUserRecord,
  updateAppUserRecord
} from './appUserRepository';

export const mapAppUserToTeamMember = (member) => ({
  id: member.id,
  name: member.name || 'Unnamed Member',
  role: member.role || 'staff',
  contactDetails: member.contact_details || member.contactDetails || {},
  skills: member.skills || [],
  availability: member.availability || {},
  notes: member.notes || '',
  active: member.status === 'active',
  invited: member.invited,
  authId: member.auth_id,
  createdAt: member.createdat || member.created_at || new Date().toISOString(),
  updatedAt: member.updatedat || member.updated_at || member.createdat || member.created_at || new Date().toISOString()
});

export const mapAppUserToRentee = (rentee) => ({
  id: rentee.id,
  name: rentee.name,
  email: rentee.email,
  contactDetails: rentee.contact_details || rentee.contactDetails || {},
  idCopyURL: rentee.id_copy_url,
  idCopyUrl: rentee.id_copy_url,
  registrationDate: rentee.createdat || rentee.created_at,
  associatedPropertyIds: rentee.associated_property_ids || [],
  associatedProperties: rentee.associated_properties || [],
  status: rentee.tenant_membership_status || rentee.status || 'active',
  active: (rentee.tenant_membership_status || rentee.status || 'active') === 'active',
  membershipId: rentee.tenant_membership_id || null,
  invited: rentee.invited,
  authId: rentee.auth_id,
  createdAt: rentee.createdat || rentee.created_at || new Date().toISOString(),
  updatedAt: rentee.updatedat || rentee.updated_at || rentee.createdat || rentee.created_at || new Date().toISOString(),
  national_id: rentee.national_id,
  permanent_address: rentee.permanent_address
});

/**
 * Create a new app user (staff or rentee).
 *
 * Account creation intentionally does not send email. Stage 3A secure invitation
 * delivery happens only after the server has created a single-use invitation
 * token, so a partially-created user cannot receive a misleading welcome email.
 *
 * @param {Object} userData - User data
 * @param {string} userType - 'staff' or 'rentee'
 * @returns {Promise<Object>} - Result of the creation
 */
export const createAppUser = async (userData, userType) => {
  if (!userData) {
    return { success: false, error: 'No user data provided' };
  }

  try {
    const result = await createAppUserRecord(userData, userType);

    if (!result.success) {
      return result;
    }

    return { success: true, data: result.data };
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

    console.log(`[appUserService] Calling sendInvitation to generate token for user ${userId}`);

    const userDetails = {
      id: userId,
      email,
      name,
      role: userType
    };

    const result = await inviteUser(userDetails, !sendReal);

    if (!result.success) {
      console.error('[appUserService] Invitation failed:', result.error);
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
 * Link a platform auth user to an app_user record
 * @param {string} authId - Auth user ID from the platform auth layer
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
    const result = await linkAppUserRecord(authId, appUserId);
    if (result.success) {
      console.log(`[linkAppUser] Successfully linked auth user ${authId} to app_user ${appUserId}`);
    }

    return result;
  } catch (error) {
    console.error('[linkAppUser] Exception linking user record:', error);
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
    return await findAppUserByEmailRecord(email);
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
    return await findAppUserByAuthIdRecord(authId);
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

    const result = await checkAppUserInvitationStatusRecord(userId);
    if (result.success) {
      console.log(`User data for ${userId}:`, result.data);
      console.log(`Determined status for ${userId}: ${result.data.status}`);
    }

    return result;
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
    return await updateAppUserRecord(id, userData);
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
    return await fetchAppUserRecord(id);
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
    return await fetchAppUsersRecord(userType, filters);
  } catch (error) {
    console.error('Error in fetchAppUsers:', error);
    throw error;
  }
};

export const deleteAppUser = async (id) => {
  if (!id) {
    return { success: false, error: 'User ID is required' };
  }

  try {
    return await deleteAppUserRecord(id);
  } catch (error) {
    console.error('Error in deleteAppUser:', error);
    return { success: false, error: error.message };
  }
};
