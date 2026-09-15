import { platform as platformClient } from './platformClient';
import { isMssqlApiEnabled, requestMssqlApi } from './mssqlApiClient';
import { getDevBypassRole, loadStoredSession } from './requestContext';

const hasRequestIdentity = () => Boolean(loadStoredSession()?.user?.id || getDevBypassRole());

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isDuplicateEmailError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('uq_app_users_email')
    || message.includes('duplicate key')
    || message.includes('unique key constraint')
    || message.includes('unique constraint');
};

const shouldFallbackToPlatformQuery = (error) => {
  if (!error?.status) {
    return true;
  }

  return error.code === 'CENTRAL_AUTHORIZATION_REQUIRED' || error.status === 404;
};

const createEmailConflictResult = (email, existingUser = null) => ({
  success: false,
  error: `A KH Rentals user with email ${email} already exists. Use the existing user record or a different email address.`,
  code: 'APP_USER_EMAIL_CONFLICT',
  ...(existingUser ? { data: existingUser } : {})
});

export const ensureValidTimestamps = (record) => {
  if (!record) {
    return record;
  }

  const now = new Date().toISOString();
  return {
    ...record,
    createdat: record.createdat || now,
    updatedat: record.updatedat || record.createdat || now
  };
};

const normalizeCreatePayload = (userData, userType) => {
  const now = new Date().toISOString();
  const email = userData.email
    || userData.contact_details?.email
    || userData.contactDetails?.email;

  return {
    ...userData,
    user_type: userType,
    createdat: userData.createdat || now,
    updatedat: now,
    email: normalizeEmail(email)
  };
};

export const createAppUserRecord = async (userData, userType) => {
  if (!userData) {
    return { success: false, error: 'No user data provided' };
  }

  try {
    const dataToInsert = normalizeCreatePayload(userData, userType);

    if (!dataToInsert.email) {
      return { success: false, error: 'Email is required' };
    }

    const existingResult = await findAppUserByEmailRecord(dataToInsert.email);
    if (existingResult.success && existingResult.data) {
      return createEmailConflictResult(dataToInsert.email, existingResult.data);
    }

    if (isMssqlApiEnabled()) {
      try {
        const data = await requestMssqlApi('/api/mssql/app-users', {
          method: 'POST',
          body: dataToInsert
        });

        return { success: true, data: ensureValidTimestamps(data) };
      } catch (mssqlError) {
        if (isDuplicateEmailError(mssqlError)) {
          return createEmailConflictResult(dataToInsert.email);
        }

        if (!shouldFallbackToPlatformQuery(mssqlError)) {
          console.error('Error creating user via MSSQL:', mssqlError);
          return {
            success: false,
            error: mssqlError.message,
            ...(mssqlError.code ? { code: mssqlError.code } : {}),
            ...(mssqlError.status ? { status: mssqlError.status } : {})
          };
        }

        console.warn('MSSQL app-user create requires the central platform compatibility path; falling back:', mssqlError.message);
      }
    }

    const { data, error } = await platformClient
      .from('app_users')
      .insert(dataToInsert)
      .select('*')
      .single();

    if (error) {
      console.error('Error creating user:', error);
      if (isDuplicateEmailError(error)) {
        return createEmailConflictResult(dataToInsert.email);
      }
      return { success: false, error: error.message };
    }

    return { success: true, data: ensureValidTimestamps(data) };
  } catch (error) {
    console.error('Error in createAppUserRecord:', error);
    if (isDuplicateEmailError(error)) {
      const email = normalizeEmail(
        userData?.email || userData?.contact_details?.email || userData?.contactDetails?.email
      );
      return createEmailConflictResult(email);
    }
    return { success: false, error: error.message };
  }
};

export const linkAppUserRecord = async (authId, appUserId) => {
  try {
    if (isMssqlApiEnabled()) {
      try {
        const data = await requestMssqlApi(`/api/mssql/app-users/${appUserId}/link`, {
          method: 'POST',
          body: { authId }
        });

        return { success: true, data };
      } catch (mssqlError) {
        console.error(`Error linking app_user ${appUserId} via MSSQL, falling back to the local compatibility layer:`, mssqlError);
      }
    }

    const { data: existingUser, error: checkError } = await platformClient
      .from('app_users')
      .select('id, auth_id')
      .eq('id', appUserId)
      .single();

    if (checkError) {
      return {
        success: false,
        error: `Error checking app_user: ${checkError.message}`,
        debug: { checkError }
      };
    }

    if (!existingUser) {
      return {
        success: false,
        error: 'App user not found',
        debug: { appUserId }
      };
    }

    const { data, error } = await platformClient
      .from('app_users')
      .update({
        auth_id: authId,
        invited: true,
        updatedat: new Date().toISOString()
      })
      .eq('id', appUserId)
      .select();

    if (error) {
      return {
        success: false,
        error: `Error updating app_user: ${error.message}`,
        debug: { error }
      };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'No data returned after update',
        debug: { data }
      };
    }

    return { success: true, data: ensureValidTimestamps(data[0]) };
  } catch (error) {
    return {
      success: false,
      error: `Exception: ${error.message}`,
      debug: { error: error.toString(), stack: error.stack }
    };
  }
};

