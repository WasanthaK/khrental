import { useState, useEffect, useCallback } from 'react';
import { checkAppUserInvitationStatus } from '../services/appUserService';

const useInvitationStatus = (userId, skipCheck = false) => {
  const [status, setStatus] = useState('loading');
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(!skipCheck);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setStatus('unknown');
      setDetails(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await checkAppUserInvitationStatus(userId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to check invitation status');
      }

      const invitation = result.data || {};
      setDetails(invitation);
      setStatus(invitation.status || (invitation.auth_id ? 'registered' : 'not_invited'));
    } catch (err) {
      console.error(`Error checking invitation status for ${userId}:`, err);
      setError(err.message);
      setStatus('error');
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!skipCheck) {
      fetchStatus();
    } else {
      setLoading(false);
      setStatus('unknown');
      setDetails(null);
    }
  }, [fetchStatus, skipCheck]);

  return {
    status,
    details,
    loading,
    error,
    refresh: fetchStatus
  };
};

export default useInvitationStatus;
