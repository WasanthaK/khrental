// Separate seeker identity registration. Never use the legacy renter signup.
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isPublicSignupUiEnabled } from '../utils/env';
import {enquiryIntentFromSearch,enquiryLoginSearch,pendingVerificationBrowseUrl} from '../utils/enquiryReturnPath.js';

export default function SeekerSignUp() {
  const location=useLocation();
  const ownerCountry=location.pathname==='/owner-sign-up'?(new URLSearchParams(location.search).get('country')==='BN'?'BN':'LK'):null;
  const enquiry=enquiryIntentFromSearch(location.search);
  const returnSearch=ownerCountry?'?ownerCountry='+ownerCountry:enquiryLoginSearch(location.search);
  const enabled = isPublicSignupUiEnabled();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async event => {
    event.preventDefault();
    if (!enabled || busy) {return;}
    setBusy(true);
    try {
      const response = await fetch('/api/public-signup/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(),...(ownerCountry?{ownerCountry}:enquiry?{enquiry}:{}) }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'error'
      });
      if (!response.ok) {throw Error('Unavailable');}
      setMessage('If registration is available for this email address, a verification email will be sent.');
      setEmail('');
      setName('');
      window.location.assign(ownerCountry?'/owner-start?country='+ownerCountry+'&verification=pending':pendingVerificationBrowseUrl(location.search));
    } catch {
      setMessage('Registration is unavailable right now. Please try again later.');
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="font-semibold text-blue-700">Quixo.Homes</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{ownerCountry?'Start managing your property':'Find your next place'}</h1>
        {!enabled ? <p className="mt-4 text-slate-600">Public registration is not available yet.</p> :
          <form onSubmit={submit} className="mt-6 space-y-4">
            {ownerCountry && <><p className="text-sm font-medium text-blue-700">Step 1 of 4 · Create account</p><p className="text-sm text-slate-600">Next: verify email → set up your workspace → add your first property.</p><p className="text-sm text-slate-700">Property country: <strong>{ownerCountry==='LK'?'Sri Lanka':'Brunei Darussalam'}</strong>. <Link className="text-blue-700 underline" to={'/owner-sign-up?country='+(ownerCountry==='LK'?'BN':'LK')}>Change country</Link></p></>}

            <p className="text-sm text-slate-600">{ownerCountry?'Create your account to add a property, reach renters and manage your rental. No payment is collected during product testing.':'Create your free account to contact owners, arrange viewings and keep track of your rental search.'} We’ll email you a link to verify your address and set a password.</p>
            <label className="block text-sm font-medium" htmlFor="seeker-name">Full name</label>
            <input className="w-full rounded-lg border p-3" id="seeker-name" autoComplete="name"
              maxLength={255} required value={name} onChange={e => setName(e.target.value)} />
            <label className="block text-sm font-medium" htmlFor="seeker-email">Email</label>
            <input className="w-full rounded-lg border p-3" id="seeker-email" type="email"
              autoComplete="email" maxLength={320} required value={email}
              onChange={e => setEmail(e.target.value)} />
            <button className="w-full rounded-lg bg-blue-700 px-4 py-3 text-white disabled:opacity-60" disabled={busy}
              type="submit">{busy ? 'Requesting…' : 'Send verification link'}</button>
          </form>}
        {message && <p role="status" className="mt-4 text-sm text-slate-700">{message}</p>}
        <Link to={'/login'+returnSearch} className="mt-6 inline-block text-blue-700 underline">Back to sign in</Link>
      </section>
    </main>
  );
}
