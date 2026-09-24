import React from 'react';

const InvitationStatusBadge = ({ status = 'unknown', hideLabel = false }) => {
  const statusStyles = {
    loading: 'bg-gray-100 text-gray-800',
    unknown: 'bg-gray-100 text-gray-800',
    not_registered: 'bg-yellow-100 text-yellow-800',
    not_invited: 'bg-gray-100 text-gray-800',
    invited: 'bg-blue-100 text-blue-800',
    pending: 'bg-blue-100 text-blue-800',
    expired: 'bg-amber-100 text-amber-800',
    revoked: 'bg-gray-100 text-gray-700',
    setup_incomplete: 'bg-red-100 text-red-800',
    registered: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800'
  };

  const statusLabels = {
    loading: 'Checking...',
    unknown: 'Unknown',
    not_registered: 'Not Registered',
    not_invited: 'Not Invited',
    invited: 'Invitation Pending',
    pending: 'Invitation Pending',
    expired: 'Invitation Expired',
    revoked: 'Invitation Superseded',
    setup_incomplete: 'Setup Incomplete',
    registered: 'Registered',
    error: 'Error'
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[status] || statusStyles.unknown}`}>
      {!hideLabel && statusLabels[status]}
    </span>
  );
};

export default InvitationStatusBadge;
