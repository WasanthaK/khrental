import {useEffect,useId,useRef,useState} from 'react';

const PropertyApplication=({enquiry,owner=false,call})=>{
  const [snapshot,setSnapshot]=useState({loaded:false,unavailable:false,application:null,canSubmit:false});
  const [draft,setDraft]=useState({moveInDate:'',occupants:1,termMonths:12,statement:'',consent:false});
  const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const alive=useRef(true),pending=useRef(null),hydrated=useRef(false),field=useId();
  const path='/'+enquiry.id+'/application';
  const receive=data=>{
    setSnapshot(previous=>(previous.application?.version??0)>(data.application?.version??0)
      ?previous:{...data,loaded:true,unavailable:false});
    if(!hydrated.current&&data.application){
      const a=data.application;setDraft({moveInDate:a.moveInDate,occupants:a.occupants,termMonths:a.termMonths,statement:a.statement,consent:false});
      hydrated.current=true;
    }
  };
  const refresh=async()=>{
    try{const data=await call({path});if(alive.current){receive(data);}}
    catch(err){if(alive.current){
      if(err.code==='APPLICATIONS_UNAVAILABLE'){setSnapshot({loaded:true,unavailable:true,application:null,canSubmit:false});}
      else{setError(err.message||'Unable to load application.');}
    }}
  };
  useEffect(()=>{
    alive.current=true;refresh();return()=>{alive.current=false;};
    // The parent keys this private component by identity/workspace and enquiry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[path]);
  const run=async action=>{
    if(busy){return;}setBusy(true);setError('');setNotice('');
    try{
      const body={action,version:snapshot.application?.version??0,
        ...(action==='submit'?{...draft,occupants:Number(draft.occupants),termMonths:Number(draft.termMonths)}:owner?{note}:{})};
      const key=JSON.stringify(body);
      if(pending.current?.key!==key){pending.current={key,id:crypto.randomUUID()};}
      const data=await call({path,method:'POST',body:{...body,requestId:pending.current.id}});
      if(!alive.current){return;}
      pending.current=null;receive(data);setDraft(old=>({...old,consent:false}));setNote('');
      setNotice(action==='withdraw'?'Application withdrawn. Existing records are retained for audit.':'Application updated. Check here for responses; no email was sent.');
      await refresh();
    }catch(err){if(alive.current){setError(err.message||'Unable to save application. Retry or refresh.');}}
    finally{if(alive.current){setBusy(false);}}
  };
  if(snapshot.unavailable){return null;}
  const application=snapshot.application;
  const open=['pending','responded'].includes(enquiry.status);
  const review=owner&&application&&['submitted','needs_information'].includes(application.status);
  const change=(name,value)=>setDraft(old=>({...old,[name]:value}));
  const button='border rounded px-3 py-2 disabled:opacity-50';
  return <section aria-label={'Application for '+enquiry.title} className="border-t pt-4 space-y-3">
    <h4 className="font-semibold">Rental application</h4>
    <p className="text-sm">An application and its review do not reserve the property, create a lease or confirm payment. Offers and reservations follow separately.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!snapshot.loaded&&!error&&<p role="status">Loading application…</p>}
    {snapshot.loaded&&(application?<div className="bg-slate-50 p-3 space-y-2">
      <p>Application status: <strong>{application.status.replace('_',' ')}</strong></p>
      <p>Proposed move-in: {application.moveInDate} · Occupants: {application.occupants} · Proposed term: {application.termMonths} months</p>
      <p className="whitespace-pre-wrap">{application.statement}</p>
      {application.note&&<p className="whitespace-pre-wrap">Owner review: {application.note}</p>}
      {application.status==='accepted'&&<p>Accepted for offer preparation. No property reservation or tenancy has been created.</p>}
    </div>:<p>No application submitted.</p>)}
    {snapshot.loaded&&!owner&&(!snapshot.canSubmit||!open)&&(!application||application.status==='needs_information')&&
      <p>Submission requires a completed viewing, an open enquiry and a currently available public listing. Refresh after the owner records the viewing outcome.</p>}
    {snapshot.loaded&&!owner&&snapshot.canSubmit&&open&&<form onSubmit={e=>{e.preventDefault();run('submit');}} className="space-y-3">
      <p>Share only the rental details requested here. Do not include identity documents, financial account details or sensitive personal information. Document uploads are not available in this step.</p>
      <label className="block" htmlFor={field+'-date'}>Proposed move-in date (property local date)</label>
      <input id={field+'-date'} type="date" required value={draft.moveInDate} disabled={busy}
        onChange={e=>change('moveInDate',e.target.value)} className="border rounded p-2" />
      <label className="block" htmlFor={field+'-occupants'}>Number of occupants</label>
      <input id={field+'-occupants'} type="number" min="1" max="50" required value={draft.occupants} disabled={busy}
        onChange={e=>change('occupants',e.target.value)} className="border rounded p-2 w-24" />
      <label className="block" htmlFor={field+'-term'}>Proposed rental term (months)</label>
      <input id={field+'-term'} type="number" min="1" max="120" required value={draft.termMonths} disabled={busy}
        onChange={e=>change('termMonths',e.target.value)} className="border rounded p-2 w-24" />
      <label className="block" htmlFor={field+'-statement'}>Rental plans and response to any owner questions</label>
      <textarea id={field+'-statement'} required maxLength={2000} value={draft.statement} disabled={busy}
        onChange={e=>change('statement',e.target.value)} className="block w-full border rounded p-2 min-h-24" />
      <label className="flex gap-2"><input type="checkbox" required checked={draft.consent} disabled={busy}
        onChange={e=>change('consent',e.target.checked)} />I agree to share this application with the property's owner workspace for rental review, linked to my verified enquiry identity.</label>
      <button type="submit" disabled={busy||!draft.consent||!draft.statement.trim()} className={button}>
        {application?'Resubmit application':'Submit application'}</button>
    </form>}
    {snapshot.loaded&&review&&<div className="space-y-3">
      <label className="block" htmlFor={field+'-note'}>Review note for the applicant</label>
      <textarea id={field+'-note'} maxLength={2000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} className="block w-full border rounded p-2" />
      <div className="flex flex-wrap gap-3">
        {open&&application.status==='submitted'&&<>
          <button disabled={busy||!note.trim()} className={button} onClick={()=>run('needs_information')}>Request application information</button>
          <button disabled={busy||!note.trim()} className={button} onClick={()=>run('accept')}>Accept for offer preparation</button>
        </>}
        <button disabled={busy||!note.trim()} className={button} onClick={()=>run('decline')}>Decline application</button>
      </div>
    </div>}
    <div className="flex flex-wrap gap-3">
      {snapshot.loaded&&!owner&&application&&['submitted','needs_information','accepted'].includes(application.status)&&
        <button disabled={busy} className={button} onClick={()=>run('withdraw')}>Withdraw application</button>}
      <button disabled={busy} className="underline" onClick={()=>{setError('');refresh();}}>Refresh application</button>
    </div>
  </section>;
};
export default PropertyApplication;
