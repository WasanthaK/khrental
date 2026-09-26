import { requestMssqlApi } from './mssqlApiClient';
import { inviteUser } from './invitationService';

export const getRentee = async (id) => {
  if (!id) throw new Error('Renter ID is required.');
  return requestMssqlApi(`/api/mssql/rentees/${encodeURIComponent(id)}`);
};

export const createRentee = async (payload) => {
  const result = await requestMssqlApi('/api/mssql/rentees', {
    method: 'POST',
    body: payload
  });

  return result?.data || result;
};

export const updateRentee = async (id, payload) => {
  if (!id) throw new Error('Renter ID is required.');
  return requestMssqlApi(`/api/mssql/rentees/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: payload
  });
};

export const setRenteeMembershipStatus = async (id, status) => {
  if (!id) throw new Error('Renter ID is required.');
  if (!['active', 'inactive'].includes(String(status || '').toLowerCase())) {
    throw new Error('Renter status must be active or inactive.');
  }

  return requestMssqlApi(`/api/mssql/rentees/${encodeURIComponent(id)}/membership-status`, {
    method: 'PATCH',
    body: { status: String(status).toLowerCase() }
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

  const result = await inviteUser({ id, email, name, role: 'rentee' }, false);
  if (!result?.success) {
    throw new Error(result?.error || 'The invitation could not be sent.');
  }

  return result;
};

export default {
  getRentee,
  createRentee,
  updateRentee,
  setRenteeMembershipStatus,
  getRenteesByProperty,
  getRenteesByUnit,
  getRenteePropertyAgreements,
  sendRenteeInvitation
};
