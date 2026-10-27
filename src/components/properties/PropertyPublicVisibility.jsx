import {PROPERTY_COUNTRIES} from '../../utils/constants.js';
import {useEffect,useState} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {isAdministrator} from '../../utils/accessModel';
import {requestMssqlApi} from '../../services/mssqlApiClient';
import PropertyPhotoReview from './PropertyPhotoReview';

// The server may return 404 when public-listing management is not enabled.
// Do not present a misleading opt-out that cannot be persisted.
const PropertyPublicVisibility=({propertyId})=>{
  const {user,membership}=useAuth();
  const admin=isAdministrator({user,membership}) && String(membership?.status||'active')==='active';
  const [draft,setDraft]=useState(null);
  const [pilot,setPilot]=useState(null);
  const [previewError,setPreviewError]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    if(!admin||!propertyId){setLoading(false);return()=>{active=false;};}
    setLoading(true);setDraft(null);setError('');setPilot(null);setPreviewError('');
    requestMssqlApi('/api/public-listing-preferences/'+encodeURIComponent(propertyId)+'/pilot-preview')
      .then(data=>{if(active)setPilot(data);})
      .catch(()=>{if(active)setPreviewError('Listing eligibility preview is unavailable. Refresh before release.');});
    requestMssqlApi('/api/public-listing-preferences/'+encodeURIComponent(propertyId))
      .then(data=>{if(active){setDraft({
        countryCode:data.countryCode||'',
        optedOut:Boolean(data.optedOut),
        headline:data.headline||'',
        locationLabel:data.locationLabel||''
      });}})
      .catch(err=>{if(active&&err.status!==404)setError(err.message||'Unable to read public listing settings.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[admin,propertyId,membership?.tenant_id,user?.id]);
  if(!admin||loading||!draft)return null;
  const update=(field,value)=>setDraft(prev=>({...prev,[field]:value}));
  const save=async()=>{
    try{
      setSaving(true);setError('');setPilot(null);setPreviewError('');
      const values={...(draft.countryCode ? {countryCode:draft.countryCode} : {}),optedOut:draft.optedOut,
        headline:draft.headline.trim()||null,locationLabel:draft.locationLabel.trim()||null};
      const data=await requestMssqlApi('/api/public-listing-preferences/'+encodeURIComponent(propertyId),
        {method:'PATCH',body:values});
      setDraft({countryCode:data.countryCode||'',optedOut:Boolean(data.optedOut),
        headline:data.headline||'',locationLabel:data.locationLabel||''});
      try{setPilot(await requestMssqlApi('/api/public-listing-preferences/'+encodeURIComponent(propertyId)+'/pilot-preview'));}
      catch{setPreviewError('Listing eligibility preview is unavailable. Refresh before release.');}
    }catch(err){setError(err.message||'Unable to save public listing preferences.');}
    finally{setSaving(false);}
  };
  return <section className="bg-white rounded-lg shadow p-6 mt-6" aria-labelledby="public-visibility-title">
    <h2 id="public-visibility-title" className="text-lg font-semibold mb-2">Quixo.Homes public listing</h2>
    <p className="text-sm text-gray-600 mb-4">
      Available rentals in supported markets appear publicly by default when their country is set. Rented or reserved properties are hidden automatically.
      You can opt out at any time. Private contact details, invoices, agreements and original attachments are never public.
    </p>
    <div className="border rounded p-3 mb-4" aria-label="Private listing release preview">
      <h3 className="font-semibold">Private listing release preview</h3>
      <p className="text-sm">This check does not publish the property. Availability is checked again on every public read; photo approval and release settings are separate.</p>
      {pilot&&<>
        <p className="text-sm">Public listing reference: <code>{pilot.publicId}</code></p>
        <p className="text-sm">{pilot.eligible?'Eligible at last server check.':'Not currently eligible for public listing.'}</p>
        {pilot.publicPreview&&<dl className="text-sm">
          <dt>Public title</dt><dd>{pilot.publicPreview.title}</dd>
          <dt>Public location</dt><dd>{pilot.publicPreview.location}</dd>
          <dt>Country</dt><dd>{pilot.publicPreview.country}</dd>
          <dt>Category</dt><dd>{pilot.publicPreview.category}</dd>
          <dt>Monthly rent</dt><dd>{pilot.publicPreview.monthlyRent===null?'Rent on request':pilot.publicPreview.currency+' '+pilot.publicPreview.monthlyRent}</dd>
        </dl>}
      </>}
      {previewError&&<p role="alert" className="text-red-700">{previewError}</p>}
    </div>
    <label className="block text-sm font-medium mb-2" htmlFor="public-country">Property country</label>
    <select id="public-country" value={draft.countryCode} onChange={e=>update('countryCode',e.target.value)}
      className="w-full border rounded p-2 mb-4" disabled={saving}>
      <option value="">Select country</option>
      {[...PROPERTY_COUNTRIES].sort((a,b)=>a.name.localeCompare(b.name)).map(country=>(
        <option key={country.code} value={country.code}>{country.name} ({country.code})</option>
      ))}
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
          !['LK','BN'].includes(draft.countryCode)?'This country is not yet supported on the public website.':
            'Property will appear when availability and website release checks allow it.'}
    </p>
    {error&&<p role="alert" className="text-sm text-red-700 mb-3">{error}</p>}
    <button type="button" onClick={save} disabled={saving}
      className="px-4 py-2 bg-blue-800 text-white rounded disabled:opacity-50">
      {saving?'Saving…':'Save public listing preferences'}
    </button>
    <PropertyPhotoReview key={String(user?.id)+':'+String(membership?.tenant_id)+':'+propertyId} propertyId={propertyId}/>
  </section>;
};
export default PropertyPublicVisibility;
