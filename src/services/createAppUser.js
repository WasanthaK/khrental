import { createAppUserRecord } from './appUserRepository';
import { requestMssqlApi } from './mssqlApiClient';

/**
 * Create a new app user (staff or rentee) without sending welcome emails.
 *
 * Rentee creation is always organization-aware. It must never fall back to the
 * generic app_users insert contract because app_users.email is globally unique
 * while renter access belongs to tenant_memberships. The canonical endpoint can
 * therefore create a new global identity or attach an existing one to the
 * active organization without producing a misleading duplicate-email error.
 *
 * @param {Object} userData - User data
 * @param {string} userType - 'staff' or 'rentee'
 * @returns {Promise<Object>} - Result of the creation
 */
export const createAppUser = async (userData, userType) => {
  if (String(userType || '').trim().toLowerCase() === 'rentee') {
    try {
      const data = await requestMssqlApi('/api/mssql/rentees', {
        method: 'POST',
        body: userData
      });
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.status ? { status: error.status } : {})
      };
    }
  }

  return createAppUserRecord(userData, userType);
};
