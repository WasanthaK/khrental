// B04 S3c foundation. Not connected to src/routes.jsx until the governed
// S3a migration, shared durable limiter and S3b2 API release gates are green.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { consumeSeekerVerificationFragment } from '../utils/seekerVerificationFragment';
import { isPublicSignupUiEnabled } from '../utils/env';

const permitted = isPublicSignupUiEnabled();

const VerifySeekerEmail = () => {
  const [token] = useState(() => consumeSeekerVerificationFragment({
    location: typeof window === 'undefined' ? null : window.location,
    history: typeof window === 'undefined' ? null : window.history
  }));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const redeem = async event => {
    event.preventDefault();
    if (!permitted || !token || status === 'sending') return;

    if (password.length < 12 || password.length > 256) {
      setMessage('Choose a password between 12 and 256 characters.');
      return;
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.');
      return;
    }

    setStatus('sending');
    setMessage('');
    try {
      // Explicit same-origin fetch with no bearer, tenant header, credentials
      // or URL token. This page must never inherit the landlord workspace.
      const response = await fetch('/api/public-signup/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'error'
      });
      if (!response.ok) throw new Error('Registration could not be completed.');
      const body = await response.json();
      if (body?.data?.user?.role !== 'authenticated' ||
          body?.data?.user?.user_type !== 'seeker' ||
          !body?.data?.session?.access_token) {
        throw new Error('Registration could not be verified.');
      }

      // Do not persist the new session or auto-switch the current browser
      // identity until S3c session-preservation / tenantless UX is accepted.
      setStatus('complete');
      setPassword('');
      setConfirm('');
      setMessage('Your email has been verified. Sign in with your new password.');
    } catch {
      // Generic error: no token, account existence or provider status leak.
      setStatus('error');
      setMessage('Verification could not be completed. Request a new link or sign in.');
      setPassword('');
      setConfirm('');
    }
  };

  if (!permitted) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm" aria-labelledby="verify-disabled-title">
          <p className="text-sm font-semibold text-blue-700">Quixo.Homes</p>
          <h1 id="verify-disabled-title" className="mt-2 text-2xl font-semibold text-slate-900">
            Registration is not available yet
          </h1>
          <p className="mt-4 text-slate-600">Online email verification has not been enabled.</p>
          <Link to="/login" className="mt-6 inline-block text-blue-700 underline">Back to sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm" aria-labelledby="verify-title">
        <p className="text-sm font-semibold text-blue-700">Quixo.Homes</p>
        <h1 id="verify-title" className="mt-2 text-2xl font-semibold text-slate-900">
          Verify your email
        </h1>
        {!token ? (
          <p className="mt-4 text-slate-600" role="alert">
            This link is missing or invalid. Please request a fresh verification message.
          </p>
        ) : status === 'complete' ? (
          <p className="mt-4 text-green-800" role="status">{message}</p>
        ) : (
          <form onSubmit={redeem} className="mt-6 space-y-4">
            <p className="text-sm text-slate-600">
              Set a password to complete your global seeker account. Joining a property-management organization is a separate step.
            </p>
            <label htmlFor="seeker-password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input id="seeker-password" type="password" autoComplete="new-password"
              minLength={12} maxLength={256} required value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3" />
            <label htmlFor="seeker-password-confirm" className="block text-sm font-medium text-slate-700">
              Confirm password
            </label>
            <input id="seeker-password-confirm" type="password" autoComplete="new-password"
              minLength={12} maxLength={256} required value={confirm}
              onChange={event => setConfirm(event.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3" />
            {message && <p role="alert" className="text-sm text-rose-700">{message}</p>}
            <button type="submit" disabled={status === 'sending'}
              className="w-full rounded-lg bg-blue-700 px-4 py-3 text-white disabled:opacity-60">
              {status === 'sending' ? 'Verifying…' : 'Verify email'}
            </button>
          </form>
        )}
        <Link to="/login" className="mt-6 inline-block text-blue-700 underline">
          {status === 'complete' ? 'Continue to sign in' : 'Back to sign in'}
        </Link>
      </section>
    </main>
  );
};

export default VerifySeekerEmail;
