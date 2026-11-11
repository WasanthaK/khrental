import { requestMssqlApi } from './mssqlApiClient';

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

export const inviteTenantAdministrator = async (tenantId, appUserId) => {
  const payload = await requestMssqlApi(`/api/mssql/admin/tenants/${tenantId}/administrators/${appUserId}/invitations`, {
    method: 'POST',
    body: {}
  });

  if (payload?.delivery?.accepted !== true) {
    throw new Error('Invitation email delivery could not be confirmed. Please try again.');
  }
  return {...payload,emailSent:true};
};
