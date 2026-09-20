import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { fetchAppUser } from '../../services/appUserService';
import { resendInvitation } from '../../services/invitationService';

/**
 * Button component for inviting users
 * @param {Object} props
 * @param {string} props.userId - ID of the user to invite
 * @param {Function} props.onSuccess - Callback after successful invitation
 * @param {string} props.size - Button size: 'sm', 'md', or 'lg'
 * @param {boolean} props.fullWidth - Whether the button should take full width
 * @param {boolean} props.sendReal - Whether to send a real email (default: false)
 */
const InviteUserButton = ({ userId, onSuccess, size = 'md', fullWidth = false, sendReal = false }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultMessage, setResultMessage] = useState(null);
  const [useSendReal, setUseSendReal] = useState(sendReal);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  const handleInvite = async () => {
    try {
      setLoading(true);
      setError(null);
      setResultMessage(null);

      const userData = await fetchAppUser(userId);
      const email = userData.contact_details?.email || userData.email;

      if (!email) {
        throw new Error('User has no email address');
      }

      console.log(`Sending invitation to ${userData.name || 'User'} (${email})`);

      // A checked box means a real SendGrid delivery. Leaving it unchecked is
      // a true simulation and must not call the email delivery endpoint.
      const result = await resendInvitation(userId, !useSendReal);

      if (!result.success) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      const successMessage = result.simulated
        ? 'Invitation simulated. No email was sent.'
        : 'Invitation email accepted for delivery.';

      setResultMessage(successMessage);
      toast.success(successMessage);

      if (onSuccess && typeof onSuccess === 'function') {
        await onSuccess();
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
      <div className="flex items-center mb-2">
        <input
          id={`send-real-checkbox-${userId}`}
          type="checkbox"
          checked={useSendReal}
          disabled={loading}
          onChange={() => {
            setUseSendReal((previous) => !previous);
            setResultMessage(null);
            setError(null);
          }}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor={`send-real-checkbox-${userId}`} className="ml-2 block text-sm text-gray-600">
          Send real email
        </label>
      </div>
      <button
        type="button"
        onClick={handleInvite}
        disabled={loading}
        className={`
          ${sizeClasses[size] || sizeClasses.md}
          ${fullWidth ? 'w-full' : ''}
          ${useSendReal ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white
          rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
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
            {useSendReal ? 'Send Real Invitation' : 'Simulate Invitation'}
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
