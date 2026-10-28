import {useEffect,useId,useRef,useState} from 'react';
import {viewingZone,viewingLocalToUtc,viewingTimeLabel} from '../../utils/viewingTime.js';

const PropertyViewing=({enquiry,owner=false,call})=>{
  const [snapshot,setSnapshot]=useState({loaded:false,unavailable:false,viewing:null});
  const [date,setDate]=useState(''),[minutes,setMinutes]=useState('60'),[instructions,setInstructions]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const alive=useRef(true),pending=useRef(null);
  const field=useId();
  const path='/'+enquiry.id+'/viewing';
  const zone=viewingZone(enquiry.country);
  const refresh=async()=>{
    try {
      const viewing=await call({path});
      if(alive.current){setSnapshot({loaded:true,unavailable:false,viewing});}
    } catch(err) {
      if(alive.current){
        if(err.code==='VIEWINGS_UNAVAILABLE'){setSnapshot({loaded:true,unavailable:true,viewing:null});}
        else {setError(err.message||'Unable to load viewing.');}
      }
    }
  };
  useEffect(()=>{
    alive.current=true;refresh();
    return()=>{alive.current=false;};
    // The parent keys this private component by identity/workspace + enquiry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[path]);
  const run=async action=>{
    if(busy){return;}
    setError('');setNotice('');setBusy(true);
    try {
      const body={action,version:snapshot.viewing?.version??0};
      if(['request','propose'].includes(action)){
        body.startsAt=viewingLocalToUtc(date,enquiry.country);
        body.endsAt=new Date(Date.parse(body.startsAt)+Number(minutes)*60000).toISOString();
      }
      if(owner&&['confirm','propose'].includes(action)){body.instructions=instructions;}
      const key=JSON.stringify(body);
      if(pending.current?.key!==key){pending.current={key,id:crypto.randomUUID()};}
      const viewing=await call({path,method:'POST',body:{...body,requestId:pending.current.id}});
      if(!alive.current){return;}
      pending.current=null;setInstructions('');
      setSnapshot({loaded:true,unavailable:false,viewing});
      setNotice('Viewing updated. Check this page for changes; no email was sent.');
      await refresh();
    } catch(err){if(alive.current){setError(err.message||'Unable to update viewing. Retry or refresh.');}}
    finally {if(alive.current){setBusy(false);}}
  };
  if(snapshot.unavailable||!zone){return null;}
  const viewing=snapshot.viewing;
  const active=['requested','proposed','confirmed'].includes(viewing?.status);
  const open=['pending','responded'].includes(enquiry.status);
  const canSchedule=open&&(!viewing||active||viewing.status==='cancelled');
  const button='border rounded px-3 py-2 disabled:opacity-50';
  return <section aria-label={'Viewing for '+enquiry.title} className="border-t pt-4 space-y-3">
    <h4 className="font-semibold">Viewing appointment</h4>
    <p className="text-sm">Times are in {zone}. A viewing does not reserve the property. Check here for confirmation and changes.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!snapshot.loaded&&!error&&<p role="status">Loading viewing…</p>}
    {snapshot.loaded&&(viewing?<div className="bg-slate-50 p-3 space-y-2">
      <p>Viewing status: <strong>{viewing.status.replace('_',' ')}</strong></p>
      <p>{viewingTimeLabel(viewing.startsAt,zone)} – {viewingTimeLabel(viewing.endsAt,zone)} ({zone})</p>
      {viewing.instructions&&<p className="whitespace-pre-wrap">Meeting instructions: {viewing.instructions}</p>}
      {viewing.status==='proposed'&&!owner&&<p>The owner proposed this time. Accept it to confirm the appointment.</p>}
    </div>:<p>No viewing appointment requested.</p>)}
    {snapshot.loaded&&owner&&open&&canSchedule&&<label className="block" htmlFor={field+'-instructions'}>
      Private meeting instructions (shared with this seeker only after confirmation)
      <textarea id={field+'-instructions'} maxLength={500} disabled={busy} value={instructions}
        onChange={e=>setInstructions(e.target.value)} className="block w-full border rounded p-2" />
    </label>}
    {snapshot.loaded&&canSchedule&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();run(owner?'propose':'request');}}>
      <label className="block" htmlFor={field+'-date'}>{viewing?'Request a different time':'Preferred date and time'} ({zone})</label>
      <input id={field+'-date'} required type="datetime-local" value={date} disabled={busy}
        onChange={e=>setDate(e.target.value)} className="border rounded p-2 block max-w-full" />
      <label className="block" htmlFor={field+'-duration'}>Duration</label>
      <select id={field+'-duration'} disabled={busy} value={minutes} onChange={e=>setMinutes(e.target.value)} className="border rounded p-2">
        {[15,30,45,60,90,120,180].map(n=><option key={n} value={n}>{n} minutes</option>)}
      </select>
      <button type="submit" disabled={busy||!date} className={button}>{owner?'Propose viewing time':'Request viewing time'}</button>
    </form>}
    <div className="flex flex-wrap gap-3">
      {snapshot.loaded&&open&&owner&&viewing?.status==='requested'&&<button disabled={busy} className={button} onClick={()=>run('confirm')}>Confirm requested time</button>}
      {snapshot.loaded&&open&&!owner&&viewing?.status==='proposed'&&<button disabled={busy} className={button} onClick={()=>run('accept')}>Accept proposed time</button>}
      {snapshot.loaded&&active&&<button disabled={busy} className={button} onClick={()=>run('cancel')}>Cancel viewing</button>}
      {snapshot.loaded&&owner&&viewing?.status==='confirmed'&&new Date(viewing.endsAt)<=new Date()&&<>
        <button disabled={busy} className={button} onClick={()=>run('complete')}>Mark viewing completed</button>
        <button disabled={busy} className={button} onClick={()=>run('no_show')}>Record no-show</button>
      </>}
      <button type="button" disabled={busy} className="underline" onClick={()=>{setError('');refresh();}}>Refresh viewing</button>
    </div>
    {!open&&active&&<p className="text-sm">This enquiry is closed. Cancel the appointment separately if it will no longer take place.</p>}
  </section>;
};
export default PropertyViewing;
