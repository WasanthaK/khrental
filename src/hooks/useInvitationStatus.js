import { useState, useEffect, useCallback } from 'react';
import { checkAppUserInvitationStatus } from '../services/appUserService';

const PENDING_REFRESH_INTERVAL_MS = 30000;

const useInvitationStatus = (userId) => {
  const [status, setStatus] = useState('loading');
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async ({ silent = false } = {}) => {
    if (!userId) {
      setStatus('unknown');
      setDetails(null);
      setLoading(false);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
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
      if (!silent) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const refreshIfVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        fetchStatus({ silent: true });
      }
    };

    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    const intervalId = status === 'pending'
      ? window.setInterval(refreshIfVisible, PENDING_REFRESH_INTERVAL_MS)
      : null;

    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [fetchStatus, status, userId]);

  return {
    status,
    details,
    loading,
    error,
    refresh: fetchStatus
  };
};

export default useInvitationStatus;
