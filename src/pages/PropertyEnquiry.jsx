import PropertyApplication from '../components/properties/PropertyApplication';
import PropertyViewing from '../components/properties/PropertyViewing';
import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../hooks/useAuth';
import {getPlatformClient} from '../services/platformClient';
import {requestSeekerEnquiries} from '../services/seekerContextClient';
import {enquiryReturnPath,enquiryLoginSearch} from '../utils/enquiryReturnPath.js';
import {isPropertyEnquiriesEnabled} from '../utils/env.js';

const call = options => requestSeekerEnquiries({
  getSession:()=>getPlatformClient().auth.getSession(),...options
});
const PropertyEnquiry=()=>{
  const location=useLocation();
  const {user,isAuthenticated,loading,logout}=useAuth();
  const route=enquiryReturnPath(location.search);
  const params=new URLSearchParams(route?.split('?')[1]);
  const listingId=params.get('listingId'),country=params.get('country');
  const [listing,setListing]=useState(null);
  const [items,setItems]=useState([]);
  const [message,setMessage]=useState('');
  const [consent,setConsent]=useState(false);
  const [state,setState]=useState({ready:false,busy:false,error:'',notice:''});
  const [offset,setOffset]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const requestId=useRef(crypto.randomUUID());
  const identity=String(user?.id||'');
  const currentIdentity=useRef(identity);
  currentIdentity.current=identity;
  const [loadedFor,setLoadedFor]=useState(null);
  const personalReady=state.ready && isAuthenticated && loadedFor===identity;
  const enabled=isPropertyEnquiriesEnabled();
  useEffect(()=>{
    setMessage('');setConsent(false);requestId.current=crypto.randomUUID();
    setState(s=>({...s,error:'',notice:''}));
  },[route]);
  useEffect(()=>{
    let active=true;
    setListing(null);
    if (!enabled || !route) {return ()=>{active=false;};}
    fetch('/api/public-listings/'+listingId+'?country='+country,{cache:'no-store',credentials:'omit'})
      .then(async r=>{if(!r.ok){throw new Error('This property is no longer publicly available.');} return r.json();})
      .then(result=>{if(active){setListing(result.data);}})
      .catch(err=>{if(active){setState(s=>({...s,error:err.message}));}});
    return ()=>{active=false;};
  },[route,listingId,country,enabled]);
  useEffect(()=>{
    let active=true;
    setItems([]);setHasMore(false);setLoadedFor(null);setState({ready:false,busy:false,error:'',notice:''});
    setMessage('');setConsent(false);requestId.current=crypto.randomUUID();
    if (!enabled || loading || !isAuthenticated) {return ()=>{active=false;};}
    call({path:'?offset='+offset}).then(data=>{
      if(active){setItems(data.items);setHasMore(data.hasMore);setLoadedFor(identity);setState(s=>({...s,ready:true}));}
    }).catch(err=>{if(active){setState(s=>({...s,error:err.message}));}});
    return ()=>{active=false;};
  },[identity,isAuthenticated,loading,offset,enabled]);
  const refresh=async()=>{
    const actorAtStart=identity;
    const data=await call({path:'?offset='+offset});
    if(currentIdentity.current!==actorAtStart){return;}
    setItems(data.items);setHasMore(data.hasMore);
  };
  const submit=async e=>{
    e.preventDefault();setState(s=>({...s,busy:true,error:'',notice:''}));
    try {
      await call({method:'POST',body:{listingId,country,message,consent,requestId:requestId.current}});
      if(currentIdentity.current!==identity){return;}
      setMessage('');setConsent(false);requestId.current=crypto.randomUUID();
      setState(s=>({...s,notice:'Your enquiry was saved in the owner’s inbox. It does not reserve the property or confirm a viewing.'}));
      await refresh();
    } catch(err) {if(currentIdentity.current===identity){setState(s=>({...s,error:err.message}));}}
    finally {if(currentIdentity.current===identity){setState(s=>({...s,busy:false}));}}
  };
  const withdraw=async item=>{
    setState(s=>({...s,busy:true,error:'',notice:''}));
    try {
      await call({path:'/'+item.id,method:'PATCH',body:{status:'withdrawn',version:item.version}});
      if(currentIdentity.current!==identity){return;}
      setState(s=>({...s,notice:'Enquiry withdrawn.'}));await refresh();
    } catch(err) {if(currentIdentity.current===identity){setState(s=>({...s,error:err.message}));}}
    finally {if(currentIdentity.current===identity){setState(s=>({...s,busy:false}));}}
  };
  if (!enabled) {return <main className="p-8"><h1>Property enquiries</h1><p>Property enquiries are not open yet.</p></main>;}
  return <main className="min-h-screen bg-slate-50 px-4 py-10">
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="font-semibold text-emerald-700">Quixo.Homes</p>
      <h1 className="text-3xl font-semibold text-slate-900">{route?'Property enquiry':'My property enquiries'}</h1>
      {isAuthenticated && <button type="button" disabled={state.busy} className="underline text-blue-800"
        onClick={async()=>{try{await logout();}catch{setState(s=>({...s,error:'Unable to sign out. Try again.'}));}}}>Sign out</button>}
      {!route && <p>Choose a property from the rental website to start a new enquiry. Your existing enquiries and owner replies appear below after sign-in.</p>}
      {route && <a className="underline text-blue-800" href={'https://quixo.homes/'+country.toLowerCase()+'/property/?id='+listingId}>Back to property</a>}
      {listing && <section className="rounded-xl bg-white border p-6">
        <h2 className="text-xl font-semibold">{listing.title}</h2>
        <p>{listing.location}</p>
        <p className="mt-2 text-sm">Ask about availability or request a viewing. Do not include identification documents, payment details or sensitive personal information.</p>
      </section>}
      {loading ? <p role="status">Checking your account…</p> : !isAuthenticated ?
        <p><Link className="underline text-blue-800" to={'/login'+enquiryLoginSearch(location.search)}>Sign in to enquire about this property</Link>. A verified personal seeker account is required.</p> : null}
      {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
      {state.notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{state.notice}</p>}
      {personalReady && listing && <form onSubmit={submit} className="rounded-xl bg-white border p-6 space-y-4">
        <label className="block">Message
          <textarea required maxLength={2000} value={message} disabled={state.busy}
            onChange={e=>{setMessage(e.target.value);requestId.current=crypto.randomUUID();}}
            className="block w-full min-h-32 border rounded p-3 mt-2" />
        </label>
        <label className="flex gap-3 items-start"><input type="checkbox" required checked={consent} disabled={state.busy}
          onChange={e=>{setConsent(e.target.checked);requestId.current=crypto.randomUUID();}} />
          <span>I agree to share my account name, verified email and this message with the property’s owner workspace so they can respond to this enquiry.</span>
        </label>
        <button disabled={state.busy||!message.trim()||!consent} className="bg-blue-900 text-white rounded px-4 py-3 disabled:opacity-50">
          {state.busy?'Saving…':'Send enquiry'}</button>
      </form>}
      {personalReady && <section aria-labelledby="my-enquiries" className="space-y-4">
        <h2 id="my-enquiries" className="text-xl font-semibold">My enquiries</h2>
        {!items.length && <p>No enquiries on this page.</p>}
        {items.map(item=><article key={item.id} className="rounded-xl border bg-white p-5 space-y-2">
          <h3 className="font-semibold">{item.title}</h3><p>Status: {item.status}</p>
          <p className="whitespace-pre-wrap">{item.message}</p>
          {item.response && <div className="bg-slate-50 p-3"><h4 className="font-semibold">Owner response</h4><p className="whitespace-pre-wrap">{item.response}</p></div>}
          <p className="text-sm text-slate-600">Submitted {new Date(item.createdAt).toLocaleString()}</p>
          {['pending','responded'].includes(item.status) && <button disabled={state.busy} className="underline text-red-800" onClick={()=>withdraw(item)}>Withdraw enquiry</button>}
          <PropertyViewing key={identity+':'+item.id} enquiry={item} call={call} />
          <PropertyApplication key={'application:'+identity+':'+item.id} enquiry={item} call={call} />
        </article>)}
        <div className="flex gap-4"><button disabled={offset===0||state.busy} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button>
          <button disabled={!hasMore||state.busy} onClick={()=>setOffset(n=>n+50)}>Next</button>
          <button disabled={state.busy} onClick={()=>refresh().catch(err=>setState(s=>({...s,error:err.message})))}>Refresh responses</button></div>
      </section>}
    </div>
  </main>;
};
export default PropertyEnquiry;
