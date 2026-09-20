import { platform as platformClient } from './platformClient';
import { isMssqlApiEnabled, requestMssqlApi } from './mssqlApiClient';
import { normalizeRenteeDirectoryRecords } from '../utils/renteeDirectory';

export const fetchRenteeDirectory = async () => {
  if (isMssqlApiEnabled()) {
    try {
      // The canonical renter endpoint resolves both legacy tenant ownership and
      // active renter memberships for the current organization.
      const users = await requestMssqlApi('/api/mssql/rentees');
      return normalizeRenteeDirectoryRecords(users);
    } catch (error) {
      console.error('Error fetching tenant directory via MSSQL:', error);
      throw error;
    }
  }

  const { data, error } = await platformClient
    .from('app_users')
    .select('*');

  if (error) throw error;
  return normalizeRenteeDirectoryRecords(data || []);
};
