/**
 * Unified invitation service.
 *
 * Stage 3A invitations are created by the server. The browser never generates
 * invitation authority from app-user IDs, email addresses, or base64 payloads.
 */

import { platform as platformClient } from './platformClient';
import { sendDirectEmail } from './directEmailService';
import { getAppBaseUrl } from '../utils/env';
import { isMssqlApiEnabled, requestMssqlApi } from './mssqlApiClient';

const loadAppUserService = () => import('./appUserService');

const logInvitationDebug = (requestId, message, data = {}) => {
  const safeData = { ...data };
  delete safeData.token;
  delete safeData.inviteLink;
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}][${requestId}][InvitationService] ${message}`;

  console.log(logMsg, safeData);

  if (typeof window !== 'undefined' && window.appInsights?.trackTrace) {
    window.appInsights.trackTrace({ message: logMsg, properties: safeData });
  }
};

/**
 * Send a secure invitation to an existing app-user record.
 *
 * The authenticated admin endpoint resolves the target by the active tenant,
 * revokes older unaccepted invitations, persists only a token hash, and returns
 * the raw token once so it can be delivered to the recipient.
 */
export const inviteUser = async (userDetails, simulated = false) => {
  const requestId = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    if (!userDetails?.email || !userDetails?.id) {
      return {
        success: false,
        error: 'Missing required fields: email and id are required'
      };
    }

    logInvitationDebug(requestId, 'Creating secure invitation', {
      appUserId: userDetails.id,
      email: userDetails.email,
      role: userDetails.role
    });

    const { data: inviteData, error: inviteError } = await platformClient.auth.admin.inviteUserByEmail(
      userDetails.email,
      {
        data: {
          app_user_id: userDetails.id
        }
      }
    );

    if (inviteError) {
      throw inviteError;
    }

    const token = inviteData?.invitation?.token;
    const expiresAt = inviteData?.invitation?.expiresAt;
    if (!token) {
      throw new Error('The server did not return a secure invitation token.');
    }

    const baseUrl = getAppBaseUrl();
    const inviteLink = `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;

    logInvitationDebug(requestId, 'Secure invitation created; delivering email', {
      email: userDetails.email,
      expiresAt: expiresAt || null
    });

    const emailResult = await sendDirectEmail({
      to: userDetails.email,
      subject: 'Your Invitation to KH Rentals',
      html: getInvitationEmailTemplate(
        userDetails.name || inviteData?.user?.name,
        inviteLink,
        inviteData?.user?.role || userDetails.role,
        expiresAt
      ),
      simulated
    });

    if (!emailResult.success) {
      return {
        success: false,
        error: 'A secure invitation was created, but the invitation email could not be sent.',
        debug: { emailError: emailResult?.error || null }
      };
    }

    return {
      success: true,
      simulated: Boolean(emailResult.simulated || simulated),
      message: emailResult.simulated ? 'Invitation email was simulated' : 'Invitation sent successfully',
      method: 'secure_direct_email',
      expiresAt: expiresAt || null
    };
  } catch (error) {
    logInvitationDebug(requestId, 'Secure invitation failed', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
};

export const resendInvitation = async (userId, simulated = false) => {
  try {
    let userData = null;

    if (isMssqlApiEnabled()) {
      try {
        userData = await requestMssqlApi(`/api/mssql/app-users/${userId}`);
      } catch (mssqlError) {
        console.error('[InvitationService] Failed to load invite target via MSSQL; trying platform API:', mssqlError);
      }
    }

    if (!userData) {
      const { fetchAppUser } = await loadAppUserService();
      userData = await fetchAppUser(userId);
    }

    if (!userData) {
      return { success: false, error: 'User not found' };
    }

    return inviteUser({
      id: userData.id,
      email: userData.email,
      name: userData.name,
      role: userData.role || userData.user_type
    }, simulated);
  } catch (error) {
    console.error('[InvitationService] Error resending invitation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Legacy status adapter retained for existing Team UI.
 * A linked auth_id means registered; otherwise invited=true means an invitation
 * has been issued. The invitation ledger is authoritative for token validity.
 */
export const checkInvitationStatus = async (userId) => {
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    if (isMssqlApiEnabled()) {
      try {
        const statusData = await requestMssqlApi(`/api/mssql/app-users/${userId}/invitation-status`);
        return {
          success: true,
          status: statusData.status,
          hasAuthId: Boolean(statusData.auth_id)
        };
      } catch (mssqlError) {
        console.error('[InvitationService] Failed to load invitation status via MSSQL; trying platform API:', mssqlError);
      }
    }

    const { checkAppUserInvitationStatus } = await loadAppUserService();
    const statusResult = await checkAppUserInvitationStatus(userId);
    if (!statusResult.success) {
      throw new Error(statusResult.error);
    }

    const userData = statusResult.data;
    if (!userData) {
      return { success: false, error: 'User not found' };
    }

    let status = 'not_invited';
    if (userData.auth_id) {
      status = 'registered';
    } else if (userData.invited) {
      status = 'invited';
    }

    return {
      success: true,
      status,
      hasAuthId: Boolean(userData.auth_id)
    };
  } catch (error) {
    console.error('[InvitationService] Error checking invitation status:', error);
    return { success: false, error: error.message };
  }
};

function getInvitationEmailTemplate(name, inviteLink, role, expiresAt = null) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const userTypeLabel = normalizedRole === 'rentee' ? 'Rentee' : 'Team Member';
  const expiryText = expiresAt
    ? `This invitation link expires on ${new Date(expiresAt).toLocaleString()}.`
    : 'This invitation link expires after 24 hours.';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #4a90e2;">Welcome to KH Rentals</h1>
      </div>
      <p>Hello ${name || 'there'},</p>
      <p>You have been invited to join KH Rentals as a ${userTypeLabel}. Please use the secure link below to set up your account.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteLink}" style="background-color: #4a90e2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
          Set Up Your Account
        </a>
      </div>
      <p>If the button does not work, copy and paste the link from this email into your browser.</p>
      <p>${expiryText}</p>
      <p>For security, the link can be used only once. If a new invitation is sent, earlier links stop working.</p>
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #777; font-size: 12px;">
        <p>If you did not expect this invitation, you can safely ignore this email.</p>
        <p>© ${new Date().getFullYear()} KH Rentals. All rights reserved.</p>
      </div>
    </div>
  `;
}
