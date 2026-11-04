import React,{useEffect,useState} from 'react';
import usePlatformAdminStatus from '../hooks/usePlatformAdminStatus';
import {requestMssqlApi} from '../services/mssqlApiClient';
import {listAdminTenants} from '../services/tenantAdminService';

const initial={market:'LK',billingCurrency:'USD',baseFee:'5.00',rentCurrency:'LKR',includedRent:'',excessPolicy:'pending',effectiveDate:'',reason:''};
const money=(minor,currency='USD')=>new Intl.NumberFormat('en',{style:'currency',currency}).format(minor/100);
const minor=value=>{
  if(!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Use an amount with no more than two decimal places.');
  const [whole,fraction='']=value.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
};
const rulesFrom=form=>({market:form.market,billingCurrency:form.billingCurrency,baseFeeMinor:minor(form.baseFee),rentCurrency:form.rentCurrency,
  includedRentMinor:form.includedRent===''?null:minor(form.includedRent),excessPolicy:form.excessPolicy,
  effectiveAt:form.effectiveDate?new Date(`${form.effectiveDate}T00:00:00.000Z`).toISOString():null,reason:form.reason});
const field='mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900';
const button='rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40';

export const ManagementPricingView=({versions=[],ready=false,loading=false,error='',notice='',form,setForm,preview,quantity,setQuantity,busy=false,onPreview,onSave,onPublish,onReload,enrollment})=>{
  const update=(key,value)=>setForm(previous=>({...previous,[key]:value,...(key==='market'?{rentCurrency:value==='LK'?'LKR':'BND',includedRent:'',reason:''}:{})}));
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header><p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Platform administration</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Management pricing</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Set monthly fees by market. Each saved change creates a version; existing subscriptions keep their agreed price.</p></header>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Sandbox preparation · Live charging is off</strong><p className="mt-1">Standard listings are included. Rent and deposits are separate. Market thresholds, tax treatment and merchant readiness must be settled before launch.</p></div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <button className="underline" onClick={onReload}>Retry</button></div>}
    {notice&&<p role="status" className="rounded-xl bg-teal-50 p-4 text-teal-900">{notice}</p>}
    {loading?<p role="status">Loading pricing versions…</p>:<div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <form onSubmit={onSave} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Create a pricing version</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Market<select className={field} value={form.market} onChange={e=>update('market',e.target.value)}><option value="LK">Sri Lanka</option><option value="BN">Brunei</option></select></label>
          <label className="text-sm font-medium">Monthly fee per dwelling (USD)<input className={field} inputMode="decimal" value={form.baseFee} onChange={e=>update('baseFee',e.target.value)} required/></label>
          <label className="text-sm font-medium">Included monthly rent ({form.rentCurrency})<input className={field} inputMode="decimal" placeholder="Awaiting market decision" value={form.includedRent} onChange={e=>update('includedRent',e.target.value)}/></label>
          <label className="text-sm font-medium">Above-threshold policy<select className={field} value={form.excessPolicy} onChange={e=>update('excessPolicy',e.target.value)}><option value="pending">Decision pending</option><option value="none">No additional fee</option></select></label>
          <label className="text-sm font-medium">Effective date (00:00 UTC)<input className={field} type="date" value={form.effectiveDate} onChange={e=>update('effectiveDate',e.target.value)}/></label>
        </div>
        <label className="block text-sm font-medium">Research or decision note<textarea className={field} rows={3} minLength={10} maxLength={1000} required value={form.reason} onChange={e=>update('reason',e.target.value)} placeholder="Record the source, date and reasoning behind this version."/></label>
        <p className="text-sm text-slate-500">An unfinished rule can be saved as a draft. Publishing to the sandbox requires a threshold, adjustment decision and effective date.</p>
        <div className="flex flex-wrap gap-3"><button className={button} disabled={busy||Boolean(error)} type="submit">Save new draft</button><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={busy||Boolean(error)} type="button" onClick={onPreview}>Preview price</button></div>
      </form>
      <aside className="self-start rounded-2xl border border-slate-200 bg-slate-50 p-5"><h2 className="text-xl font-semibold">Customer price preview</h2>
        <label className="mt-4 block text-sm font-medium">Managed dwellings<input className={field} type="number" min="1" max="10000" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        {preview?<><p className="mt-5 text-4xl font-semibold text-slate-950">{money(preview.monthlyBaseMinor,preview.currency)}<span className="ml-2 text-base font-normal text-slate-500">/ month</span></p><p className="mt-2 text-sm text-slate-600">{preview.quantity} dwelling{preview.quantity===1?'':'s'} · monthly · no trial</p><p className="mt-4 text-sm text-slate-600">Base fee only. Tax is not included in this preview. No above-threshold adjustment has been applied.</p><p className="mt-3 text-sm font-medium">{preview.ready?'Complete for sandbox publication.':'Complete the missing commercial fields before publication.'}</p></>:<p className="mt-4 text-sm text-slate-600">Preview the draft to see the monthly base fee. Saving alone does not change any customer’s bill.</p>}
      </aside>
    </div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-semibold">Pricing history</h2><p className="mt-1 text-sm text-slate-500">{ready?'Sandbox connection configured.':'Sandbox connection is not yet configured.'}</p>
      {!versions.length?<p className="mt-4 text-slate-600">No market pricing versions have been saved.</p>:<div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-slate-500"><tr>{['Market / version','Base fee','Included rent','Effective date','Status',''].map((label,index)=><th key={index} className="whitespace-nowrap px-2 py-3">{label}</th>)}</tr></thead><tbody>{versions.map(version=><tr key={version.id} className="border-b last:border-0"><td className="px-2 py-3">{version.market} · v{version.version}</td><td className="px-2 py-3">{money(version.rules.baseFeeMinor)}</td><td className="px-2 py-3">{version.rules.includedRentMinor===null?'Pending':money(version.rules.includedRentMinor,version.rules.rentCurrency)}</td><td className="px-2 py-3">{version.rules.effectiveAt?.slice(0,10)||'Pending'}</td><td className="px-2 py-3">{version.status==='sandbox_published'?'Published to sandbox':'Draft'}</td><td className="px-2 py-3">{version.status==='draft'&&<button className="font-semibold text-teal-800 underline disabled:text-slate-400" disabled={busy||!ready} onClick={()=>onPublish(version.id)}>Publish to sandbox</button>}</td></tr>)}</tbody></table></div>}
    </section>
    {enrollment&&<section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-semibold">Sandbox workspace enrollment</h2><p className="text-sm text-slate-600">Choose a development workspace for billing acceptance. Its existing development access stays available during testing.</p>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();enrollment.submit();}}>
        <label className="text-sm font-medium">Development workspace<select className={field} required value={enrollment.value.tenantId} onChange={e=>enrollment.update('tenantId',e.target.value)}><option value="">Select a workspace</option>{enrollment.workspaces.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-medium">Billing market<select className={field} value={enrollment.value.market} onChange={e=>enrollment.update('market',e.target.value)}><option value="LK">Sri Lanka</option><option value="BN">Brunei</option></select></label>
        <label className="text-sm font-medium">Sandbox pricing<select className={field} value={enrollment.value.useApprovedSandboxBaseline?'baseline':'market'} onChange={e=>enrollment.update('useApprovedSandboxBaseline',e.target.value==='baseline')}><option value="market">Effective published market version</option><option value="baseline">Approved USD 5 sandbox baseline</option></select></label>
        <label className="text-sm font-medium">Enrollment reason<input className={field} required minLength={10} maxLength={1000} value={enrollment.value.reason} onChange={e=>enrollment.update('reason',e.target.value)}/></label>
        <div><button type="submit" className={button} disabled={busy||Boolean(error)}>Enroll for sandbox testing</button></div>
      </form>
    </section>}
  </div>;
};

export default function ManagementPricing(){
  const {isPlatformAdmin,loading:authorityLoading}=usePlatformAdminStatus();
  const [versions,setVersions]=useState([]),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [form,setForm]=useState(initial),[quantity,setQuantity]=useState('1'),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false);
  const [workspaces,setWorkspaces]=useState([]),[enrollment,setEnrollment]=useState({tenantId:'',market:'LK',useApprovedSandboxBaseline:false,reason:''});
  const load=async()=>{setLoading(true);setError('');try{const [data,tenants]=await Promise.all([requestMssqlApi('/api/management-billing/admin/pricing'),listAdminTenants({pageSize:100})]);setVersions(data.versions);setReady(data.sandboxConfigured);setWorkspaces((Array.isArray(tenants)?tenants:tenants.items||[]).filter(t=>t.plan==='development-testing'&&t.status==='active'));}catch(e){setError(e.message);}finally{setLoading(false);}};
  useEffect(()=>{if(isPlatformAdmin)load();},[isPlatformAdmin]);
  useEffect(()=>setPreview(null),[form,quantity]);
  const run=async action=>{setBusy(true);setNotice('');try{await action();}catch(e){setNotice(e.message);}finally{setBusy(false);}};
  if(authorityLoading)return <p className="p-6">Checking platform access…</p>;
  if(!isPlatformAdmin)return <p role="alert" className="p-6">Platform administrator access is required.</p>;
  return <ManagementPricingView {...{versions,ready,loading,error,notice,form,setForm,quantity,setQuantity,preview,busy}} onReload={load}
    enrollment={{workspaces,value:enrollment,update:(key,value)=>setEnrollment(previous=>({...previous,[key]:value})),submit:()=>run(async()=>{await requestMssqlApi('/api/management-billing/admin/enroll',{method:'POST',body:enrollment});setNotice('Workspace enrolled. Its administrator can open Management subscription to test checkout.');})}}
    onPreview={()=>run(async()=>setPreview(await requestMssqlApi('/api/management-billing/admin/pricing/preview',{method:'POST',body:{rules:rulesFrom(form),quantity:Number(quantity)}})))}
    onSave={event=>{event.preventDefault();run(async()=>{await requestMssqlApi('/api/management-billing/admin/pricing',{method:'POST',body:{rules:rulesFrom(form),expectedVersion:Math.max(0,...versions.filter(v=>v.market===form.market).map(v=>v.version))}});await load();setNotice('New draft saved. Existing subscriptions are unchanged.');});}}
    onPublish={id=>run(async()=>{await requestMssqlApi(`/api/management-billing/admin/pricing/${id}/publish-sandbox`,{method:'POST',body:{}});await load();setNotice('Published to the sandbox catalogue. Existing subscriptions retain their price.');})}/>;
}
