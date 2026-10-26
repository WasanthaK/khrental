import {useEffect,useState} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {isAdministrator} from '../../utils/accessModel';
import {requestMssqlApi} from '../../services/mssqlApiClient';

// The server may return 404 when public-listing management is not enabled.
// Do not present a misleading opt-out that cannot be persisted.
const PropertyPublicVisibility=({propertyId})=>{
  const {user,membership}=useAuth();
  const admin=isAdministrator({user,membership}) && String(membership?.status||'active')==='active';
  const [model,setModel]=useState(null);
  const [draft,setDraft]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    if(!admin||!propertyId){setLoading(false);return()=>{active=false;};}
    setLoading(true);
    requestMssqlApi('/api/public-listing-preferences/'+encodeURIComponent(propertyId))
      .then(data=>{if(active){setModel(data);setDraft({
        countryCode:data.countryCode||'',
        optedOut:Boolean(data.optedOut),
        headline:data.headline||'',
        locationLabel:data.locationLabel||''
      });}})
      .catch(err=>{if(active&&err.status!==404)setError(err.message||'Unable to read public listing settings.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[admin,propertyId]);
  if(!admin||loading||!draft)return null;
  const update=(field,value)=>setDraft(prev=>({...prev,[field]:value}));
  const save=async()=>{
    try{
      setSaving(true);setError('');
      const values={countryCode:draft.countryCode||null,optedOut:draft.optedOut,
        headline:draft.headline.trim()||null,locationLabel:draft.locationLabel.trim()||null};
      const data=await requestMssqlApi('/api/public-listing-preferences/'+encodeURIComponent(propertyId),
        {method:'PATCH',body:values});
      setModel(data);
      setDraft({countryCode:data.countryCode||'',optedOut:Boolean(data.optedOut),
        headline:data.headline||'',locationLabel:data.locationLabel||''});
    }catch(err){setError(err.message||'Unable to save public listing preferences.');}
    finally{setSaving(false);}
  };
  return <section className="bg-white rounded-lg shadow p-6 mt-6" aria-labelledby="public-visibility-title">
    <h2 id="public-visibility-title" className="text-lg font-semibold mb-2">Quixo.Homes public listing</h2>
    <p className="text-sm text-gray-600 mb-4">
      Available rentals appear publicly by default when their country is set. Rented or reserved properties are hidden automatically.
      You can opt out at any time. Private contact details, invoices, agreements and original attachments are never public.
    </p>
    <label className="block text-sm font-medium mb-2" htmlFor="public-country">Public listing country</label>
    <select id="public-country" value={draft.countryCode} onChange={e=>update('countryCode',e.target.value)}
      className="w-full border rounded p-2 mb-4" disabled={saving}>
      <option value="">Select market</option>
      <option value="LK">Sri Lanka · LKR/month</option>
      <option value="BN">Brunei Darussalam · BND/month</option>
    </select>
    <label className="block text-sm font-medium mb-2" htmlFor="public-title">Public headline (optional)</label>
    <input id="public-title" maxLength={150} value={draft.headline}
      onChange={e=>update('headline',e.target.value)}
      placeholder="Home for rent" className="w-full border rounded p-2 mb-4" disabled={saving}/>
    <label className="block text-sm font-medium mb-2" htmlFor="public-location">General public location (optional)</label>
    <input id="public-location" maxLength={120} value={draft.locationLabel}
      onChange={e=>update('locationLabel',e.target.value)}
      placeholder="District or city only — no private street or unit number"
      className="w-full border rounded p-2 mb-4" disabled={saving}/>
    <label className="flex items-center gap-2 text-sm mb-3" htmlFor="public-optout">
      <input id="public-optout" type="checkbox" checked={draft.optedOut}
        onChange={e=>update('optedOut',e.target.checked)} disabled={saving}/>
      <span>Do not advertise this property on Quixo.Homes</span>
    </label>
    <p className="text-xs text-gray-500 mb-3">
      {draft.optedOut?'Owner opt-out is selected; listing is hidden.':
        !draft.countryCode?'Choose a country before the listing can appear in the right market.':
          'Property will appear when availability and website release checks allow it.'}
    </p>
    {error&&<p role="alert" className="text-sm text-red-700 mb-3">{error}</p>}
    <button type="button" onClick={save} disabled={saving}
      className="px-4 py-2 bg-blue-800 text-white rounded disabled:opacity-50">
      {saving?'Saving…':'Save public listing preferences'}
    </button>
  </section>;
};
export default PropertyPublicVisibility;
