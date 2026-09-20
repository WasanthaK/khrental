import { requestMssqlApi } from './mssqlApiClient';
import { sendDirectEmail } from './directEmailService';
import { getAppBaseUrl } from '../utils/env';

const toQueryString = (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

export const getPlatformAdminStatus = async () => requestMssqlApi('/api/mssql/platform-admin/status');

export const listAdminTenants = async (params = {}) => requestMssqlApi(`/api/mssql/admin/tenants${toQueryString(params)}`);

export const createAdminTenant = async (payload) => requestMssqlApi('/api/mssql/admin/tenants', {
  method: 'POST',
  body: payload
});

export const updateAdminTenant = async (tenantId, payload) => requestMssqlApi(`/api/mssql/admin/tenants/${tenantId}`, {
  method: 'PUT',
  body: payload
});

export const listTenantAdministrators = async (tenantId) => requestMssqlApi(`/api/mssql/admin/tenants/${tenantId}/administrators`);

export const createOrAttachTenantAdministrator = async (tenantId, payload) => requestMssqlApi(`/api/mssql/admin/tenants/${tenantId}/administrators`, {
  method: 'POST',
  body: payload
});

export const removeTenantAdministrator = async (tenantId, membershipId) => requestMssqlApi(`/api/mssql/admin/tenants/${tenantId}/memberships/${membershipId}`, {
  method: 'DELETE'
});

export const inviteTenantAdministrator = async (tenantId, appUserId, user = {}) => {
  const payload = await requestMssqlApi(`/api/mssql/admin/tenants/${tenantId}/administrators/${appUserId}/invitations`, {
    method: 'POST',
    body: {}
  });

  const token = payload?.invitation?.token;
  if (!token) {
    throw new Error('The server did not return a secure invitation token.');
  }

  const email = payload?.user?.email || user.email;
  if (!email) {
    throw new Error('Tenant administrator email is missing.');
  }

  const inviteLink = `${getAppBaseUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
  const expiresAt = payload?.invitation?.expiresAt;
  const displayName = payload?.user?.name || user.name || 'there';

  const emailResult = await sendDirectEmail({
    to: email,
    subject: 'Your KH Rentals administrator invitation',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937">
        <h1 style="font-size:24px">KH Rentals administrator access</h1>
        <p>Hello ${displayName},</p>
        <p>You have been appointed as a tenant administrator. Use the secure link below to set up your account.</p>
        <p style="margin:28px 0"><a href="${inviteLink}" style="background:#2563eb;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px">Set up administrator account</a></p>
        <p>${expiresAt ? `This link expires on ${new Date(expiresAt).toLocaleString()}.` : 'This invitation expires after 24 hours.'}</p>
      </div>
    `,
    simulated: false
  });

  if (!emailResult?.success) {
    throw new Error(emailResult?.error || emailResult?.message || 'Invitation email could not be sent.');
  }

  return {
    ...payload,
    emailSent: !emailResult.simulated
  };
};