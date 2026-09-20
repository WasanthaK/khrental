import { requestMssqlApi } from './mssqlApiClient';
import { sendDirectEmail } from './directEmailService';
import { getAppBaseUrl } from '../utils/env';

export const getRentee = async (id) => {
  if (!id) throw new Error('Renter ID is required.');
  return requestMssqlApi(`/api/mssql/rentees/${encodeURIComponent(id)}`);
};

export const createRentee = async (payload) => {
  const result = await requestMssqlApi('/api/mssql/rentees', {
    method: 'POST',
    body: payload
  });

  // The canonical create endpoint returns create/attach metadata around the
  // actual renter record. Keep the browser service contract consistent with
  // getRentee/updateRentee by returning the renter itself to form callers.
  return result?.data || result;
};

export const updateRentee = async (id, payload) => {
  if (!id) throw new Error('Renter ID is required.');
  return requestMssqlApi(`/api/mssql/rentees/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: payload
  });
};

export const getRenteesByProperty = async (propertyId) => {
  if (!propertyId) {
    return { data: null, error: new Error('Property ID is required') };
  }

  try {
    const data = await requestMssqlApi('/api/platform/rpc/get_rentees_by_property', {
      method: 'POST',
      body: { property_id: propertyId }
    });
    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const getRenteesByUnit = async (unitId) => {
  if (!unitId) {
    return { data: null, error: new Error('Unit ID is required') };
  }

  try {
    const data = await requestMssqlApi('/api/platform/rpc/get_rentees_by_unit', {
      method: 'POST',
      body: { unit_id: unitId }
    });
    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const getRenteePropertyAgreements = async (renteeId, propertyId, unitId = null) => {
  if (!renteeId || !propertyId) {
    return { data: null, error: new Error('Both renter ID and property ID are required') };
  }

  try {
    const params = new URLSearchParams({
      renteeId: String(renteeId),
      propertyId: String(propertyId),
      pageSize: '500'
    });
    const data = await requestMssqlApi(`/api/mssql/agreements?${params.toString()}`);
    const agreements = Array.isArray(data) ? data : [];
    return {
      data: unitId ? agreements.filter((agreement) => String(agreement.unitid || '') === String(unitId)) : agreements,
      error: null
    };
  } catch (error) {
    return { data: null, error };
  }
};

export const sendRenteeInvitation = async ({ id, email, name }) => {
  if (!id || !email) {
    throw new Error('Renter ID and email are required to send an invitation.');
  }

  const invitationData = await requestMssqlApi('/api/platform/auth/invite', {
    method: 'POST',
    body: {
      email,
      options: {
        data: { app_user_id: id }
      }
    }
  });

  const token = invitationData?.invitation?.token;
  if (!token) {
    throw new Error('The server did not return a secure invitation token.');
  }

  const expiresAt = invitationData?.invitation?.expiresAt;
  const inviteLink = `${getAppBaseUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
  const displayName = name || invitationData?.user?.name || 'there';

  const emailResult = await sendDirectEmail({
    to: email,
    subject: 'Your Invitation to KH Rentals',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937">
        <h1 style="font-size:24px">Welcome to KH Rentals</h1>
        <p>Hello ${displayName},</p>
        <p>You have been invited to access your tenant portal.</p>
        <p style="margin:28px 0"><a href="${inviteLink}" style="background:#2563eb;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px">Set up your account</a></p>
        <p>${expiresAt ? `This link expires on ${new Date(expiresAt).toLocaleString()}.` : 'This invitation expires after 24 hours.'}</p>
        <p>For security, the link can be used only once.</p>
      </div>
    `,
    simulated: false
  });

  if (!emailResult?.success) {
    throw new Error(emailResult?.error || 'The invitation was created but the email could not be sent.');
  }

  return {
    success: true,
    emailSent: !emailResult.simulated,
    expiresAt: expiresAt || null
  };
};

export default {
  getRentee,
  createRentee,
  updateRentee,
  getRenteesByProperty,
  getRenteesByUnit,
  getRenteePropertyAgreements,
  sendRenteeInvitation
};
