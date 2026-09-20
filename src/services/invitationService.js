/**
 * Unified invitation service.
 *
 * Invitation authority is always created by the KH Rentals server. The browser
 * only requests a single-use invitation token and then delivers the resulting
 * setup link through the configured email service.
 */

import { sendDirectEmail } from './directEmailService';
import { getAppBaseUrl } from '../utils/env';
import { requestMssqlApi } from './mssqlApiClient';

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
        appUserId: userDetails.id || null,
        email: userDetails.email,
        role: userDetails.role
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
      appUserId: userDetails.id || null,
      email: userDetails.email,
      role: userDetails.role
    });

    const inviteData = await createSecureInvitation(userDetails);
    const token = inviteData?.invitation?.token;
    const expiresAt = inviteData?.invitation?.expiresAt;

    if (!token) {
      throw new Error('The server did not return a secure invitation token.');
    }

    const inviteLink = `${getAppBaseUrl()}/accept-invite?token=${encodeURIComponent(token)}`;

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
      )
    });

    if (!emailResult?.success) {
      return {
        success: false,
        emailSent: false,
        error: 'A secure invitation was created, but the invitation email could not be sent.',
        debug: { emailError: emailResult?.error || emailResult?.message || null }
      };
    }

    logInvitationDebug(requestId, 'Invitation email accepted for delivery', {
      email: userDetails.email,
      provider: emailResult.provider || null,
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
    logInvitationDebug(requestId, 'Secure invitation failed', { error: error.message });
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
    console.error('[InvitationService] Error resending invitation:', error);
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
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    const statusData = await requestMssqlApi(
      `/api/mssql/app-users/${encodeURIComponent(userId)}/invitation-status`
    );

    if (!statusData) {
      return { success: false, error: 'User not found' };
    }

    return {
      success: true,
      status: statusData.status || (statusData.auth_id ? 'registered' : statusData.invited ? 'invited' : 'not_invited'),
      hasAuthId: Boolean(statusData.auth_id)
    };
  } catch (error) {
    console.error('[InvitationService] Error checking invitation status:', error);
    return {
      success: false,
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.status ? { status: error.status } : {})
    };
  }
};

function getInvitationEmailTemplate(name, inviteLink, role, expiresAt = null) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const userTypeLabel = normalizedRole === 'rentee' || normalizedRole === 'tenant' ? 'Tenant' : 'Team Member';
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
        <a clicktracking=off href="${inviteLink}" style="background-color: #4a90e2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
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
