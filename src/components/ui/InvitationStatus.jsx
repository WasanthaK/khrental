import React, { useState, useEffect } from 'react';
import { inviteAppUser, checkAppUserInvitationStatus } from '../../services/appUserService';
import { toast } from 'react-toastify';

/**
 * Component to display and manage the invitation status of users
 * @param {Object} props - Component props
 * @param {string} props.userId - ID of the user in app_users table
 * @param {Function} props.onStatusChange - Callback when status changes
 * @param {boolean} props.compact - Whether to show a compact version (for cards)
 */
const InvitationStatus = ({ userId, onStatusChange, compact = false }) => {
  const [status, setStatus] = useState('loading');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch the current invitation status
  const fetchStatus = async () => {
    if (!userId) return;
    
    try {
      const result = await checkAppUserInvitationStatus(userId);
      
      if (result.success) {
        setStatus(result.data.status);
        if (onStatusChange) onStatusChange(result.data.status);
      } else {
        setError(result.error);
        console.error('Error checking invitation status:', result.error);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error in fetchStatus:', err);
    }
  };
  
  // Load status on component mount
  useEffect(() => {
    fetchStatus();
  }, [userId]);
  
  // Handle sending an invitation
  const handleSendInvite = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await inviteAppUser(userId);
      
      if (result.success) {
        toast.success('Invitation sent successfully');
        setStatus('invited');
        if (onStatusChange) onStatusChange('invited');
      } else {
        setError(result.error);
        toast.error(`Failed to send invitation: ${result.error}`);
      }
    } catch (error) {
      setError(error.message);
      toast.error(`Error sending invitation: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle removing access
  const handleRemoveAccess = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // This would need to be implemented in the appUserService
      // For now, we'll just show a toast
      toast.info('This feature is not yet implemented');
      
      setLoading(false);
    } catch (error) {
      setError(error.message);
      toast.error(`Error removing access: ${error.message}`);
      setLoading(false);
    }
  };
  
  // Render the status badge
  const renderStatusBadge = () => {
    switch (status) {
      case 'loading':
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ${compact ? 'mr-1' : ''}`}>
            Loading...
          </span>
        );
      case 'not_invited':
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 ${compact ? 'mr-1' : ''}`}>
            Not Invited
          </span>
        );
      case 'invited':
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 ${compact ? 'mr-1' : ''}`}>
            Invited
          </span>
        );
      case 'registered':
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ${compact ? 'mr-1' : ''}`}>
            Registered
          </span>
        );
      case 'access_removed':
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 ${compact ? 'mr-1' : ''}`}>
            Access Removed
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ${compact ? 'mr-1' : ''}`}>
            Unknown
          </span>
        );
    }
  };
  
  // Render action buttons based on status
  const renderActionButton = () => {
    if (loading) {
      return (
        <button disabled className="text-xs text-gray-400">
          Processing...
        </button>
      );
    }
    
    switch (status) {
      case 'not_invited':
        return (
          <button 
            onClick={handleSendInvite}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Send Invite
          </button>
        );
      case 'invited':
        return (
          <button 
            onClick={handleSendInvite}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Resend
          </button>
        );
      case 'registered':
        return (
          <button 
            onClick={handleRemoveAccess}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Remove Access
          </button>
        );
      default:
        return null;
    }
  };
  
  // Compact version for cards
  if (compact) {
    return (
      <div className="flex items-center">
        {renderStatusBadge()}
        {renderActionButton()}
      </div>
    );
  }
  
  // Full version for detail pages
  return (
    <div className="invitation-status">
      <div className="text-sm text-gray-600 mb-1">Invitation Status:</div>
      <div className="flex items-center space-x-2">
        {renderStatusBadge()}
        {renderActionButton()}
      </div>
      {error && (
        <div className="text-sm text-red-600 mt-1">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default InvitationStatus; 