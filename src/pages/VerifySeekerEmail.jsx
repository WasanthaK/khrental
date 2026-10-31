// Isolated email verification; explicit redemption owns credential setup and
// server-verified session continuation. Normal tenant initialization stays outside.
import { useState } from 'react';
import { consumeSeekerVerificationContext } from '../utils/seekerVerificationFragment';
import { isPublicSignupUiEnabled } from '../utils/env';
import {continueVerifiedSeekerSession} from '../services/seekerContextClient';
import {enquiryReturnPath,ownerSetupPath} from '../utils/enquiryReturnPath.js';
import {PUBLIC_SIGNUP_PASSWORD_MIN,PUBLIC_SIGNUP_PASSWORD_MAX,PUBLIC_SIGNUP_PASSWORD_HINT,isValidPublicSignupPassword} from '../utils/publicSignupPasswordPolicy.js';

const permitted = isPublicSignupUiEnabled();

const VerifySeekerEmail = ({ initialContext } = {}) => {
  const [{token,enquirySearch}] = useState(() => initialContext ?? consumeSeekerVerificationContext({
    location: typeof window === 'undefined' ? null : window.location,
    history: typeof window === 'undefined' ? null : window.history
  }));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [continuation,setContinuation]=useState(null);
  const [showPasswords,setShowPasswords]=useState(false);

  const redeem = async event => {
    event.preventDefault();
    if (!permitted || !token || status === 'sending') {return;}

    if (!isValidPublicSignupPassword(password)) {
      setMessage(PUBLIC_SIGNUP_PASSWORD_HINT);
      return;
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.');
      return;
    }

    setStatus('sending');
    setMessage('');
    let accepted=false;
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
      const body = await response.json().catch(()=>null);
      if(!response.ok){
        setStatus('error');
        setMessage(body?.code==='SIGNUP_PASSWORD_INVALID'?PUBLIC_SIGNUP_PASSWORD_HINT:
          response.status===429?'Too many attempts. Please wait before trying again on this page.':
          response.status>=500?'We couldn’t finish setup right now. Please try again on this page; you don’t need to request another link yet.':
          'This link may have expired or already been used. Sign in if you completed setup, or request a new link.');
        return;
      }
      accepted=true;
      if (body?.data?.user?.role !== 'authenticated' ||
          body?.data?.user?.user_type !== 'seeker' ||
          !body?.data?.session?.access_token || !body?.data?.user?.id ||
          typeof body.data.session.user?.id!=='string' ||
          body.data.session.user.id.toLowerCase()!==String(body.data.user.id).toLowerCase()) {
        throw new Error('Registration could not be verified.');
      }

      setStatus('complete');
      setPassword('');
      setConfirm('');
      setMessage('Your email has been verified. Getting your account ready…');
      const result=await continueVerifiedSeekerSession({
        session:body.data.session,expectedAuthId:body.data.user.id
      });
      setContinuation(result);
      if(result.adopted){
        if(ownerSetupPath(enquirySearch)){window.location.assign(ownerSetupPath(enquirySearch));return;}
        window.location.assign(enquiryReturnPath(enquirySearch)||'/seeker');
      }else{
        setMessage('Your email has been verified and your account is ready.');
      }
    } catch {
      // Generic error: no token, account existence or provider status leak.
      if(accepted){setPassword('');setConfirm('');}
      setStatus(accepted?'recovery':'error');
      setMessage(accepted
        ?'Your setup request was accepted, but we couldn’t confirm access. Try signing in with the password you just chose.'
        :'We couldn’t finish setup right now. Please try again on this page.');
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
          <a href={'/login'+enquirySearch} className="mt-6 inline-block text-blue-700 underline">Back to sign in</a>
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
        ) : status === 'complete' || status === 'recovery' ? (
          <p className={status==='complete'?'mt-4 text-green-800':'mt-4 text-slate-700'} role="status">{message}</p>
        ) : (
          <form onSubmit={redeem} noValidate className="mt-6 space-y-4">
            <p className="text-sm text-slate-600">
              {ownerSetupPath(enquirySearch)?'Choose a password. Next, set up your property workspace.':'Choose a password for your free account. We’ll then take you back to continue your interest.'}
            </p>
            <p id="seeker-password-hint" className="text-sm text-slate-600">{PUBLIC_SIGNUP_PASSWORD_HINT}</p>
            <label htmlFor="seeker-password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input id="seeker-password" type={showPasswords?'text':'password'} autoComplete="new-password"
              aria-describedby="seeker-password-hint" minLength={PUBLIC_SIGNUP_PASSWORD_MIN} maxLength={PUBLIC_SIGNUP_PASSWORD_MAX} required value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3" />
            <label htmlFor="seeker-password-confirm" className="block text-sm font-medium text-slate-700">
              Confirm password
            </label>
            <input id="seeker-password-confirm" type={showPasswords?'text':'password'} autoComplete="new-password"
              minLength={PUBLIC_SIGNUP_PASSWORD_MIN} maxLength={PUBLIC_SIGNUP_PASSWORD_MAX} required value={confirm}
              onChange={event => setConfirm(event.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3" />
            <button type="button" aria-pressed={showPasswords} onClick={()=>setShowPasswords(value=>!value)}
              className="text-sm text-blue-700 underline">{showPasswords?'Hide passwords':'Show passwords'}</button>
            {message && <p role="alert" className="text-sm text-rose-700">{message}</p>}
            <button type="submit" disabled={status === 'sending'}
              className="w-full rounded-lg bg-blue-700 px-4 py-3 text-white disabled:opacity-60">
              {status === 'sending' ? 'Verifying…' : 'Verify email'}
            </button>
          </form>
        )}
        {status==='complete'&&continuation&&!continuation.adopted&&<p className="mt-4 text-sm text-slate-600">
          {continuation.reason==='another_account'||continuation.reason==='session_changed'
            ? 'Another account is open in this browser. It has been kept signed in. Open a private window to sign in to your new account, or sign out of the other account first.'
            : 'We couldn’t safely sign you in automatically. Use your new password to sign in and continue.'}
        </p>}
        {/* Full navigation leaves the isolated credential entry and boots the normal app. */}
        <a href={'/login'+enquirySearch} className="mt-6 inline-block text-blue-700 underline">
          {status === 'complete' || status === 'recovery' ? 'Continue to sign in' : 'Back to sign in'}
        </a>
        {status!=='complete'&&status!=='recovery'&&<a href={'/seeker-sign-up'+enquirySearch} className="mt-4 block text-blue-700 underline">Request a new verification link</a>}
      </section>
    </main>
  );
};

export default VerifySeekerEmail;
