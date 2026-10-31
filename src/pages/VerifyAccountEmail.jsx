import {useState} from 'react';
import {ownerSetupPath} from '../utils/enquiryReturnPath.js';
import {isPublicSignupUiEnabled} from '../utils/env.js';

export default function VerifyAccountEmail({initialContext}) {
  const [busy,setBusy]=useState(false);
  const [verified,setVerified]=useState(false);
  const [error,setError]=useState('');
  const submit=async event=>{
    event.preventDefault();if(busy||verified){return;}setBusy(true);setError('');
    try{
      const response=await fetch('/api/public-signup/account-redeem',{method:'POST',
        headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
        body:JSON.stringify({token:initialContext.token,challengeId:initialContext.accountChallenge})});
      const body=await response.json().catch(()=>null);
      if(!response.ok||body?.data?.verified!==true){throw new Error(body?.error||'We couldn’t verify your email. Please try again.');}
      setVerified(true);
    }catch(error){setError(error.message);}finally{setBusy(false);}
  };
  return <main className="auth-shell flex items-center justify-center"><section className="auth-card space-y-5">
    <p className="font-semibold text-blue-700">Quixo.Homes</p>
    <h1 className="auth-title">{verified?'Email verified':'Verify your email'}</h1>
    {!isPublicSignupUiEnabled()?<p>Account verification is unavailable.</p>:verified?<>
      <p>Your existing account’s email is verified. Return to your property setup tab and continue, or open setup here.</p>
      <a className="block rounded-lg bg-blue-700 p-3 text-center text-white" href={ownerSetupPath(initialContext.enquirySearch)||'/owner-start'}>Continue property setup</a>
    </>:<form onSubmit={submit} className="space-y-5">
      <p>Confirm this email address for your existing account to continue property setup. Your password and signed-in account will stay the same.</p>
      {error&&<p role="alert" className="text-rose-700">{error}</p>}
      <button className="w-full rounded-lg bg-blue-700 p-3 text-white" disabled={busy} type="submit">{busy?'Verifying…':'Verify email'}</button>
    </form>}
  </section></main>;
}
