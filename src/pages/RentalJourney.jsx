import SeekerLayout from '../components/layouts/SeekerLayout';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../hooks/useAuth';
import {getPlatformClient} from '../services/platformClient';
import {requestSeekerEnquiries} from '../services/seekerContextClient';
import PropertyOffer from '../components/properties/PropertyOffer';

const call=options=>requestSeekerEnquiries({getSession:()=>getPlatformClient().auth.getSession(),...options});
const RentalJourney=()=>{
  const {user,isAuthenticated,loading}=useAuth();
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[offset,setOffset]=useState(0);
  const identity=String(user?.id||'');
  useEffect(()=>{
    let active=true;setSnapshot(null);setError('');
    if(loading||!isAuthenticated){return()=>{active=false;};}
    call({path:'/journey?offset='+offset}).then(data=>{if(active){setSnapshot({identity,...data});}})
      .catch(err=>{if(active){setError(err.message||'Unable to load your rental journey.');}});
    return()=>{active=false;};
  },[identity,loading,isAuthenticated,offset]);
  const current=snapshot?.identity===identity&&isAuthenticated?snapshot:null;
  return <SeekerLayout active="offers"><div className="space-y-5">
    <div className="seeker-page-heading"><div><p className="seeker-kicker">Your next chapter</p><h1>Offers & agreements</h1>
    <p className="seeker-intro">Review offers from property owners and follow your agreement’s next steps.</p></div><Link className="seeker-button seeker-button-secondary" to="/enquire">My enquiries</Link></div>
    {!loading&&!isAuthenticated&&<Link to="/login" className="underline">Sign in to continue</Link>}
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {isAuthenticated&&!current&&!error&&<p role="status">Loading rental journey…</p>}
    {current?.items.length===0&&<div className="seeker-empty"><div className="seeker-empty-icon" aria-hidden="true">⌂</div><h2>{offset>0?'You’ve reached the end':'A place to plan your next move'}</h2><p>{offset>0?'Go back to see earlier enquiries and offers.':'When an owner makes you a rental offer, you can review its terms here. Start by finding a property and contacting its owner.'}</p><Link className="seeker-button" to="/seeker#browse-rentals">Find a rental</Link></div>}
    {current?.items.map(item=><article key={identity+':'+item.id} className="seeker-card space-y-3">
      <h2 className="text-xl font-semibold">{item.title}</h2><p>Enquiry: {item.status}</p>
      <p className="whitespace-pre-wrap">{item.message}</p>{item.response&&<p className="whitespace-pre-wrap">Owner response: {item.response}</p>}
      <PropertyOffer enquiry={item} call={call} />
    </article>)}
    {current&&(offset>0||current.hasMore)&&<div className="seeker-pagination"><button disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button>
      <button disabled={!current.hasMore} onClick={()=>setOffset(n=>n+50)}>Next</button></div>}
    </div></SeekerLayout>;
};
export default RentalJourney;
