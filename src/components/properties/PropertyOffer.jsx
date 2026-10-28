import {useEffect,useId,useRef,useState} from 'react';
import {viewingLocalToUtc,viewingTimeLabel,viewingZone} from '../../utils/viewingTime.js';

const PropertyOffer=({enquiry,owner=false,call})=>{
  const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [draft,setDraft]=useState({unitId:'',rent:'',deposit:'0',fees:'0',startDate:'',endDate:'',terms:'',offerUntil:'',holdUntil:''});
  const [consent,setConsent]=useState(false),[templateId,setTemplateId]=useState('');
  const alive=useRef(true),pending=useRef(null),field=useId();
  const path='/'+enquiry.id+'/offer';
  const receive=value=>setData(previous=>(previous?.offer?.version??0)>(value?.offer?.version??0)?previous:value);
  const refresh=async()=>{
    try{const value=await call({path});if(alive.current){receive(value);}}
    catch(err){if(alive.current){if(err.code==='RENTAL_OFFERS_UNAVAILABLE'){setData({unavailable:true});}else{setError(err.message||'Unable to load rental offer.');}}}
  };
  useEffect(()=>{alive.current=true;refresh();return()=>{alive.current=false;};
    // The parent keys this private component by identity/workspace and enquiry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[path]);
  const run=async action=>{
    if(busy){return;}setBusy(true);setError('');setNotice('');
    try{
      const body={action,version:data?.offer?.version??0,
        ...(action==='issue'?{...draft,unitId:draft.unitId||null,applicationVersion:data.applicationVersion,
          offerUntil:viewingLocalToUtc(draft.offerUntil,enquiry.country),holdUntil:viewingLocalToUtc(draft.holdUntil,enquiry.country)}:{}),
        ...(action==='accept'?{consent}:{}),...(action==='agreement'?{templateId}:{})};
      const key=JSON.stringify(body);
      if(pending.current?.key!==key){pending.current={key,id:crypto.randomUUID()};}
      const value=await call({path,method:'POST',body:{...body,requestId:pending.current.id}});
      if(!alive.current){return;}pending.current=null;receive(value);setConsent(false);
      // Exact retries return current state, which may have changed since the
      // original request. The receipt below, not the attempted action, is truth.
      setNotice('Your request was recorded. Check the current offer and agreement status below.');
    }catch(err){if(alive.current){setError(err.message||'Unable to update rental offer. Refresh or retry.');}}
    finally{if(alive.current){setBusy(false);}}
  };
  if(data?.unavailable){return null;}
  const offer=data?.offer,active=data?.agreement?.status==='active';
  const zone=viewingZone(enquiry.country);
  const label=value=>zone?viewingTimeLabel(value,zone)+' ('+zone+')':new Date(value).toISOString();
  const update=(key,value)=>setDraft(old=>({...old,[key]:value}));
  const button='border rounded px-3 py-2 disabled:opacity-50';
  return <section aria-label={'Rental offer for '+enquiry.title} className="border-t pt-4 space-y-3">
    <h4 className="font-semibold">Rental offer and reservation</h4>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!data&&!error&&<p role="status">Loading rental offer…</p>}
    {data&&!offer&&<p>No rental offer issued. An accepted application is required.</p>}
    {offer&&<div className="rounded bg-slate-50 p-3 space-y-2">
      <p>Offer version {offer.version} · <strong>{offer.status}</strong> · {offer.unitLabel||'Whole property'}</p>
      <p>Monthly rent: {offer.currency} {offer.rent} · Security deposit: {offer.currency} {offer.deposit} · Other fees: {offer.currency} {offer.fees}</p>
      <p>Rental dates: {offer.startDate} to {offer.endDate} (property local dates)</p>
      <p className="whitespace-pre-wrap break-words">{offer.terms}</p>
      <p>Accept before {label(offer.offerUntil)}. If accepted, reservation ends {label(offer.holdUntil)}.</p>
      <p>Expiry or withdrawal releases the reservation. No automatic extension. Signature, deposit evidence, move-in checks and explicit activation are separate.</p>
      {data.agreement&&<p>Agreement: {data.agreement.status} · Signature: {data.agreement.signatureStatus||'not recorded'}</p>}
      {active&&<p>Tenancy activated by the owner.</p>}
    </div>}
    {data?.actionsEnabled&&owner&&data.applicationAccepted&&!offer?.agreementId&&!['accepted','agreement'].includes(offer?.status)&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();run('issue');}}>
      <p>Issue exact terms for the accepted application. A replacement offer requires fresh seeker acceptance. All deadline times below use {zone}.</p>
      <label className="block" htmlFor={field+'-unit'}>Dwelling</label>
      <select id={field+'-unit'} disabled={busy} value={draft.unitId} onChange={e=>update('unitId',e.target.value)} className="border rounded p-2">
        <option value="">Whole property</option>{data.units?.map(u=><option key={u.id} value={u.id}>{u.label}</option>)}
      </select>
      {[['rent','Monthly rent','number'],['deposit','Security deposit','number'],['fees','Other fees (enter 0 if none)','number'],
        ['startDate','Rental start date','date'],['endDate','Rental end date','date'],['offerUntil','Offer acceptance deadline','datetime-local'],['holdUntil','Reservation deadline after acceptance','datetime-local']].map(([key,text,type])=><div key={key}>
        <label className="block" htmlFor={field+'-'+key}>{text}</label>
        <input id={field+'-'+key} type={type} required step={type==='number'?'0.01':undefined} min={type==='number'?'0':undefined}
          value={draft[key]} disabled={busy} onChange={e=>update(key,e.target.value)} className="border rounded p-2 w-full max-w-sm" />
      </div>)}
      <label className="block" htmlFor={field+'-terms'}>Terms, fees and reservation expiry conditions</label>
      <textarea id={field+'-terms'} required maxLength={8000} value={draft.terms} disabled={busy} onChange={e=>update('terms',e.target.value)} className="border rounded p-2 w-full min-h-28" />
      <button disabled={busy} type="submit" className={button}>Issue rental offer</button>
    </form>}
    {data?.actionsEnabled&&!owner&&offer?.status==='offered'&&<div className="space-y-3">
      <label className="flex gap-2"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)} />
        I accept these exact rental terms and deadlines. I agree that preparing the agreement will link my existing verified account to this owner workspace with renter access. I will review and sign the agreement separately.</label>
      <button className={button} disabled={busy||!consent} onClick={()=>run('accept')}>Accept offer and reserve</button>{' '}
      <button className={button} disabled={busy} onClick={()=>run('decline')}>Decline rental offer</button>
    </div>}
    {data?.actionsEnabled&&owner&&offer?.status==='accepted'&&<div className="space-y-3">
      <label className="block" htmlFor={field+'-template'}>Agreement template</label>
      <select id={field+'-template'} value={templateId} disabled={busy} onChange={e=>setTemplateId(e.target.value)} className="border rounded p-2">
        <option value="">Select template</option>{data.templates?.map(t=><option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
      </select>
      <button className={button} disabled={busy||!templateId} onClick={()=>run('agreement')}>Prepare agreement for existing account</button>
    </div>}
    {offer?.agreementId&&<div className="flex flex-wrap gap-4">
      {owner?<><a className="underline" href={'/dashboard/agreements/'+offer.agreementId}>Review agreement and arrange signing</a>
        <a className="underline" href={'/dashboard/agreements/'+offer.agreementId+'/onboarding'}>Deposit, move-in checks and activation</a></>:
        <a className="underline" href="/rentee/agreements">Open my agreements and signing status</a>}
    </div>}
    <div className="flex flex-wrap gap-4">
      {!active&&['offered','accepted','agreement'].includes(offer?.status)&&<button className={button} disabled={busy} onClick={()=>run('withdraw')}>Withdraw offer or reservation</button>}
      <button className="underline" disabled={busy} onClick={()=>{setError('');refresh();}}>Refresh rental offer</button>
    </div>
  </section>;
};
export default PropertyOffer;
