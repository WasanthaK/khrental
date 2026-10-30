import SeekerLayout from '../components/layouts/SeekerLayout';
import PropertyOffer from '../components/properties/PropertyOffer';
import PropertyApplication from '../components/properties/PropertyApplication';
import PropertyViewing from '../components/properties/PropertyViewing';
import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../hooks/useAuth';
import {getPlatformClient} from '../services/platformClient';
import {requestSeekerEnquiries} from '../services/seekerContextClient';
import {enquiryReturnPath,enquiryLoginSearch} from '../utils/enquiryReturnPath.js';
import {publicListingPhoto,publicListingRent} from '../utils/publicListingPresentation.js';
import {isPropertyEnquiriesEnabled} from '../utils/env.js';

const call = options => requestSeekerEnquiries({
  getSession:()=>getPlatformClient().auth.getSession(),...options
});
const PropertyEnquiry=()=>{
  const location=useLocation();
  const {user,isAuthenticated,loading}=useAuth();
  const route=enquiryReturnPath(location.search);
  const params=new URLSearchParams(route?.split('?')[1]);
  const listingId=params.get('listingId'),country=params.get('country');
  const [listing,setListing]=useState(null);
  const [listingError,setListingError]=useState('');
  const [listingAttempt,setListingAttempt]=useState(0);
  const [photoFailed,setPhotoFailed]=useState(false);
  const photo=publicListingPhoto(listing);
  const rent=publicListingRent(listing);
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
    setListing(null);setListingError('');setPhotoFailed(false);
    if (!enabled || !route) {return ()=>{active=false;};}
    fetch('/api/public-listings/'+listingId+'?country='+country,{cache:'no-store',credentials:'omit'})
      .then(async r=>{if(!r.ok){throw Object.assign(new Error('Public listing unavailable'),{unavailable:r.status===404});} return r.json();})
      .then(result=>{if(!result?.data||String(result.data.id).toLowerCase()!==listingId||result.data.country!==country){throw new Error('Invalid public listing');}if(active){setListing(result.data);}})
      .catch(err=>{if(active){setListingError(err.unavailable?'This property is no longer publicly available.':'We couldn’t load this property. Please try again.');}});
    return ()=>{active=false;};
  },[route,listingId,country,enabled,listingAttempt]);
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
      setState(s=>({...s,notice:'Your enquiry was sent to the owner. You’ll see their reply in My enquiries. This does not reserve the property or confirm a viewing.'}));
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
  return <SeekerLayout active="enquiries">
    <div className="space-y-6">
      <div className={'seeker-page-heading'+(route?' enquiry-heading':'')}><div>
        {!route && <p className="seeker-kicker">Conversations & viewings</p>}
        {route && <a className="seeker-text-link enquiry-back" href={'https://quixo.homes/'+country.toLowerCase()+'/property/?id='+listingId}>← Back to property details</a>}
        <h1>{route?'Express your interest':'My enquiries'}</h1>
        <p className="seeker-intro">{route?'Contact the owner about this rental.':'Your conversations, viewing appointments and applications, all in one place.'}</p>
      </div>{!route && <Link to="/seeker#browse-rentals" className="seeker-button">Find a rental</Link>}</div>
      {state.error && <p role="alert" className="seeker-alert">{state.error}</p>}
      {state.notice && <p role="status" className="enquiry-success">{state.notice}</p>}
      {route && <div className="enquiry-compose">
        <section className={'enquiry-property'+(listing?' enquiry-property-ready':'')} aria-label="Selected property">
          {listing ? <>
            {photo&&!photoFailed ? <img className="enquiry-photo" src={photo.src} alt={photo.alt}
              width="720" height="480" referrerPolicy="no-referrer" onError={()=>setPhotoFailed(true)} />
              : <div className="enquiry-photo enquiry-photo-empty">Photo unavailable</div>}
            <div className="enquiry-property-copy">
              <p className="seeker-kicker">Your selected property</p>
              <h2>{listing.title}</h2>
              <p className="enquiry-location">{listing.location}</p>
              <p className="enquiry-rent">{rent ? <>{rent}<span> / month</span></>:'Ask the owner about rent'}</p>
              <a className="seeker-text-link" href={'https://quixo.homes/'+country.toLowerCase()+'/property/?id='+listingId}>View property details</a>
            </div>
          </> : <div className="enquiry-property-copy">
            {listingError ? <><h2>Property unavailable</h2><p role="alert">{listingError}</p>
              <button type="button" className="seeker-text-link" onClick={()=>setListingAttempt(n=>n+1)}>Try loading again</button>
              <a className="seeker-text-link enquiry-browse" href={'https://quixo.homes/'+country.toLowerCase()+'/search/'}>Browse other rentals</a></>
              : <p role="status">Loading your selected property…</p>}
          </div>}
        </section>
        <div className="enquiry-contact">
          {listing && (loading ? <p role="status">Checking your account…</p> : !isAuthenticated ?
            <section className="enquiry-form"><h2>Contact the owner</h2><p>Sign in or create a free account to send your message. Your selected property will be kept.</p>
              <Link className="seeker-button" to={'/login'+enquiryLoginSearch(location.search)}>Sign in to contact the owner</Link>
              <Link className="seeker-text-link enquiry-browse" to={'/seeker-sign-up'+enquiryLoginSearch(location.search)}>create your free account</Link>
            </section> : !personalReady&&!state.error ? <p role="status">Loading your enquiries…</p> : null)}
          {personalReady && listing && <form onSubmit={submit} className="enquiry-form" aria-labelledby="enquiry-message-title">
            <h2 id="enquiry-message-title">What would you like to know?</h2>
            <p id="enquiry-message-help">Ask about availability, viewing times or any details you’d like the owner to clarify.</p>
            <label htmlFor="enquiry-message">Your message</label>
            <textarea id="enquiry-message" required maxLength={2000} rows={4} value={message} disabled={state.busy}
              aria-describedby="enquiry-message-help enquiry-message-limit"
              placeholder="Hi, I’m interested in this property. Is it still available, and when could I view it?"
              onChange={e=>{setMessage(e.target.value);requestId.current=crypto.randomUUID();}} />
            <p id="enquiry-message-limit" className="enquiry-hint">{message.length.toLocaleString()} / 2,000 characters · Keep payment details and personal documents out of your message.</p>
            <label className="enquiry-consent"><input type="checkbox" required checked={consent} disabled={state.busy}
              onChange={e=>{setConsent(e.target.checked);requestId.current=crypto.randomUUID();}} />
              <span>I agree to share my name, verified email and this message with the property owner so they can reply.</span>
            </label>
            <button type="submit" disabled={state.busy||!message.trim()||!consent} className="seeker-button enquiry-send">
              {state.busy?'Sending…':'Send enquiry'}</button>
            <p className="enquiry-hint enquiry-next">The owner can reply here in My enquiries. Sending a message does not reserve this property or confirm a viewing.</p>
          </form>}
        </div>
      </div>}
      {!route && (loading ? <p role="status">Checking your account…</p> : !isAuthenticated ? <p><Link className="seeker-text-link" to="/login">Sign in to see your enquiries</Link> or <Link className="seeker-text-link" to="/seeker-sign-up">create your free account</Link>.</p> : null)}
      {personalReady && (!route||items.length>0||offset>0) && <section aria-labelledby="my-enquiries" className="space-y-4">
        {(!route||items.length>0||offset>0) && <h2 id="my-enquiries" className="text-xl font-semibold">{route?'Your enquiries':'Your conversations'}</h2>}
        {!items.length && (!route||offset>0) && <div className="seeker-empty">
          <div className="seeker-empty-icon" aria-hidden="true">↗</div>
          <h3>{offset>0?'You’ve reached the end':'Your next place starts with a conversation'}</h3>
          <p>{offset>0?'Go back to see your earlier enquiries.':route?'Send your message above. The owner’s reply and viewing details will appear here.':'Find a rental you like and choose “Express your interest” on its listing. You can ask a question or arrange a viewing with the owner.'}</p>
          {!route && offset===0 && <Link className="seeker-button" to="/seeker#browse-rentals">Browse rentals</Link>}
        </div>}
        {items.map(item=><article key={item.id} className="rounded-xl border bg-white p-5 space-y-2">
          <h3 className="font-semibold">{item.title}</h3><p>Status: {item.status}</p>
          <p className="whitespace-pre-wrap">{item.message}</p>
          {item.response && <div className="bg-slate-50 p-3"><h4 className="font-semibold">Owner response</h4><p className="whitespace-pre-wrap">{item.response}</p></div>}
          <p className="text-sm text-slate-600">Submitted {new Date(item.createdAt).toLocaleString()}</p>
          {['pending','responded'].includes(item.status) && <button disabled={state.busy} className="underline text-red-800" onClick={()=>withdraw(item)}>Withdraw enquiry</button>}
          <PropertyViewing key={identity+':'+item.id} enquiry={item} call={call} />
          <PropertyApplication key={'application:'+identity+':'+item.id} enquiry={item} call={call} />
          <PropertyOffer key={'offer:'+identity+':'+item.id} enquiry={item} call={call} />
        </article>)}
        {(offset>0||hasMore) && <div className="seeker-pagination"><button disabled={offset===0||state.busy} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button>
          <button disabled={!hasMore||state.busy} onClick={()=>setOffset(n=>n+50)}>Next</button></div>}
          {items.length>0 && <button className="seeker-text-link" disabled={state.busy} onClick={()=>refresh().catch(err=>setState(s=>({...s,error:err.message})))}>Refresh responses</button>}
      </section>}
    </div>
  </SeekerLayout>;
};
export default PropertyEnquiry;
