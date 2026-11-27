import React, {useEffect, useState} from 'react';
import {requestMssqlApi} from '../../services/mssqlApiClient';

const endpoint = '/api/management-billing/admin/collectors';
const field = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2';
const initial = {market:'LK',receivingAccount:'',effectiveAt:'',approvalReference:''};

export default function MarketSandboxCollectors({request=requestMssqlApi}) {
  const [open,setOpen] = useState(false);
  const [rows,setRows] = useState([]);
  const [form,setForm] = useState(initial);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [refresh,setRefresh] = useState(0);
  useEffect(()=>{
    if (!open) {return;}
    let current=true;
    setBusy(true);
    request(endpoint).then(data=>{if(current){setRows(data);setError('');}})
      .catch(e=>{if(current){setError(e.message);}})
      .finally(()=>{if(current){setBusy(false);}});
    return ()=>{current=false;};
  },[request,open,refresh]);
  const change = event => setForm({...form,[event.target.name]:event.target.value});
  const submit = async event => {
    event.preventDefault();
    setBusy(true);setError('');setNotice('');
    try {
      await request(endpoint,{method:'POST',body:{...form,market:form.market.toUpperCase(),provider:'stripe',effectiveAt:form.effectiveAt+':00.000Z'}});
      setNotice('Sandbox collector scheduled.');setForm({...initial,market:form.market});setRefresh(n=>n+1);
    } catch (e) {setError(e.message);setBusy(false);}
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2><button type="button" className="text-xl font-semibold underline" aria-expanded={open}
      aria-controls="sandbox-collector-panel" onClick={()=>setOpen(!open)}>Sandbox payment collectors</button></h2>
    {open&&<div id="sandbox-collector-panel" className="mt-4 space-y-4">
      <p>Choose the Stripe account for new sandbox enrollments in a country. Existing subscriptions keep their receiving account.</p>
      <form onSubmit={submit}><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label>Country code<input className={field} required name="market" maxLength={2} pattern="[A-Za-z]{2}" value={form.market} onChange={change}/></label>
        <label>Stripe sandbox receiving account<input className={field} required name="receivingAccount" pattern="acct_[A-Za-z0-9]+" placeholder="acct_…" maxLength={128} value={form.receivingAccount} onChange={change}/></label>
        <label>Effective date and time (UTC)<input className={field} required type="datetime-local" name="effectiveAt" value={form.effectiveAt} onChange={change}/></label>
        <label>Approval reference<input className={field} required name="approvalReference" maxLength={250} value={form.approvalReference} onChange={change}/></label>
        <div><button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Schedule collector</button></div>
      </fieldset></form>
      {error&&<p role="alert">{error}</p>}
      <p role="status">{busy?'Loading or saving collector assignments…':notice}</p>
      {rows.length>0?<ul className="divide-y">{rows.map(row=><li key={row.id} className="py-2">
        <strong>{row.market} · {row.provider}</strong> · {row.receivingAccount}
        <p>{new Date(row.effectiveAt).toISOString().slice(0,16).replace('T',' ')} UTC · {row.approvalReference}</p>
      </li>)}</ul>:!busy&&!error&&<p>No sandbox collector assignments yet.</p>}
    </div>}
  </section>;
}
