import React, { useState, useEffect } from 'react';
import { checkUserAuthStatus } from '../../services/userManagement';

const InvitationStatusBadge = ({ userId, status: providedStatus, hideLabel = false }) => {
  const [status, setStatus] = useState(providedStatus || 'loading');
  const [loading, setLoading] = useState(!providedStatus);

  useEffect(() => {
    if (providedStatus) {
      setStatus(providedStatus);
      setLoading(false);
      return;
    }

    const checkStatus = async () => {
      if (!userId) {
        setStatus('unknown');
        setLoading(false);
        return;
      }

      try {
        const result = await checkUserAuthStatus(userId);
        setStatus(result.success ? (result.registered ? 'registered' : 'not_registered') : 'error');
      } catch (error) {
        console.error('Error in InvitationStatusBadge:', error);
        setStatus('error');
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [userId, providedStatus]);

  const statusStyles = {
    loading: 'bg-gray-100 text-gray-800',
    unknown: 'bg-gray-100 text-gray-800',
    not_registered: 'bg-yellow-100 text-yellow-800',
    not_invited: 'bg-gray-100 text-gray-800',
    invited: 'bg-blue-100 text-blue-800',
    pending: 'bg-blue-100 text-blue-800',
    expired: 'bg-amber-100 text-amber-800',
    revoked: 'bg-gray-100 text-gray-700',
    registered: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800'
  };

  const statusLabels = {
    loading: 'Loading...',
    unknown: 'Unknown',
    not_registered: 'Not Registered',
    not_invited: 'Not Invited',
    invited: 'Invitation Pending',
    pending: 'Invitation Pending',
    expired: 'Invitation Expired',
    revoked: 'Invitation Superseded',
    registered: 'Registered',
    error: 'Error'
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[status] || statusStyles.unknown}`}>
      {loading ? (
        <>
          <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse mr-1" />
          {!hideLabel && 'Checking...'}
        </>
      ) : (
        !hideLabel && statusLabels[status]
      )}
    </span>
  );
};

export default InvitationStatusBadge;