export const findAppUserByEmailRecord = async (email) => {
  try {
    if (isMssqlApiEnabled()) {
      try {
        const data = await requestMssqlApi(`/api/mssql/app-users/lookup?email=${encodeURIComponent(email)}`);
        return { success: true, data: data ? ensureValidTimestamps(data) : data };
      } catch (mssqlError) {
        console.error('Error finding user by email via MSSQL, falling back to the local compatibility layer:', mssqlError.message);
      }
    }

    const { data, error } = await platformClient
      .from('app_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return { success: true, data: data ? ensureValidTimestamps(data) : data };
  } catch (error) {
    console.error('Error finding user by email:', error.message);
    return { success: false, error: error.message };
  }
};

export const findAppUserByAuthIdRecord = async (authId) => {
  try {
    if (isMssqlApiEnabled()) {
      try {
        const data = await requestMssqlApi(`/api/mssql/app-users/lookup?authId=${encodeURIComponent(authId)}`);
        return { success: true, data: data ? ensureValidTimestamps(data) : data };
      } catch (mssqlError) {
        console.error('Error finding user by auth ID via MSSQL, falling back to the local compatibility layer:', mssqlError.message);
      }
    }

    const { data, error } = await platformClient
      .from('app_users')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return { success: true, data: data ? ensureValidTimestamps(data) : data };
  } catch (error) {
    console.error('Error finding user by auth ID:', error.message);
    return { success: false, error: error.message };
  }
};

export const checkAppUserInvitationStatusRecord = async (userId) => {
  try {
    if (isMssqlApiEnabled()) {
      try {
        const data = await requestMssqlApi(`/api/mssql/app-users/${userId}/invitation-status`);
        return { success: true, data };
      } catch (mssqlError) {
        console.error(`Error checking invitation status for ${userId} via MSSQL, falling back to the local compatibility layer:`, mssqlError.message);
      }
    }

    try {
      const { error: testError } = await platformClient
        .from('app_users')
        .select('id')
        .limit(1);

      if (testError) {
        throw new Error(`The app_users table might not exist: ${testError.message}`);
      }
    } catch (tableError) {
      throw new Error(`The app_users table might not exist: ${tableError.message}`);
    }

    const { data, error } = await platformClient
      .from('app_users')
      .select('id, email, invited, auth_id')
      .eq('id', userId)
      .single();

    if (error) {
      throw error;
    }

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
    console.error(`Error checking invitation status for ${userId}:`, error.message);
    return { success: false, error: error.message };
  }
};

export const updateAppUserRecord = async (id, userData) => {
  try {
    const dataToUpdate = {
      ...userData,
      updatedat: new Date().toISOString()
    };

    if (isMssqlApiEnabled()) {
      try {
        const data = await requestMssqlApi(`/api/mssql/app-users/${id}`, {
          method: 'PUT',
          body: dataToUpdate
        });

        return { success: true, data: ensureValidTimestamps(data) };
      } catch (mssqlError) {
        console.error('Error updating user via MSSQL, falling back to the local compatibility layer:', mssqlError);
      }
    }

    const { data, error } = await platformClient
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
    console.error('Error in updateAppUserRecord:', error);
    return { success: false, error: error.message };
  }
};

export const fetchAppUserRecord = async (id) => {
  try {
    if (isMssqlApiEnabled()) {
      try {
        const data = await requestMssqlApi(`/api/mssql/app-users/${id}`);
        if (!data) {
          throw new Error('User not found');
        }

        return ensureValidTimestamps(data);
      } catch (mssqlError) {
        console.error('Error fetching user via MSSQL, falling back to the local compatibility layer:', mssqlError);
      }
    }

    const { data, error } = await platformClient
      .from('app_users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('User not found');
    }

    return ensureValidTimestamps(data);
  } catch (error) {
    console.error('Error in fetchAppUserRecord:', error);
    throw error;
  }
};

export const fetchAppUsersRecord = async (userType, filters = {}) => {
  try {
    if (!hasRequestIdentity()) {
      return [];
    }

    if (isMssqlApiEnabled()) {
      try {
        const searchParams = new URLSearchParams();

        if (userType) {
          searchParams.set('userType', userType);
        }

        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.set(key, value);
          }
        });

        const data = await requestMssqlApi(`/api/mssql/app-users?${searchParams.toString()}`);
        return Array.isArray(data) ? data.map((record) => ensureValidTimestamps(record)) : [];
      } catch (mssqlError) {
        console.error('Error fetching users via MSSQL, falling back to the local compatibility layer:', mssqlError);
      }
    }

    let query = platformClient
      .from('app_users')
      .select('*');

    if (userType) {
      query = query.eq('user_type', userType);
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data ? data.map((record) => ensureValidTimestamps(record)) : [];
  } catch (error) {
    console.error('Error in fetchAppUsersRecord:', error);
    throw error;
  }
};

export const deleteAppUserRecord = async (id) => {
  try {
    if (isMssqlApiEnabled()) {
      try {
        const data = await requestMssqlApi(`/api/mssql/app-users/${id}`, {
          method: 'DELETE'
        });

        return { success: true, data };
      } catch (mssqlError) {
        console.error('Error deleting user via MSSQL, falling back to the local compatibility layer:', mssqlError);
      }
    }

    const { data, error } = await platformClient
      .from('app_users')
      .delete()
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in deleteAppUserRecord:', error);
    return { success: false, error: error.message };
  }
};
