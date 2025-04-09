import { useState, useEffect, useCallback } from 'react';
import { checkAppUserInvitationStatus } from '../services/appUserService';

/**
 * Hook to fetch and manage invitation status for a user
 * @param {string} userId - ID of the user to check
 * @param {boolean} skipCheck - Whether to skip the automatic status check
 * @returns {Object} - Status information and refresh function
 */
const useInvitationStatus = (userId, skipCheck = false) => {
  const [status, setStatus] = useState('loading');
  const [loading, setLoading] = useState(!skipCheck);
  const [error, setError] = useState(null);
  
  console.log('useInvitationStatus hook initialized with userId:', userId);
  
  // Function to fetch status
  const fetchStatus = useCallback(async () => {
    if (!userId) {
      console.log('No userId provided, setting status to unknown');
      setStatus('unknown');
      setLoading(false);
      return;
    }
    
    try {
      console.log(`Fetching invitation status for user ${userId}...`);
      setLoading(true);
      setError(null);
      
      const result = await checkAppUserInvitationStatus(userId);
      console.log(`Status check result for ${userId}:`, result);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to check invitation status');
      }
      
      setStatus(result.data.status);
      console.log(`Set status for ${userId} to:`, result.data.status);
    } catch (err) {
      console.error(`Error checking invitation status for ${userId}:`, err);
      
      // Check if the error is related to the app_users table not existing
      if (err.message && (
        err.message.includes('app_users') || 
        err.message.includes('relation') || 
        err.message.includes('does not exist')
      )) {
        setError(`The app_users table does not exist. Please run the migration first: ${err.message}`);
      } else {
        setError(err.message);
      }
      
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }, [userId]);
  
  // Fetch status on mount and when userId changes, unless skipCheck is true
  useEffect(() => {
    if (!skipCheck) {
      console.log(`useEffect triggered for userId: ${userId}`);
      fetchStatus();
    } else {
      setLoading(false);
      setStatus('unknown');
    }
  }, [fetchStatus, skipCheck]);
  
  // Return status and refresh function
  return {
    status,
    loading,
    error,
    refresh: fetchStatus
  };
};

export default useInvitationStatus; 