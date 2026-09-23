import { useEffect, useState } from 'react';
import { platform as platformClient } from '../services/platformClient';
import { getApiBaseUrl } from '../utils/env';
import { useNavigate, useSearchParams } from 'react-router-dom';

const RESET_TOKEN_MESSAGES = {
  expired: 'This password reset link has expired. Request a new reset link.',
  used: 'This password reset link has already been used. Request a new reset link if you still need to change your password.',
  revoked: 'This password reset link has been replaced by a newer request. Use the newest reset email.',
  stale: 'This password reset link is no longer valid. Request a new reset link.',
  invalid: 'This password reset link is invalid. Request a new reset link.'
};

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const isRedeemMode = Boolean(token);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetComplete, setResetComplete] = useState(false);
  const [tokenValidation, setTokenValidation] = useState({
    checking: isRedeemMode,
    valid: !isRedeemMode,
    state: isRedeemMode ? null : 'not_required'
  });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    if (!isRedeemMode) {
      setTokenValidation({ checking: false, valid: true, state: 'not_required' });
      return () => {
        cancelled = true;
      };
    }

    const validateToken = async () => {
      try {
        setTokenValidation({ checking: true, valid: false, state: null });
        setError('');

        const response = await fetch(
          `${getApiBaseUrl()}/api/platform/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' }
          }
        );
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to validate this password reset link.');
        }

        const result = payload?.data || {};
        if (cancelled) return;

        if (!result.valid) {
          const state = result.state || 'invalid';
          setTokenValidation({ checking: false, valid: false, state });
          setError(RESET_TOKEN_MESSAGES[state] || RESET_TOKEN_MESSAGES.invalid);
          return;
        }

        setTokenValidation({ checking: false, valid: true, state: 'valid' });
      } catch (validationError) {
        if (cancelled) return;
        setTokenValidation({ checking: false, valid: false, state: 'error' });
        setError(validationError.message || 'Unable to validate this password reset link.');
      }
    };

    validateToken();

    return () => {
      cancelled = true;
    };
  }, [isRedeemMode, token]);

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setMessage('');

      const { error: requestError } = await platformClient.auth.resetPasswordForEmail(email);
      if (requestError) {
        throw requestError;
      }

      setMessage('If an account exists for that email, a password reset link has been sent.');
    } catch (err) {
      console.error('Error requesting password reset:', err);
      setError(err.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();

    if (!tokenValidation.valid) {
      setError('This password reset link is not valid. Request a new reset link.');
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
      setError('');
      setMessage('');

      const response = await fetch(`${getApiBaseUrl()}/api/platform/auth/reset-password/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to reset password.');
      }

      // The backend has already revoked every existing session for the account.
      // signOut() is used here to clear the browser's in-memory/local copy and
      // notify auth listeners. Its server call may receive 401 because that old
      // session is now intentionally invalid, so cleanup must not change a
      // successful password reset into an error state.
      try {
        await platformClient.auth.signOut();
      } catch (cleanupError) {
        console.warn('Password reset succeeded; the previous session was already invalid during local cleanup:', cleanupError);
      }

      setResetComplete(true);
      setPassword('');
      setConfirmPassword('');
      setMessage('Your password has been updated. You can now sign in with the new password.');
    } catch (err) {
      console.error('Error completing password reset:', err);
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const canShowRedeemForm = isRedeemMode && !tokenValidation.checking && tokenValidation.valid;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isRedeemMode ? 'Choose a New Password' : 'Reset Your Password'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {isRedeemMode
              ? 'Enter a new password for your KH Rentals account.'
              : "Enter your email and we'll send you a secure password reset link."}
          </p>
        </div>

        {tokenValidation.checking && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded" role="status">
            Checking your password reset link...
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {message && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{message}</span>
          </div>
        )}

        {!resetComplete && ((!isRedeemMode) || canShowRedeemForm) && (
          <form className="mt-8 space-y-6" onSubmit={isRedeemMode ? handleSetNewPassword : handleResetPassword}>
            {isRedeemMode ? (
              <div className="rounded-md shadow-sm space-y-3">
                <div>
                  <label htmlFor="new-password" className="sr-only">New password</label>
                  <input
                    id="new-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="sr-only">Confirm password</label>
                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-md shadow-sm -space-y-px">
                <div>
                  <label htmlFor="email-address" className="sr-only">Email address</label>
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60"
              >
                {loading
                  ? (isRedeemMode ? 'Updating Password...' : 'Sending Reset Link...')
                  : (isRedeemMode ? 'Update Password' : 'Send Reset Link')}
              </button>
            </div>
          </form>
        )}

        {isRedeemMode && !tokenValidation.checking && !tokenValidation.valid && (
          <div className="text-sm text-center">
            <button
              type="button"
              onClick={() => navigate('/reset-password', { replace: true })}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Request a New Reset Link
            </button>
          </div>
        )}

        <div className="text-sm text-center">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
