import {useEffect,useRef,useState} from 'react';
import {requestMssqlApi} from '../../services/mssqlApiClient';
import {buildPilotConfiguration} from '../../utils/publicListingPilotConfiguration.js';

// Mounted only inside the active administrator's property settings. The parent
// keys this component by tenant/property so previews and attestations never carry
// over when context changes. Nothing is prepared or approved on mount.
export default function PropertyPhotoReview({propertyId,publicPreview=null,request=requestMssqlApi}){
  const base='/api/public-listing-preferences/'+encodeURIComponent(propertyId)+'/media';
  const [model,setModel]=useState(null);
  const [selection,setSelection]=useState('');
  const [alt,setAlt]=useState('');
  const [review,setReview]=useState(null);
  const [preview,setPreview]=useState('');
  const [previewLoaded,setPreviewLoaded]=useState(false);
  const [rights,setRights]=useState(false);
  const [privacy,setPrivacy]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const alive=useRef(true);
  const objectUrl=useRef('');
  const clearPreview=()=>{
    if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
    objectUrl.current='';setPreview('');setPreviewLoaded(false);setReview(null);setRights(false);setPrivacy(false);
  };
  const reload=async()=>{
    const data=await request(base);
    if(alive.current)setModel(data);
  };
  useEffect(()=>{
    alive.current=true;
    reload().catch(e=>{if(alive.current&&e.status!==404)setError(e.message||'Unable to load photo reviews.');});
    return()=>{alive.current=false;if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);};
  },[base]);
  const act=async action=>{
    setBusy(true);setError('');setMessage('');
    try{await action();}
    catch(e){if(alive.current){clearPreview();setError(e.message||'Photo action failed. Reload before retrying.');}}
    finally{if(alive.current)setBusy(false);}
  };
  const prepare=()=>act(async()=>{
    clearPreview();
    await request(base+'/prepare',{method:'POST',body:{imageIndex:Number(selection),altText:alt.trim()}});
    await reload();
    if(alive.current)setMessage('Photo prepared privately. Preview it and complete both confirmations before approval.');
  });
  const inspect=photo=>act(async()=>{
    clearPreview();
    const blob=await request(base+'/'+encodeURIComponent(photo.mediaId)+'/preview',{responseType:'blob',cache:'no-store'});
    if(!alive.current)return;
    objectUrl.current=URL.createObjectURL(blob);setPreview(objectUrl.current);setReview(photo);
  });
  const approve=()=>act(async()=>{
    await request(base+'/'+encodeURIComponent(review.mediaId)+'/review',{
      method:'POST',body:{confirmRights:rights,confirmPrivacy:privacy}
    });
    clearPreview();await reload();
    if(alive.current)setMessage('Photo approved. Public visibility still follows property availability, opt-out and website release settings.');
  });
  const withdraw=photo=>act(async()=>{
    clearPreview();
    const result=await request(base+'/'+encodeURIComponent(photo.mediaId)+'/withdraw',{method:'POST',body:{}});
    await reload();
    if(alive.current)setMessage(result.storageDeletionSucceeded===false?
      'Photo withdrawn. Stored copy cleanup needs administrator attention.':
      'Photo withdrawn and no longer eligible for public delivery.');
  });
  const pilotConfiguration=busy?null:buildPilotConfiguration(publicPreview,model?.prepared);
  if(!model)return error?<p role="alert" className="text-red-700 mt-4">{error}</p>:null;
  return <div className="border-t mt-6 pt-4" aria-labelledby="photo-review-title">
    <h3 id="photo-review-title" className="font-semibold">Public property photographs</h3>
    <p className="text-sm text-gray-600 my-2">Prepare a private copy with embedded metadata removed. Check the preview and description for faces, documents, number plates, contact details and exact private addresses before approval.</p>
    {model.canPrepare?<div className="space-y-2 my-3">
      <label className="block" htmlFor="photo-selection">Registered photograph</label>
      <select id="photo-selection" className="border rounded p-2" value={selection} disabled={busy} onChange={e=>setSelection(e.target.value)}>
        <option value="">Select photograph</option>
        {model.photos.map(photo=><option key={photo.imageIndex} value={photo.imageIndex}>Registered photo {photo.imageIndex+1}</option>)}
      </select>
      {!model.photos.length&&<p>No supported registered photographs are available.</p>}
      <label className="block" htmlFor="photo-description">Public photo description</label>
      <input id="photo-description" className="border rounded p-2 w-full" maxLength={180} value={alt} disabled={busy} onChange={e=>setAlt(e.target.value)} placeholder="Describe the room or exterior; omit personal details"/>
      <p className="text-xs text-gray-600">Preparing an existing photo again replaces its previous prepared or approved copy and requires a fresh review.</p>
      <button type="button" disabled={busy||selection===''||!alt.trim()} onClick={prepare} className="border rounded px-3 py-2 disabled:opacity-50">Prepare private copy</button>
    </div>:<p className="text-sm my-3">Photo preparation is currently unavailable.</p>}
    <ul className="space-y-3">
      {model.prepared.map(photo=><li key={photo.mediaId} className="border rounded p-3">
        <p>Photo {photo.imageIndex+1}: {photo.altText}</p>
        <p className="text-sm">{photo.status==='withheld'?'Awaiting review':'Approved'}</p>
        {model.canReview&&<div className="flex gap-3 mt-2">
          <button type="button" disabled={busy} onClick={()=>inspect(photo)} className="underline">Preview {photo.status==='withheld'?'and review':'approved photo'}</button>
          <button type="button" disabled={busy} onClick={()=>withdraw(photo)} className="text-red-700 underline">Withdraw photo {photo.imageIndex+1}</button>
        </div>}
      </li>)}
    </ul>
    {pilotConfiguration&&<div className="my-4">
      <label className="block font-medium" htmlFor="pilot-release-configuration">Pilot release configuration (private)</label>
      <p className="text-sm text-gray-600">Saved public fields and exactly one approved photo. Transfer only to the protected release setting; this does not publish the property.</p>
      <textarea id="pilot-release-configuration" readOnly rows={12}
        value={JSON.stringify(pilotConfiguration,null,2)} className="border rounded p-2 w-full font-mono text-xs"/>
    </div>}
    {!model.canReview&&<p className="text-sm my-3">Photo review is currently unavailable; prepared copies remain private.</p>}
    {review&&preview&&<div className="border rounded p-4 my-3" aria-label="Private photo review">
      <img src={preview} alt={review.altText} onLoad={()=>setPreviewLoaded(true)}
        onError={()=>{setPreviewLoaded(false);setError('Preview could not load. Close it and retry before approving.');}}
        className="max-h-96 max-w-full object-contain"/>
      <p className="my-2">Public description: {review.altText}</p>
      {review.status==='withheld'&&<>
        <label className="block my-2"><input type="checkbox" checked={rights} disabled={busy||!previewLoaded} onChange={e=>setRights(e.target.checked)}/> I have permission to use this photograph publicly.</label>
        <label className="block my-2"><input type="checkbox" checked={privacy} disabled={busy||!previewLoaded} onChange={e=>setPrivacy(e.target.checked)}/> I checked this photo and description and confirm they contain no private or identifying information.</label>
        <button type="button" disabled={busy||!previewLoaded||!rights||!privacy} onClick={approve} className="border rounded px-3 py-2 disabled:opacity-50">Approve reviewed photo</button>
      </>}
      <button type="button" disabled={busy} onClick={clearPreview} className="underline ml-3">Close preview</button>
    </div>}
    {busy&&<p role="status">Working…</p>}
    {message&&<p role="status" className="text-sm mt-3">{message}</p>}
    {error&&<p role="alert" className="text-red-700 mt-3">{error}</p>}
  </div>;
}
