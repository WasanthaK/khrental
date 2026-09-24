import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { platform as platformClient } from '../services/platformClient';
import { clearActiveTenantId, saveStoredSession } from '../services/requestContext';
import { getApiBaseUrl } from '../utils/env';
import { toast } from 'react-hot-toast';

const readResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Invitation request failed.');
    error.code = payload?.code || null;
    error.data = payload?.data || null;
    throw error;
  }
  return payload;
};

const invitationApiUrl = (path) => `${getApiBaseUrl()}${path}`;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const shouldPreserveExistingSession = (session, invitationEmail) => {
  const existingEmail = normalizeEmail(session?.user?.email);
  const invitedEmail = normalizeEmail(invitationEmail);
  return Boolean(session && existingEmail && invitedEmail && existingEmail !== invitedEmail);
};

const hasServerValidatedDifferentSession = async (session, invitationEmail) => {
  if (!shouldPreserveExistingSession(session, invitationEmail) || !session?.access_token) {
    return false;
  }

  try {
    const response = await fetch(invitationApiUrl('/api/platform/auth/context'), {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    return response.ok;
  } catch (_error) {
    return false;
  }
};

const getRoleRedirect = (role) => (
  String(role || '').trim().toLowerCase() === 'rentee' ? '/rentee' : '/dashboard'
);

const AcceptInvite = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invitation, setInvitation] = useState(null);
  const [success, setSuccess] = useState(false);
  const [preservedExistingSession, setPreservedExistingSession] = useState(false);

  const token = new URLSearchParams(location.search).get('token') || '';

  useEffect(() => {
    let cancelled = false;

    const validateInvitation = async () => {
      if (!token) {
        setError('This invitation link is invalid. Please ask the administrator to send a new invitation.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          invitationApiUrl(`/api/platform/auth/invitations/validate?token=${encodeURIComponent(token)}`)
        );
        const payload = await readResponse(response);
        const inviteData = payload?.data?.invitation || null;

        if (!inviteData) {
          throw new Error('The invitation could not be validated.');
        }

        if (!cancelled) {
          setInvitation(inviteData);
        }
      } catch (validationError) {
        if (!cancelled) {
          setError(
            validationError.code === 'INVITATION_NOT_USABLE'
              ? 'This invitation is expired, revoked, already used, or no longer matches the invited account. Please ask the administrator to resend it.'
              : validationError.message
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    validateInvitation();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!invitation?.email || !token) {
      setError('This invitation is no longer available. Please request a new invitation.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // A browser-local session is not proof of authentication. Preserve a
      // different signed-in account only after the server confirms that its
      // bearer token is still valid. Stale/expired sessions must not strand the
      // invited account in an unauthenticated browser after redemption.
      const { data: existingSessionData } = await platformClient.auth.getSession();
      const existingSession = existingSessionData?.session || null;
      const preserveSession = await hasServerValidatedDifferentSession(existingSession, invitation.email);

      const redeemResponse = await fetch(
        invitationApiUrl('/api/platform/auth/invitations/redeem'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            password,
            establishSession: !preserveSession
          })
        }
      );
      const redeemPayload = await readResponse(redeemResponse);
      const redeemedInvitation = redeemPayload?.data?.invitation || {};
      const redeemedSession = redeemPayload?.data?.session || null;

      if (preserveSession) {
        setPreservedExistingSession(true);
        setSuccess(true);
        toast.success('Account setup completed successfully!');
        return;
      }

      if (!redeemedSession?.access_token || !redeemedSession?.user) {
        throw new Error('Your account was created, but an authenticated session could not be established. Please contact support before retrying the invitation.');
      }

      // Persist the session issued by the redemption endpoint itself. This
      // avoids an unnecessary second password-authentication request after the
      // server has already created and verified the credential. A full reload
      // then initializes the normal auth client from this stored session.
      clearActiveTenantId();
      saveStoredSession(redeemedSession);

      const role = redeemedInvitation.intendedRole || invitation.intendedRole;
      toast.success('Account setup completed successfully!');
      window.location.assign(getRoleRedirect(role));
    } catch (setupError) {
      console.error('Error completing secure invitation setup:', setupError);
      setError(setupError.message || 'Unable to complete account setup.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Verifying your invitation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">Invitation unavailable: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              onClick={() => navigate('/login')}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">Success! </strong>
              <span className="block sm:inline">
                {preservedExistingSession
                  ? 'The invited account has been created. Your existing signed-in account was kept active in this browser. Use a private/incognito window or sign out before signing in as the invited user.'
                  : 'Your account has been set up successfully.'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Complete Your Account Setup</h2>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
          <p className="font-medium">Welcome{invitation?.name ? `, ${invitation.name}` : ''}!</p>
          <p className="text-sm text-gray-600">
            You have been invited to {invitation?.tenantName || 'KH Rentals'} as {invitation?.intendedRole || invitation?.userType || 'a user'}.
          </p>
          {invitation?.expiresAt && (
            <p className="text-xs text-gray-500 mt-1">
              This secure link expires {new Date(invitation.expiresAt).toLocaleString()}.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
              Email
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline bg-gray-100"
              id="email"
              type="email"
              value={invitation?.email || ''}
              readOnly
              disabled
            />
            <p className="text-sm text-gray-500 mt-1">The invitation is bound to this email address.</p>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength="8"
            />
            <p className="text-sm text-gray-500 mt-1">Must be at least 8 characters.</p>
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="confirmPassword"
              type="password"
              placeholder="********"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>

          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
            type="submit"
            disabled={loading}
          >
            Complete Setup
          </button>
        </form>
      </div>
    </div>
  );
};

export default AcceptInvite;
