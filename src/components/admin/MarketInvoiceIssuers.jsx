import React, {useEffect, useState} from 'react';
import {requestMssqlApi} from '../../services/mssqlApiClient';

const endpoint = '/api/management-billing/admin/issuer-assignments';
const inputStyle = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2';
const buttonStyle = 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const emptyDraft = {market:'', legalName:'', issuerCountry:''};
const utcLabel = instant => new Date(instant).toISOString().slice(0,16).replace('T',' ') + ' UTC';

export default function MarketInvoiceIssuers({request=requestMssqlApi}) {
  const [rows,setRows] = useState([]);
  const [draft,setDraft] = useState(emptyDraft);
  const [selected,setSelected] = useState('');
  const [date,setDate] = useState('');
  const [reference,setReference] = useState('');
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [reload,setReload] = useState(0);

  useEffect(()=>{
    let active=true;
    setBusy(true);
    setError('');
    request(endpoint).then(data=>{if(active){setRows(data);}})
      .catch(e=>{if(active){setError(e.message);}})
      .finally(()=>{if(active){setBusy(false);}});
    return ()=>{active=false;};
  },[request,reload]);

  const save = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const scheduling = event.currentTarget.name==='schedule';
    try {
      if(scheduling){
        await request(endpoint+'/'+selected+'/schedule',{method:'POST',body:{
          effectiveAt:new Date(date+'Z').toISOString(),approvalReference:reference
        }});
        setSelected('');
        setDate('');
        setReference('');
        setNotice('Issuer change scheduled.');
      } else {
        const result=await request(endpoint,{method:'POST',body:draft});
        setSelected(result.id);
        setDraft(emptyDraft);
        setNotice('Draft saved. You can schedule it when approved.');
      }
      setReload(value=>value+1);
    } catch(e){setError(e.message);setBusy(false);}
  };
  const drafts=rows.filter(row=>row.status==='Draft');
  return <section className="mx-auto mb-8 max-w-6xl px-4 sm:px-6" aria-labelledby="market-issuers">
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 id="market-issuers" className="text-xl font-semibold">Invoice issuers by market</h2>
      <p className="text-sm text-slate-600">Choose the legal entity that issues Quixo Homes subscription invoices for each market. Scheduling records the approved change. Moving existing subscriptions is a separate billing operation.</p>
      {error&&<p role="alert" className="text-red-800">{error} <button type="button" className="underline" disabled={busy} onClick={()=>setReload(value=>value+1)}>Reload assignments</button></p>}
      {notice&&<p role="status" className="text-teal-800">{notice}</p>}
      <form name="draft" onSubmit={save}>
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 font-semibold">Add an issuer assignment</legend>
          <label>Market country code<input className={inputStyle} required pattern="[A-Za-z]{2}" maxLength={2} placeholder="LK" value={draft.market} onChange={e=>setDraft({...draft,market:e.target.value.toUpperCase()})}/></label>
          <label>Registered company name<input className={inputStyle} required maxLength={200} value={draft.legalName} onChange={e=>setDraft({...draft,legalName:e.target.value})}/></label>
          <label>Issuer country code<input className={inputStyle} required pattern="[A-Za-z]{2}" maxLength={2} placeholder="US" value={draft.issuerCountry} onChange={e=>setDraft({...draft,issuerCountry:e.target.value.toUpperCase()})}/></label>
          <div><button type="submit" className={buttonStyle}>Save draft</button></div>
        </fieldset>
      </form>
      {drafts.length>0&&<form name="schedule" onSubmit={save}>
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 font-semibold">Schedule an approved change</legend>
          <label>Draft assignment<select className={inputStyle} required value={selected} onChange={e=>setSelected(e.target.value)}>
            <option value="">Select a draft</option>{drafts.map(row=><option key={row.id} value={row.id}>{row.market} · {row.legalName} ({row.issuerCountry})</option>)}
          </select></label>
          <label>Effective date and time (UTC)<input className={inputStyle} type="datetime-local" required value={date} onChange={e=>setDate(e.target.value)}/></label>
          <label>Approval reference<input className={inputStyle} maxLength={250} required value={reference} onChange={e=>setReference(e.target.value)}/></label>
          <div><button type="submit" className={buttonStyle}>Schedule issuer</button></div>
        </fieldset>
      </form>}
      <h3 className="font-semibold">Assignment history</h3>
      {busy&&<p role="status">Updating assignments…</p>}
      {!busy&&!error&&!rows.length&&<p>No issuer assignments yet.</p>}
      <ul className="divide-y">{rows.map(row=><li key={row.id} className="py-2">
        <strong>{row.market} · {row.legalName} ({row.issuerCountry})</strong>
        <p className="text-sm text-slate-600">{row.status}{row.effectiveAt&&' · '+utcLabel(row.effectiveAt)}{row.approvalReference&&' · '+row.approvalReference}</p>
      </li>)}</ul>
    </div>
  </section>;
}
