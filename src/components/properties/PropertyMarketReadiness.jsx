import {useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import {isAdministrator} from '../../utils/accessModel';
import {requestMssqlApi} from '../../services/mssqlApiClient';

const PAGE_SIZE=25;
const base='/api/public-listing-preferences';
const PropertyMarketReadiness=()=>{
  const {user,membership,activeTenantId}=useAuth();
  const isAdmin=isAdministrator({user,membership})&&String(membership?.status||'active')==='active';
  const [snapshot,setSnapshot]=useState(null);
  const [page,setPage]=useState(0);
  const [selected,setSelected]=useState({});
  const [saving,setSaving]=useState(null);
  const [error,setError]=useState('');
  const [hidden,setHidden]=useState(false);

  const refresh=useCallback(async()=>{
    if(!isAdmin||!activeTenantId)return;
    try{
      const data=await requestMssqlApi(base+'/market-readiness?offset='+(page*PAGE_SIZE)+'&limit='+PAGE_SIZE);
      setSnapshot(data);setError('');setHidden(false);
    }catch(err){
      if(err.status===404){setHidden(true);setSnapshot(null);}
      else setError(err.message||'Unable to retrieve public listing market assignments.');
    }
  },[isAdmin,activeTenantId,page]);

  useEffect(()=>{
    setSnapshot(null);setSelected({});setPage(0);setHidden(false);
  },[activeTenantId]);
  useEffect(()=>{
    let active=true;
    if(!isAdmin||!activeTenantId)return ()=>{active=false;};
    requestMssqlApi(base+'/market-readiness?offset='+(page*PAGE_SIZE)+'&limit='+PAGE_SIZE)
      .then(data=>{if(active){setSnapshot(data);setHidden(false);setError('');}})
      .catch(err=>{if(active){if(err.status===404){setHidden(true);setSnapshot(null);}
        else setError(err.message||'Unable to retrieve public listing market assignments.');}});
    return ()=>{active=false;};
  },[isAdmin,activeTenantId,page]);

  if(!isAdmin||hidden)return null;
  const assign=async propertyId=>{
    const countryCode=selected[propertyId];
    if(countryCode!=='LK'&&countryCode!=='BN'){setError('Choose a valid country first.');return;}
    setSaving(propertyId);setError('');
    try{
      await requestMssqlApi(base+'/'+encodeURIComponent(propertyId),
        {method:'PATCH',body:{countryCode}});
      setSelected(old=>{const next={...old};delete next[propertyId];return next;});
      // If the last record on this page was assigned, return to the preceding page.
      if(snapshot?.records?.length===1&&page>0)setPage(n=>n-1);
      else await refresh();
    }catch(err){setError(err.message||'Unable to assign country.');}
    finally{setSaving(null);}
  };
  const counts=snapshot?.counts;
  return <section className="bg-white rounded-lg shadow p-5 mb-6" aria-labelledby="public-country-readiness">
    <div className="flex flex-wrap justify-between items-start gap-3">
      <div>
        <h2 id="public-country-readiness" className="text-lg font-semibold">Quixo.Homes country assignment</h2>
        <p className="text-sm text-gray-600 mt-1">
          Choose where each registered property belongs. Available properties are automatically eligible for that country's website, unless rented, reserved or opted out.
          Countries are never guessed from private addresses.
        </p>
      </div>
      <button type="button" onClick={refresh} className="border rounded px-3 py-2 text-sm"
        disabled={saving!==null}>Refresh</button>
    </div>
    {counts&&<p className="text-sm mt-3 text-gray-700">
      <strong>{counts.assigned}</strong> assigned · <strong>{counts.unassigned}</strong> needing a country ·
      <strong> {counts.optedOut}</strong> opted out · <strong>{counts.total}</strong> total
    </p>}
    {error&&<p role="alert" className="text-sm text-red-700 my-3">{error}</p>}
    {!snapshot&&!error&&<p className="text-sm mt-3">Loading country assignments…</p>}
    {snapshot&&snapshot.records.length===0&&<p className="text-sm mt-3 text-green-800">
      {counts?.unassigned===0?'Every registered property has a country assignment.':'No unassigned properties on this page.'}
    </p>}
    {snapshot?.records?.length>0&&<div className="mt-3 space-y-3">
      {snapshot.records.map(property=><div key={property.propertyId}
        className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to={'/dashboard/properties/'+encodeURIComponent(property.propertyId)}
            className="font-semibold text-blue-800 underline">{property.propertyName}</Link>
          <p className="text-xs text-gray-600">Status: {property.availabilityStatus}{property.optedOut?' · opted out':''}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={'country-'+property.propertyId} className="sr-only">Country for {property.propertyName}</label>
          <select id={'country-'+property.propertyId}
            value={selected[property.propertyId]||''}
            onChange={e=>setSelected(old=>({...old,[property.propertyId]:e.target.value}))}
            disabled={saving!==null} className="border rounded px-2 py-2 text-sm">
            <option value="">Choose country</option>
            <option value="LK">Sri Lanka</option>
            <option value="BN">Brunei</option>
          </select>
          <button type="button" onClick={()=>assign(property.propertyId)}
            disabled={!selected[property.propertyId]||saving!==null}
            className="bg-blue-800 text-white rounded px-3 py-2 text-sm disabled:opacity-50">
            {saving===property.propertyId?'Saving…':'Assign'}
          </button>
        </div>
      </div>)}
    </div>}
    {counts?.unassigned>PAGE_SIZE&&<nav className="flex items-center justify-end gap-3 mt-4" aria-label="Country assignment pages">
      <button type="button" onClick={()=>setPage(n=>Math.max(0,n-1))}
        disabled={page===0||saving!==null} className="border rounded px-3 py-1 disabled:opacity-40">Previous</button>
      <span className="text-sm">Page {page+1}</span>
      <button type="button" onClick={()=>setPage(n=>n+1)}
        disabled={saving!==null||!snapshot?.records?.length||snapshot?.records?.length<PAGE_SIZE}
        className="border rounded px-3 py-1 disabled:opacity-40">Next</button>
    </nav>}
    <p className="text-xs text-gray-500 mt-4">Country assignment determines which country's website a property is eligible for. Open the property to review its public listing details or choose not to advertise it.</p>
  </section>;
};
export default PropertyMarketReadiness;
