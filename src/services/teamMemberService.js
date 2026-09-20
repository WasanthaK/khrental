import { requestMssqlApi } from './mssqlApiClient';

export const fetchTeamDirectory = async (search = '') => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const query = params.toString();
  const data = await requestMssqlApi(`/api/mssql/team-members${query ? `?${query}` : ''}`);
  return Array.isArray(data) ? data : [];
};

export const fetchTeamMember = async (id) => requestMssqlApi(`/api/mssql/team-members/${id}`);

export const createTeamMember = async (payload) => requestMssqlApi('/api/mssql/team-members', {
  method: 'POST',
  body: payload
});

export const updateTeamMember = async (id, payload) => requestMssqlApi(`/api/mssql/team-members/${id}`, {
  method: 'PUT',
  body: payload
});
