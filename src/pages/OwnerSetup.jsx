import {useState,useRef,useEffect} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../hooks/useAuth';
import {getPlatformClient} from '../services/platformClient';
import {getExistingPropertyWorkspacePath,getOwnerContinuationPath} from '../utils/authRedirect.js';

export default function OwnerSetup(){
  const {user,membership,loading,isAuthenticated,refreshTenantContext}=useAuth();
  const contextUnavailable=isAuthenticated&&user?.tenantContextVerified===false;
  const existingMembership=membership||user?.membership;
  const existingProperties=getExistingPropertyWorkspacePath({user,membership:existingMembership});
  const workspaceName=existingMembership?.tenant?.name||user?.tenant?.name||'Your workspace';
  const identity=String(user?.id||'');
  const saveQueue=useRef(Promise.resolve());
  const currentIdentity=useRef(identity);currentIdentity.current=identity;
  const selected=new URLSearchParams(useLocation().search);
  const createAnotherWorkspace=selected.get('newWorkspace')==='1';
  const [country,setCountry]=useState(selected.get('country')==='BN'?'BN':'LK');
  const [name,setName]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [needsVerification,setNeedsVerification]=useState(false);
  const [verificationMessage,setVerificationMessage]=useState('');
  const [draftIdentity,setDraftIdentity]=useState(null);
  const [saveMessage,setSaveMessage]=useState('');
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const draftKey='quixo.owner-setup.draft.'+identity+(createAnotherWorkspace?'.additional':'');
  useEffect(()=>{
    if(contextUnavailable){return;}
    let draft=!createAnotherWorkspace?user?.ownerOnboarding:null;
    try{if(!draft){draft=identity?JSON.parse(sessionStorage.getItem(draftKey)):null;}}catch{/* Draft storage is optional. */}
    const valid=draft&&typeof draft.name==='string'&&draft.name.length<=200&&['LK','BN'].includes(draft.country)&&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.requestId||'');
    setName(valid?draft.name:'');setCountry(valid?draft.country:(selected.get('country')==='BN'?'BN':'LK'));
    setError('');setBusy(false);setNeedsVerification(false);setVerificationMessage('');setSaveMessage('');
    setRequestId(valid?draft.requestId:crypto.randomUUID());setDraftIdentity(identity);
  },[identity,createAnotherWorkspace,contextUnavailable]);
  useEffect(()=>{
    if(!identity||draftIdentity!==identity){return;}
    try{sessionStorage.setItem(draftKey,JSON.stringify({name,country,requestId}));}catch{/* Keep the current form usable without storage. */}
  },[identity,draftIdentity,name,country,requestId]);
  useEffect(()=>{
    if(contextUnavailable||!identity||draftIdentity!==identity||loading||busy||!isAuthenticated||(existingProperties&&!createAnotherWorkspace)){return;}
    setSaveMessage('Saving setup…');
    let active=true;
    const timer=setTimeout(()=>{
      saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{
      if(!active){return;}
      setSaveMessage('Saving setup…');
      try{
        const {data,error:sessionError}=await getPlatformClient().auth.getSession();
        if(!active){return;}
        if(sessionError||!data?.session?.access_token||String(data.session.user?.id)!==identity){throw new Error('session changed');}
        const response=await fetch('/api/platform/owner-setup/progress',{method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
          credentials:'omit',cache:'no-store',body:JSON.stringify({name,country,requestId})});
        if(!response.ok){throw new Error('save');}
        if(active&&currentIdentity.current===identity){setSaveMessage('Setup saved. You can continue after signing in again.');}
      }catch{if(active&&currentIdentity.current===identity){setSaveMessage('Your latest changes could not be saved. Keep this page open or continue below to retry.');}}
      });
    },400);
    return()=>{active=false;clearTimeout(timer);};
  },[identity,draftIdentity,name,country,requestId,loading,busy,isAuthenticated,existingProperties,createAnotherWorkspace,contextUnavailable]);
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
    event.preventDefault();if(busy||contextUnavailable){return;}setBusy(true);setError('');
    const actorAtStart=identity;
    try{
      await saveQueue.current;
      const client=getPlatformClient();
      const {data,error:sessionError}=await client.auth.getSession();
      if(sessionError||!data?.session?.access_token){throw new Error('Please sign in to continue.');}
      if(currentIdentity.current!==actorAtStart||String(data.session.user?.id)!==actorAtStart){throw new Error('Your signed-in account changed. Continue with the account that started this setup.');}
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
    <a className="font-semibold text-blue-700" href="https://quixo.homes/">Quixo.Homes</a>
    <h1 className="auth-title">{isAuthenticated&&!existingProperties?'Continue setting up your property':'Have a property to rent?'}</h1>
    <p className="auth-subtitle">Add your property, reach renters and manage the rental from one place. Your standard listing is included unless you choose to keep it private.</p>
    <p className="text-sm text-slate-600">Product testing is open. No payment is collected during testing.</p>
    {loading?<p role="status">Checking your account…</p>:contextUnavailable?<section aria-label="Workspace lookup unavailable" className="space-y-4">
      <p role="alert">We couldn’t load your workspace. Try again to continue with your existing account.</p>
      <button type="button" disabled={busy} className="rounded-lg bg-blue-700 p-3 text-white" onClick={async()=>{
        setBusy(true);try{await refreshTenantContext();}finally{setBusy(false);}
      }}>{busy?'Checking your account…':'Try again'}</button>
    </section>:!isAuthenticated?<div className="space-y-4">
      {selected.get('verification')==='pending'&&<p role="status">Check your email to verify your account. Your next step is adding your first property.</p>}
      <label className="block" htmlFor="owner-country">Property country</label>
      <select id="owner-country" disabled={busy} className="w-full rounded-lg border p-3" value={country} onChange={e=>setCountry(e.target.value)}><option value="LK">Sri Lanka</option><option value="BN">Brunei Darussalam</option></select>
      <a className="block rounded-lg bg-blue-700 p-3 text-center text-white" href={'/owner-sign-up?country='+country}>Create owner account</a>
      <Link className="block underline" to={'/login?ownerCountry='+country}>Already have an account? Sign in</Link>
    </div>:existingProperties&&!createAnotherWorkspace?<section className="space-y-4" aria-label="Your existing workspace">
      <h2 className="text-xl font-semibold">Continue in {workspaceName}</h2>
      <p>A workspace is your account for managing properties. It keeps your properties, team, agreements and invoices together. One workspace can manage many properties.</p>
      <Link className="block rounded-lg bg-blue-700 p-3 text-center text-white" to={getOwnerContinuationPath({user,membership:existingMembership})||existingProperties}>{user?.ownerOnboarding?.step==='property'?'Continue to first property':'Open my properties'}</Link>
      {String(existingMembership?.role).toLowerCase()==='admin'&&<Link className="block underline" to={'/dashboard/properties/new?country='+country}>Add a property</Link>}
      <p className="text-sm text-slate-600">For a separately managed business, <Link className="underline" to={'/owner-start?country='+country+'&newWorkspace=1'}>set up another workspace</Link>.</p>
    </section>:<form onSubmit={submit} className="space-y-4">
      <p className="text-sm font-medium text-blue-700">Account → Email verification → Workspace → First property</p>
      <h2 className="text-xl font-semibold">Set up your property workspace</h2>
      <p className="text-sm text-slate-600">A workspace is your account for managing properties. It keeps your properties, team, agreements and invoices together. One workspace can manage many properties.</p>
      <p className="text-sm text-slate-600">Use your name or business name. Next, add your first property and its photos.</p>
      {existingProperties&&<Link className="block underline" to={'/owner-start?country='+country}>Back to my current workspace</Link>}
      <label className="block" htmlFor="owner-workspace">Workspace name</label>
      <input id="owner-workspace" className="w-full rounded-lg border p-3" required disabled={busy} maxLength={200} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name or property business"/>
      <label className="block" htmlFor="owner-country">Property country</label>
      <select id="owner-country" disabled={busy} className="w-full rounded-lg border p-3" value={country} onChange={e=>setCountry(e.target.value)}><option value="LK">Sri Lanka</option><option value="BN">Brunei Darussalam</option></select>
      {saveMessage&&<p role="status" className="text-sm text-slate-600">{saveMessage}</p>}
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
