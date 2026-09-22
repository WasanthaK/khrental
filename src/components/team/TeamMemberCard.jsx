import React from 'react';
import { Link } from 'react-router-dom';
import InvitationStatusBadge from '../common/InvitationStatusBadge';
import InviteUserButton from '../common/InviteUserButton';
import useInvitationStatus from '../../hooks/useInvitationStatus';
import { formatDate } from '../../utils/helpers';

const TeamMemberCard = ({ member, onStatusChange }) => {
  if (!member || !member.id) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error: Invalid team member data
      </div>
    );
  }

  const { id, name, role, contactDetails = {}, assignedTasks = [], active } = member;
  const invitationStatus = useInvitationStatus(id);
  const status = invitationStatus.status;
  const statusLoading = invitationStatus.loading;
  const statusError = invitationStatus.error;
  const refreshStatus = invitationStatus.refresh;
  const invitationDetails = invitationStatus.details;

  const handleInviteSuccess = async () => {
    await refreshStatus();

    if (onStatusChange && typeof onStatusChange === 'function') {
      onStatusChange();
    }
  };

  const invitationDateLabel = invitationDetails?.invitedAt
    ? `Invitation created: ${formatDate(invitationDetails.invitedAt)}`
    : null;
  const expiryDateLabel = invitationDetails?.expiresAt && ['pending', 'expired'].includes(status)
    ? `${status === 'expired' ? 'Expired' : 'Expires'}: ${formatDate(invitationDetails.expiresAt)}`
    : null;

  const getRoleBadgeColor = () => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'bg-purple-100 text-purple-800';
      case 'staff':
        return 'bg-blue-100 text-blue-800';
      case 'maintenance':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{name || 'Unnamed Member'}</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor()}`}>
                {role || 'Staff'}
              </span>
              {active !== undefined && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {active ? 'Active' : 'Inactive'}
                </span>
              )}
              {statusError ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  Status Error
                </span>
              ) : !statusLoading ? (
                <InvitationStatusBadge status={status} />
              ) : null}
            </div>
          </div>
          <Link
            to={`/dashboard/team/${id}`}
            className="text-blue-600 hover:text-blue-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </Link>
        </div>

        <div className="space-y-3">
          {contactDetails.email && (
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 mr-2 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              <span className="text-gray-600">{contactDetails.email}</span>
            </div>
          )}

          {contactDetails.phone && (
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 mr-2 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              <span className="text-gray-600">{contactDetails.phone}</span>
            </div>
          )}

          {!contactDetails.email && !contactDetails.phone && (
            <div className="text-sm text-gray-500">No contact information available</div>
          )}
        </div>

        {!statusLoading && !statusError && (invitationDateLabel || expiryDateLabel) && (
          <div className="mt-3 text-xs text-gray-600" role="status">
            {invitationDateLabel && <div>{invitationDateLabel}</div>}
            {expiryDateLabel && <div>{expiryDateLabel}</div>}
          </div>
        )}

        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Assigned Tasks</h4>
          {assignedTasks.length > 0 ? (
            <div className="text-sm text-gray-600">
              <span className="font-medium">{assignedTasks.length}</span> tasks assigned
            </div>
          ) : (
            <div className="text-sm text-gray-500">No tasks currently assigned</div>
          )}
        </div>

        {(!statusLoading && status !== 'registered' && !statusError) && (
          <div className="mt-4">
            <InviteUserButton
              userId={id}
              invitationStatus={status}
              onSuccess={handleInviteSuccess}
              fullWidth={true}
            />
          </div>
        )}

        {(statusLoading || status === 'registered' || statusError) && (
          <div className="mt-4">
            <Link
              to={`/dashboard/team/${id}`}
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
            >
              View Profile
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamMemberCard;
