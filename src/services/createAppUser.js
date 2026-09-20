import { createAppUserRecord } from './appUserRepository';
import { isMssqlApiEnabled, requestMssqlApi } from './mssqlApiClient';

/**
 * Create a new app user (staff or rentee) without sending welcome emails.
 * Rentee creation uses the canonical organization-aware endpoint so an existing
 * global identity can be attached to the active organization instead of failing
 * on the global email uniqueness constraint.
 *
 * @param {Object} userData - User data
 * @param {string} userType - 'staff' or 'rentee'
 * @returns {Promise<Object>} - Result of the creation
 */
export const createAppUser = async (userData, userType) => {
  if (String(userType || '').trim().toLowerCase() === 'rentee' && isMssqlApiEnabled()) {
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
