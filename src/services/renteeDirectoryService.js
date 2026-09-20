import { requestMssqlApi } from './mssqlApiClient';
import { normalizeRenteeDirectoryRecords } from '../utils/renteeDirectory';

/**
 * The renter directory is always an organization-aware MSSQL projection.
 *
 * Do not fall back to the generic platform app_users query: that legacy query
 * scopes app_users by their default tenant pointer and cannot reliably represent
 * a global identity that belongs to this organization through tenant_memberships.
 */
export const fetchRenteeDirectory = async () => {
  const users = await requestMssqlApi('/api/mssql/rentees');
  return normalizeRenteeDirectoryRecords(users);
};
