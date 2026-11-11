/**
 * Unified invitation service.
 *
 * Invitation authority is always created by the KH Rentals server. The browser
 * requests recipient-bound delivery and never receives the setup capability.
 */

import { checkCanonicalInvitationStatus } from './invitationStatusService';
import { requestMssqlApi } from './mssqlApiClient';

const INVITATION_LOG_FIELDS = new Set([
  'appUserId',
  'expiresAt',
  'provider',
  'providerMessageId',
  'providerStatus',
  'errorCode',
  'status'
]);

const sanitizeInvitationLogData = (data = {}) => Object.fromEntries(
  Object.entries(data).filter(([key, value]) => INVITATION_LOG_FIELDS.has(key) && value !== undefined)
);

const logInvitationDebug = (requestId, message, data = {}) => {
  const safeData = sanitizeInvitationLogData(data);
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}][${requestId}][InvitationService] ${message}`;

  console.log(logMsg, safeData);

  if (typeof window !== 'undefined' && window.appInsights?.trackTrace) {
    window.appInsights.trackTrace({ message: logMsg, properties: safeData });
  }
};

const createSecureInvitation = async (userDetails) => requestMssqlApi('/api/platform/auth/invite', {
  method: 'POST',
  body: {
    email: userDetails.email,
    options: {
      data: userDetails.id ? { app_user_id: userDetails.id } : {}
    }
  }
});

/**
 * Send a secure invitation to an existing organization user.
 */
export const inviteUser = async (userDetails, simulated = false) => {
  const requestId = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    if (!userDetails?.email) {
      return {
        success: false,
        emailSent: false,
        error: 'Missing required field: email is required'
      };
    }

    // Simulation must be side-effect free. In particular it must not create a
    // new one-time token (which would invalidate an earlier real invitation)
    // and it must never call the email delivery endpoint.
    if (simulated) {
      logInvitationDebug(requestId, 'Invitation simulation completed without delivery', {
        appUserId: userDetails.id || null
      });
      return {
        success: true,
        emailSent: false,
        simulated: true,
        message: 'Invitation simulated. No email was sent.',
        method: 'simulation'
      };
    }

    logInvitationDebug(requestId, 'Creating secure invitation', {
      appUserId: userDetails.id || null
    });

    const inviteData = await createSecureInvitation(userDetails);
    const expiresAt = inviteData?.invitation?.expiresAt;
    const emailResult = inviteData?.delivery;
    if (emailResult?.accepted !== true) {
      throw new Error('Invitation email delivery could not be confirmed. Please try again.');
    }

    logInvitationDebug(requestId, 'Invitation email accepted for delivery', {
      provider: emailResult.provider || null,
      providerStatus: emailResult.providerStatus || null,
      providerMessageId: emailResult.providerMessageId || null
    });

    return {
      success: true,
      emailSent: true,
      simulated: false,
      message: 'Invitation email accepted for delivery',
      method: 'secure_direct_email',
      expiresAt: expiresAt || null,
      provider: emailResult.provider || null,
      providerMessageId: emailResult.providerMessageId || null
    };
  } catch (error) {
    logInvitationDebug(requestId, 'Secure invitation failed', {
      errorCode: error.code || null,
      status: error.status || null
    });
    return {
      success: false,
      emailSent: false,
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.status ? { status: error.status } : {})
    };
  }
};

export const resendInvitation = async (userId, simulated = false) => {
  try {
    if (!userId) {
      return { success: false, emailSent: false, error: 'User ID is required' };
    }

    const userData = await requestMssqlApi(`/api/mssql/app-users/${encodeURIComponent(userId)}`);
    if (!userData) {
      return { success: false, emailSent: false, error: 'User not found' };
    }

    return inviteUser({
      id: userData.id,
      email: userData.email,
      name: userData.name,
      role: userData.directory_role || userData.role || userData.user_type
    }, simulated);
  } catch (error) {
    return {
      success: false,
      emailSent: false,
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.status ? { status: error.status } : {})
    };
  }
};

/**
 * Compatibility result contract retained for existing Team and renter UI.
 * The server-side invitation ledger remains authoritative for token validity.
 */
export const checkInvitationStatus = async (userId) => {
  const result = await checkCanonicalInvitationStatus(userId);
  if (!result.success) {
    return result;
  }

  const statusData = result.data || {};
  return {
    success: true,
    status: statusData.status || (statusData.auth_id ? 'registered' : statusData.invited ? 'invited' : 'not_invited'),
    hasAuthId: Boolean(statusData.auth_id)
  };
};
