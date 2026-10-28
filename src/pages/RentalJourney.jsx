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
  return <main className="max-w-4xl mx-auto p-6 space-y-5">
    <h1 className="text-3xl font-semibold">My rental journey</h1>
    <p>Your property enquiries, versioned offers and agreement continuation remain attached to your existing account.</p>
    {!loading&&!isAuthenticated&&<Link to="/login" className="underline">Sign in to continue</Link>}
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {isAuthenticated&&!current&&!error&&<p role="status">Loading rental journey…</p>}
    {current?.items.length===0&&<p>No rental enquiries on this page.</p>}
    {current?.items.map(item=><article key={identity+':'+item.id} className="border rounded-xl p-5 space-y-3">
      <h2 className="text-xl font-semibold">{item.title}</h2><p>Enquiry: {item.status}</p>
      <p className="whitespace-pre-wrap">{item.message}</p>{item.response&&<p className="whitespace-pre-wrap">Owner response: {item.response}</p>}
      <PropertyOffer enquiry={item} call={call} />
    </article>)}
    {current&&<div className="flex gap-4"><button disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button>
      <button disabled={!current.hasMore} onClick={()=>setOffset(n=>n+50)}>Next</button></div>}
    <Link to="/enquire" className="underline">Property enquiries and viewing appointments</Link>
  </main>;
};
export default RentalJourney;
