import { useState, useEffect } from 'react';
import { checkInvitationStatus } from '../services/userService';
import { inviteRentee, inviteTeamMember } from '../services/userService';
import { toast } from 'react-toastify';

/**
 * Component for displaying and managing user invitation status
 * @param {Object} props - Component props
 * @param {string} props.id - ID of the rentee or team member
 * @param {string} props.type - Type of user ('rentee' or 'team_member')
 * @param {string} props.name - Name of the user
 * @param {string} props.email - Email of the user
 * @param {string} props.role - Role of the team member (only for team members)
 * @returns {JSX.Element} InvitationStatus component
 */
const InvitationStatus = ({ id, type, name, email, role = 'staff' }) => {
  const [loading, setLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [status, setStatus] = useState('unknown');
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!id || !type) return;

      try {
        setLoading(true);
        const { success, data, error } = await checkInvitationStatus(id, type);
        
        if (success && data) {
          setStatus(data.status);
        } else {
          setError(error || 'Failed to check invitation status');
          console.error('Error fetching invitation status:', error);
        }
      } catch (err) {
        setError(err.message);
        console.error('Error in fetchStatus:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [id, type]);

  const handleSendInvite = async () => {
    if (!email || !id) {
      toast.error('Email and ID are required to send an invitation');
      return;
    }

    try {
      setInviteLoading(true);
      setError(null);

      let result;
      if (type === 'rentee') {
        result = await inviteRentee(email, name, id);
      } else {
        result = await inviteTeamMember(email, name, role, id);
      }

      if (result.success) {
        setStatus('invited');
        toast.success(`Invitation sent to ${email}`);
      } else {
        setError(result.error || 'Failed to send invitation');
        toast.error(`Failed to send invitation: ${result.error}`);
      }
    } catch (err) {
      setError(err.message);
      toast.error(`Error sending invitation: ${err.message}`);
    } finally {
      setInviteLoading(false);
    }
  };

  const renderStatus = () => {
    switch (status) {
      case 'registered':
        return (
          <div className="flex items-center">
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
              Registered
            </span>
          </div>
        );
      case 'invited':
        return (
          <div className="flex items-center space-x-2">
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              Invited
            </span>
            <button
              onClick={handleSendInvite}
              disabled={inviteLoading}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              {inviteLoading ? 'Sending...' : 'Resend'}
            </button>
          </div>
        );
      case 'not_invited':
        return (
          <div className="flex items-center space-x-2">
            <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
              Not Invited
            </span>
            <button
              onClick={handleSendInvite}
              disabled={inviteLoading}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              {inviteLoading ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        );
      default:
        return (
          <div className="flex items-center">
            <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">
              {loading ? 'Checking...' : 'Unknown'}
            </span>
          </div>
        );
    }
  };

  return (
    <div className="invitation-status mt-2">
      <div className="text-sm text-gray-600 mb-1">Invitation Status:</div>
      {renderStatus()}
      {error && (
        <div className="text-sm text-red-600 mt-1">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default InvitationStatus; 