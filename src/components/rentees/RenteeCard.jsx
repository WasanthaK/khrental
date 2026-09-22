import { Link } from 'react-router-dom';
import { formatDate } from '../../utils/helpers';
import InvitationStatusBadge from '../common/InvitationStatusBadge';
import InviteUserButton from '../common/InviteUserButton';
import useInvitationStatus from '../../hooks/useInvitationStatus';

const RenteeCard = ({ rentee, onStatusChange }) => {
  if (!rentee || !rentee.id) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error: Invalid tenant data
      </div>
    );
  }

  const {
    id,
    name,
    contactDetails,
    idCopyURL,
    associatedPropertyIds,
    registrationDate
  } = rentee;

  const {
    status,
    details: invitationDetails,
    loading: statusLoading,
    error: statusError,
    refresh: refreshStatus
  } = useInvitationStatus(id);

  const handleInviteSuccess = async () => {
    try {
      await refreshStatus();
      if (onStatusChange && typeof onStatusChange === 'function') {
        onStatusChange();
      }
    } catch (_error) {
      // Error is already handled by the invitation-status hook.
    }
  };

  const invitationDateLabel = invitationDetails?.invitedAt
    ? `Invitation created: ${formatDate(invitationDetails.invitedAt)}`
    : null;
  const expiryDateLabel = invitationDetails?.expiresAt && ['pending', 'expired'].includes(status)
    ? `${status === 'expired' ? 'Expired' : 'Expires'}: ${formatDate(invitationDetails.expiresAt)}`
    : null;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4">
        <div className="flex items-center mb-4">
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-lg mr-3">
            {name ? name.charAt(0).toUpperCase() : 'T'}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{name || 'Unnamed Tenant'}</h3>
            <p className="text-sm text-gray-600">
              Registered: {formatDate(registrationDate) || 'N/A'}
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <p className="text-sm">
            <span className="text-gray-500">Email: </span>
            <span className="text-gray-900">{contactDetails?.email || 'N/A'}</span>
          </p>
          <p className="text-sm">
            <span className="text-gray-500">Phone: </span>
            <span className="text-gray-900">{contactDetails?.phone || 'N/A'}</span>
          </p>
          <p className="text-sm">
            <span className="text-gray-500">Properties: </span>
            <span className="text-gray-900">{associatedPropertyIds?.length || 0} assigned</span>
          </p>
        </div>

        <div className="flex justify-between items-center mb-3">
          <div className="flex flex-wrap items-center gap-2">
            {idCopyURL ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">ID Verified</span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">ID Pending</span>
            )}

            {statusError ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Status Error</span>
            ) : statusLoading ? null : (
              <InvitationStatusBadge status={status} />
            )}
          </div>
          <Link to={`/dashboard/rentees/${id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            View Details
          </Link>
        </div>

        {!statusLoading && !statusError && (invitationDateLabel || expiryDateLabel) && (
          <div className="mb-3 text-xs text-gray-600" role="status">
            {invitationDateLabel && <div>{invitationDateLabel}</div>}
            {expiryDateLabel && <div>{expiryDateLabel}</div>}
          </div>
        )}

        {(!statusLoading && status !== 'registered' && !statusError) && (
          <div className="mt-2">
            <InviteUserButton
              userId={id}
              invitationStatus={status}
              onSuccess={handleInviteSuccess}
              fullWidth={true}
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default RenteeCard;
