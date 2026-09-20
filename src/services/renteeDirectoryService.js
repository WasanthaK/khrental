import { platform as platformClient } from './platformClient';
import { isMssqlApiEnabled, requestMssqlApi } from './mssqlApiClient';
import { normalizeRenteeDirectoryRecords } from '../utils/renteeDirectory';

export const fetchRenteeDirectory = async () => {
  if (isMssqlApiEnabled()) {
    try {
      // Ask the server for the active tenant-scoped directory first. We filter
      // locally so older rows with role='rentee' but an inconsistent user_type
      // do not disappear from the Tenants screen.
      const users = await requestMssqlApi('/api/mssql/app-users');
      return normalizeRenteeDirectoryRecords(users);
    } catch (error) {
      console.error('Error fetching tenant directory via MSSQL:', error);
    }
  }

  const { data, error } = await platformClient
    .from('app_users')
    .select('*');

  if (error) throw error;
  return normalizeRenteeDirectoryRecords(data || []);
};
