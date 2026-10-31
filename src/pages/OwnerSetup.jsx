import {useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../hooks/useAuth';
import {getPlatformClient} from '../services/platformClient';

export default function OwnerSetup(){
  const {loading,isAuthenticated}=useAuth();
  const selected=new URLSearchParams(useLocation().search);
  const [country,setCountry]=useState(selected.get('country')==='BN'?'BN':'LK');
  const [name,setName]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [requestId]=useState(()=>crypto.randomUUID());
  const submit=async event=>{
    event.preventDefault();if(busy){return;}setBusy(true);setError('');
    try{
      const client=getPlatformClient();
      const {data,error:sessionError}=await client.auth.getSession();
      if(sessionError||!data?.session?.access_token){throw new Error('Please sign in to continue.');}
      const response=await fetch('/api/platform/owner-setup',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
        credentials:'omit',cache:'no-store',body:JSON.stringify({name:name.trim(),country,requestId})});
      const body=await response.json().catch(()=>null);
      if(!response.ok){throw new Error(body?.error||'We couldn’t create your workspace. Please try again.');}
      if(typeof body?.data?.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.data.id)){throw new Error('We couldn’t confirm your workspace. Please try again.');}
      const result=await client.auth.setActiveTenant(body.data.id);
      if(result.error){throw new Error('Your workspace is ready. Please sign in again to continue.');}
      window.location.assign('/dashboard/properties/new?country='+country);
    }catch(err){setError(err.message);}finally{setBusy(false);}
  };
  return <main className="auth-shell flex items-center justify-center"><section className="auth-card space-y-6">
    <Link className="font-semibold text-blue-700" to="/seeker">Quixo.Homes</Link>
    <h1 className="auth-title">Have a property to rent?</h1>
    <p className="auth-subtitle">Add your property, reach renters and manage the rental from one place. Your standard listing is included unless you choose to keep it private.</p>
    <p className="text-sm text-slate-600">Product testing is open. No payment is collected during testing.</p>
    {loading?<p role="status">Checking your account…</p>:!isAuthenticated?<div className="space-y-4">
      {selected.get('verification')==='pending'&&<p role="status">Check your email to verify your account. Your next step is adding your first property.</p>}
      <label className="block" htmlFor="owner-country">Property country</label>
      <select id="owner-country" className="w-full rounded-lg border p-3" value={country} onChange={e=>setCountry(e.target.value)}><option value="LK">Sri Lanka</option><option value="BN">Brunei Darussalam</option></select>
      <a className="block rounded-lg bg-blue-700 p-3 text-center text-white" href={'/owner-sign-up?country='+country}>Create owner account</a>
      <Link className="block underline" to={'/login?ownerCountry='+country}>Already have an account? Sign in</Link>
    </div>:<form onSubmit={submit} className="space-y-4">
      <h2 className="text-xl font-semibold">Set up your property workspace</h2>
      <p className="text-sm text-slate-600">Give it a name you recognise. Next, add your first property and its photos.</p>
      <label className="block" htmlFor="owner-workspace">Workspace name</label>
      <input id="owner-workspace" className="w-full rounded-lg border p-3" required maxLength={200} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name or property business"/>
      <label className="block" htmlFor="owner-country">Property country</label>
      <select id="owner-country" className="w-full rounded-lg border p-3" value={country} onChange={e=>setCountry(e.target.value)}><option value="LK">Sri Lanka</option><option value="BN">Brunei Darussalam</option></select>
      {error&&<p role="alert" className="text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-blue-700 p-3 text-white">{busy?'Setting up…':'Continue to first property'}</button>
    </form>}
    <a className="block underline" href="https://quixo.homes/">Browse rentals</a>
  </section></main>;
}
