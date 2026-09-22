import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { fetchAppUser } from '../../services/appUserService';
import { resendInvitation } from '../../services/invitationService';

const InviteUserButton = ({ userId, invitationStatus = 'not_invited', onSuccess, size = 'md', fullWidth = false }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultMessage, setResultMessage] = useState(null);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  const isResend = invitationStatus !== 'not_invited' && invitationStatus !== 'unknown';
  const actionLabel = isResend ? 'Resend Invitation' : 'Send Invitation';

  const handleInvite = async () => {
    try {
      setLoading(true);
      setError(null);
      setResultMessage(null);

      const userData = await fetchAppUser(userId);
      const email = userData.contact_details?.email || userData.email;
      if (!email) throw new Error('User has no email address');

      const result = await resendInvitation(userId, false);
      if (!result.success) throw new Error(result.error || 'Failed to send invitation');

      const successMessage = result.providerMessageId
        ? `Invitation accepted by SendGrid for delivery. Reference: ${result.providerMessageId}`
        : 'Invitation accepted by SendGrid for delivery.';

      setResultMessage(successMessage);
      toast.success(successMessage);

      if (onSuccess && typeof onSuccess === 'function') {
        await onSuccess(result);
      }
    } catch (inviteError) {
      console.error('Error sending invitation:', inviteError);
      const message = inviteError.message || 'Failed to send invitation';
      setError(message);
      toast.error(`Failed to send invitation: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleInvite}
        disabled={loading}
        className={`
          ${sizeClasses[size] || sizeClasses.md}
          ${fullWidth ? 'w-full' : ''}
          bg-green-600 hover:bg-green-700 text-white
          rounded transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
        `}
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Sending...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            {actionLabel}
          </>
        )}
      </button>

      {resultMessage && (
        <div className="mt-2 rounded bg-green-50 px-2 py-1 text-sm text-green-700" role="status">
          {resultMessage}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-red-700" role="alert">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default InviteUserButton;
