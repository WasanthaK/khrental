import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { checkUserAuthStatus } from '../services/userManagement';

/**
 * Hook to check a user's invitation/registration status
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
      
      // Use the userManagement service to check status
      const result = await checkUserAuthStatus(userId);
      console.log(`Status check result for ${userId}:`, result);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to check auth status');
      }
      
      // Map the result to the expected status values
      if (result.registered) {
        setStatus('registered');
      } else {
        // Check if the user is invited but not registered
        const { data: userData } = await supabase
          .from('app_users')
          .select('invited')
          .eq('id', userId)
          .single();
          
        if (userData?.invited) {
          setStatus('invited');
        } else {
          setStatus('not_invited');
        }
      }
      
      console.log(`Set status for ${userId} to:`, status);
    } catch (err) {
      console.error(`Error checking invitation status for ${userId}:`, err);
      setError(err.message);
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