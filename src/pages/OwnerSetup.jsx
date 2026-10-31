import {useState,useRef,useEffect} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../hooks/useAuth';
import {getPlatformClient} from '../services/platformClient';

export default function OwnerSetup(){
  const {user,loading,isAuthenticated}=useAuth();
  const identity=String(user?.id||'');
  const currentIdentity=useRef(identity);currentIdentity.current=identity;
  const selected=new URLSearchParams(useLocation().search);
  const [country,setCountry]=useState(selected.get('country')==='BN'?'BN':'LK');
  const [name,setName]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [needsVerification,setNeedsVerification]=useState(false);
  const [verificationMessage,setVerificationMessage]=useState('');
  const [draftIdentity,setDraftIdentity]=useState(null);
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const draftKey='quixo.owner-setup.draft.'+identity;
  useEffect(()=>{
    let draft=null;
    try{draft=identity?JSON.parse(sessionStorage.getItem(draftKey)):null;}catch{/* Draft storage is optional. */}
    const valid=draft&&typeof draft.name==='string'&&draft.name.length<=200&&['LK','BN'].includes(draft.country)&&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.requestId||'');
    setName(valid?draft.name:'');setCountry(valid?draft.country:(selected.get('country')==='BN'?'BN':'LK'));
    setError('');setBusy(false);setNeedsVerification(false);setVerificationMessage('');
    setRequestId(valid?draft.requestId:crypto.randomUUID());setDraftIdentity(identity);
  },[identity]);
  useEffect(()=>{
    if(!identity||draftIdentity!==identity){return;}
    try{sessionStorage.setItem(draftKey,JSON.stringify({name,country,requestId}));}catch{/* Keep the current form usable without storage. */}
  },[identity,draftIdentity,name,country,requestId]);
  const requestVerification=async()=>{
    if(busy){return;}const actorAtStart=identity;setBusy(true);setError('');setVerificationMessage('');
    try{
      const {data,error:sessionError}=await getPlatformClient().auth.getSession();
      if(sessionError||!data?.session?.access_token){throw new Error('Please sign in to continue.');}
      if(currentIdentity.current!==actorAtStart||String(data.session.user?.id)!==actorAtStart){return;}
      const response=await fetch('/api/public-signup/account-challenge',{method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
        credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',body:JSON.stringify({country})});
      const body=await response.json().catch(()=>null);
      if(currentIdentity.current!==actorAtStart){return;}
      if(!response.ok||body?.data?.accepted!==true){throw new Error(body?.error||'We couldn’t request your verification email. Please try again.');}
      setVerificationMessage(body.data.message);
    }catch(err){if(currentIdentity.current===actorAtStart){setError(err.message);}}
    finally{if(currentIdentity.current===actorAtStart){setBusy(false);}}
  };
  const submit=async event=>{
    event.preventDefault();if(busy){return;}setBusy(true);setError('');
    const actorAtStart=identity;
    try{
      const client=getPlatformClient();
      const {data,error:sessionError}=await client.auth.getSession();
      if(sessionError||!data?.session?.access_token){throw new Error('Please sign in to continue.');}
      const response=await fetch('/api/platform/owner-setup',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
        credentials:'omit',cache:'no-store',body:JSON.stringify({name:name.trim(),country,requestId})});
      const body=await response.json().catch(()=>null);
      if(currentIdentity.current!==actorAtStart){return;}
      if(body?.code==='OWNER_VERIFICATION_REQUIRED'){setNeedsVerification(true);}
      if(!response.ok){throw new Error(body?.error||'We couldn’t create your workspace. Please try again.');}
      if(typeof body?.data?.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.data.id)){throw new Error('We couldn’t confirm your workspace. Please try again.');}
      const current=await client.auth.getSession();
      if(currentIdentity.current!==actorAtStart||current.error||
        current.data?.session?.access_token!==data.session.access_token||
        current.data?.session?.user?.id!==data.session.user?.id){
        throw new Error('Your signed-in account changed. It has been kept active. Continue with the account that started this setup.');
      }
      const result=await client.auth.setActiveTenant(body.data.id);
      if(result.error){throw new Error('Your workspace is ready. Please sign in again to continue.');}
      try{sessionStorage.removeItem(draftKey);}catch{/* No draft cleanup is needed when storage is unavailable. */}
      window.location.assign('/dashboard/properties/new?country='+country);
    }catch(err){if(currentIdentity.current===actorAtStart){setError(err.message);}}finally{if(currentIdentity.current===actorAtStart){setBusy(false);}}
  };
  return <main className="auth-shell flex items-center justify-center"><section className="auth-card space-y-6">
    <Link className="font-semibold text-blue-700" to="/seeker">Quixo.Homes</Link>
    <h1 className="auth-title">Have a property to rent?</h1>
    <p className="auth-subtitle">Add your property, reach renters and manage the rental from one place. Your standard listing is included unless you choose to keep it private.</p>
    <p className="text-sm text-slate-600">Product testing is open. No payment is collected during testing.</p>
    {loading?<p role="status">Checking your account…</p>:!isAuthenticated?<div className="space-y-4">
      {selected.get('verification')==='pending'&&<p role="status">Check your email to verify your account. Your next step is adding your first property.</p>}
      <label className="block" htmlFor="owner-country">Property country</label>
      <select id="owner-country" disabled={busy} className="w-full rounded-lg border p-3" value={country} onChange={e=>setCountry(e.target.value)}><option value="LK">Sri Lanka</option><option value="BN">Brunei Darussalam</option></select>
      <a className="block rounded-lg bg-blue-700 p-3 text-center text-white" href={'/owner-sign-up?country='+country}>Create owner account</a>
      <Link className="block underline" to={'/login?ownerCountry='+country}>Already have an account? Sign in</Link>
    </div>:<form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-semibold">Set up your property workspace</h2>
      <p className="text-sm text-slate-600">Give it a name you recognise. Next, add your first property and its photos.</p>
      <label className="block" htmlFor="owner-workspace">Workspace name</label>
      <input id="owner-workspace" className="w-full rounded-lg border p-3" required disabled={busy} maxLength={200} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name or property business"/>
      <label className="block" htmlFor="owner-country">Property country</label>
      <select id="owner-country" disabled={busy} className="w-full rounded-lg border p-3" value={country} onChange={e=>setCountry(e.target.value)}><option value="LK">Sri Lanka</option><option value="BN">Brunei Darussalam</option></select>
      {error&&<p role="alert" className="text-rose-700">{error}</p>}
      {needsVerification&&<section aria-label="Verify your existing account" className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
        <p>Verify your existing account’s email address to continue. We’ll keep your workspace details here.</p>
        <button type="button" disabled={busy} onClick={requestVerification} className="rounded-lg border border-blue-700 p-3 text-blue-800">
          {busy?'Please wait…':verificationMessage?'Resend verification email':'Send verification email'}
        </button>
        {verificationMessage&&<p role="status">{verificationMessage} After verifying, select Continue to first property.</p>}
      </section>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-blue-700 p-3 text-white">{busy?'Setting up…':'Continue to first property'}</button>
    </form>}
    <a className="block underline" href="https://quixo.homes/">Browse rentals</a>
  </section></main>;
}
