import { useEffect, useState } from 'react';
import { getInvoiceIssuerProfile, saveInvoiceIssuerProfile } from '../../services/platformClient';

const keys=[
  ['legalName','Legal invoice issuer name'],
  ['postalAddress','Registered/postal address'],
  ['supportEmail','Billing support email'],
  ['supportPhone','Billing support phone'],
  ['website','Website (HTTPS)']
];
const empty=()=>Object.fromEntries(keys.map(([k])=>[k,'']));
export default function InvoiceIssuerSettings(){
  const [profile,setProfile]=useState(empty);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let mounted=true;
    getInvoiceIssuerProfile().then(({data,error})=>{
      if(!mounted)return;
      if(error)setError(error.message);
      else setProfile({...empty(),...(data||{})});
      setLoading(false);
    });
    return()=>{mounted=false;};
  },[]);
  const save=async event=>{
    event.preventDefault();setSaving(true);setNotice('');setError('');
    const result=await saveInvoiceIssuerProfile(profile);
    if(result.error)setError(result.error.message);
    else {setProfile({...empty(),...(result.data||{})});setNotice('Invoice issuer profile saved. It will apply only to future approved invoices.');}
    setSaving(false);
  };
  return <section className="app-panel lg:col-span-2">
    <div className="app-panel-header">
      <h2 className="text-lg font-semibold text-slate-900">Invoice business profile</h2>
      <p className="text-sm text-slate-500">Verified legal issuer details for this organization. KH Rentals software branding is not automatically the legal issuer.</p>
    </div>
    <form className="app-panel-body space-y-4" onSubmit={save}>
      {loading?<p className="text-sm text-slate-600">Loading issuer information…</p>:<>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {keys.map(([key,label])=><label key={key} className="block text-sm font-medium text-slate-700">
            {label}
            <input type="text" maxLength={key==='postalAddress'?500:key==='website'?300:key==='supportEmail'?320:key==='supportPhone'?100:200}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              value={profile[key]||''} onChange={e=>setProfile(current=>({...current,[key]:e.target.value}))}/>
          </label>)}
        </div>
        <p className="text-xs text-slate-500">Enter confirmed business information only. Missing information will never be replaced with examples or guesses.</p>
        <button className="app-button" type="submit" disabled={saving}>{saving?'Saving…':'Save issuer profile'}</button>
      </>}
    </form>
  </section>;
}
