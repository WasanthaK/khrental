import PropertyOffer from '../components/properties/PropertyOffer';
import PropertyApplication from '../components/properties/PropertyApplication';
import PropertyViewing from '../components/properties/PropertyViewing';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../hooks/useAuth';
import {requestMssqlApi} from '../services/mssqlApiClient';

const viewingCall=async({path,method='GET',body})=>{
  const result=await requestMssqlApi('/api/owner-enquiries'+path,{method,body});
  // The shared transport preserves an envelope when its data is null.
  return result?.data===null?null:result;
};
const OwnerEnquiries=()=>{
  const {activeTenantId}=useAuth();
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState('');
  const [drafts,setDrafts]=useState({}),[busy,setBusy]=useState(false),[offset,setOffset]=useState(0);
  const [notice,setNotice]=useState('');
  useEffect(()=>{setOffset(0);setDrafts({});setNotice('');},[activeTenantId]);
  useEffect(()=>{
    let active=true;setSnapshot(null);setError('');setDrafts({});
    requestMssqlApi('/api/owner-enquiries?offset='+offset)
      .then(data=>{if(active){setSnapshot({tenantId:activeTenantId,...data});}})
      .catch(err=>{if(active){setError(err.message||'Unable to load enquiries.');}});
    return ()=>{active=false;};
  },[activeTenantId,offset]);
  const save=async(item,status)=>{
    const tenantAtStart=activeTenantId;
    setBusy(true);setError('');setNotice('');
    try {
      await requestMssqlApi('/api/owner-enquiries/'+item.id,{method:'PATCH',body:{
        status,response:drafts[item.id]??item.response??'',version:item.version
      }});
      const data=await requestMssqlApi('/api/owner-enquiries?offset='+offset);
      setSnapshot({tenantId:tenantAtStart,...data});
      setNotice('Enquiry updated. The seeker can read the response in their enquiries. No email was sent.');
    } catch(err) {setError(err.message||'Unable to update enquiry.');}
    finally {setBusy(false);}
  };
  // A response for a previous workspace must never be painted in the new one.
  const current=snapshot?.tenantId===activeTenantId?snapshot:null;
  return <section className="max-w-4xl mx-auto p-4 space-y-5">
    <h1 className="text-3xl font-semibold">Property enquiries</h1>
    <p>Messages from verified seekers about your publicly listed properties. Enquiries do not reserve properties or confirm viewings.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!current&&!error&&<p role="status">Loading enquiries…</p>}
    {current?.items.length===0&&<p>No enquiries on this page.</p>}
    {current?.items.map(item=><article key={item.id} className="rounded-xl bg-white border p-5 space-y-3">
      <h2 className="text-xl font-semibold"><Link to={'/dashboard/properties/'+item.propertyId} className="underline">{item.title}</Link></h2>
      <p>{item.seekerName} · {item.seekerEmail}</p><p>Status: {item.status}</p>
      <p className="whitespace-pre-wrap">{item.message}</p>
      <p className="text-sm text-slate-600">Submitted {new Date(item.createdAt).toLocaleString()}</p>
      {['pending','responded'].includes(item.status)?<>
        <label className="block">Response
          <textarea maxLength={2000} disabled={busy} className="block border rounded p-3 w-full min-h-24 mt-1"
            value={drafts[item.id]??item.response??''} onChange={e=>setDrafts(old=>({...old,[item.id]:e.target.value}))} />
        </label>
        <div className="flex gap-4"><button disabled={busy||!(drafts[item.id]??item.response??'').trim()} onClick={()=>save(item,'responded')} className="bg-blue-900 text-white rounded px-4 py-2 disabled:opacity-50">Save response</button>
          <button disabled={busy} onClick={()=>save(item,'closed')} className="border rounded px-4 py-2">Close enquiry</button></div>
      </>:item.response&&<p className="whitespace-pre-wrap">{item.response}</p>}
      <PropertyViewing key={activeTenantId+':'+item.id} enquiry={item} owner call={viewingCall} />
      <PropertyApplication key={'application:'+activeTenantId+':'+item.id} enquiry={item} owner call={viewingCall} />
      <PropertyOffer key={'offer:'+activeTenantId+':'+item.id} enquiry={item} owner call={viewingCall} />
    </article>)}
    <div className="flex gap-4"><button disabled={offset===0||busy} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button>
      <button disabled={!current?.hasMore||busy} onClick={()=>setOffset(n=>n+50)}>Next</button></div>
  </section>;
};
export default OwnerEnquiries;
