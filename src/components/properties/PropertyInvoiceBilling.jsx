import { useEffect, useState } from 'react';
import { getPropertyInvoiceBilling,savePropertyInvoiceBilling } from '../../services/platformClient';
const EMPTY={
  beneficiaryName:'',billingContactName:'',billingContactEmail:'',billingContactPhone:'',
  parties:{managementMode:'tenant',issuerRole:'organization',externalManagerName:'',
    externalManagerAddress:'',externalManagerEmail:'',externalManagerPhone:'',
    propertyOwnerName:'',propertyOwnerAddress:'',propertyOwnerEmail:'',propertyOwnerPhone:'',issuerAuthorityConfirmed:false}
};
const inputs=[
  ['beneficiaryName','Verified bank account holder / beneficiary'],
  ['billingContactName','Property billing contact name'],
  ['billingContactEmail','Property billing contact email'],
  ['billingContactPhone','Property billing contact phone']
];
const partyFields=[
  ['externalManagerName','External manager business name'],
  ['externalManagerAddress','External manager address'],
  ['externalManagerEmail','External manager contact email'],
  ['externalManagerPhone','External manager contact phone']
];
const ownerFields=[
  ['propertyOwnerName','Verified property owner name'],
  ['propertyOwnerAddress','Property owner postal address'],
  ['propertyOwnerEmail','Property owner contact email'],
  ['propertyOwnerPhone','Property owner contact phone']
];
export default function PropertyInvoiceBilling({propertyId}){
  const [data,setData]=useState(EMPTY),[loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{
    let active=true;
    getPropertyInvoiceBilling(propertyId).then(({data:loaded,error})=>{
      if(!active)return;
      if(error)setError(error.message);
      else setData({...EMPTY,...(loaded||{}),parties:{...EMPTY.parties,...(loaded?.parties||{})}});
      setLoading(false);
    });
    return ()=>{active=false;};
  },[propertyId]);
  const change=(key,value)=>setData(current=>({...current,[key]:value}));
  const changeParty=(key,value)=>setData(current=>{
    const next={...current.parties,[key]:value};
    if(key==='managementMode' && value==='tenant'){
      for(const k of ['externalManagerName','externalManagerAddress','externalManagerEmail','externalManagerPhone'])next[k]='';
      if(next.issuerRole==='manager'){next.issuerRole='organization';next.issuerAuthorityConfirmed=false;}
    }
    if(key==='issuerRole'){
      next.issuerAuthorityConfirmed=false;
      if(value!=='owner')for(const k of ['propertyOwnerName','propertyOwnerAddress','propertyOwnerEmail','propertyOwnerPhone'])next[k]='';
    }
    return {...current,parties:next};
  });
  const save=async(event)=>{
    event.preventDefault();setError('');setNotice('');setSaving(true);
    const result=await savePropertyInvoiceBilling(propertyId,data);
    if(result.error)setError(result.error.message);
    else {setData({...EMPTY,...result.data,parties:{...EMPTY.parties,...result.data.parties}});setNotice('Verified billing details saved. Previously issued invoices are unchanged.');}
    setSaving(false);
  };
  const field=(key,label,value,onChange)=><label key={key} className="block text-sm font-medium text-slate-700">{label}
    <input type="text" value={value||''} onChange={e=>onChange(key,e.target.value)}
      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={key.includes('Address')?500:320}/>
  </label>;
  return <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
    <h2 className="text-lg font-semibold text-slate-900">Invoice billing and property management</h2>
    <p className="mt-1 mb-4 text-sm text-slate-600">Normal property name, address, bank, branch and account number remain in Property Information above. Maintain only missing verified details here.</p>
    {loading?<p>Loading billing information…</p>:<form onSubmit={save} className="space-y-5">
      {error&&<p className="text-red-700 text-sm" role="alert">{error}</p>}
      {notice&&<p className="text-emerald-700 text-sm" role="status">{notice}</p>}
      <div className="grid gap-4 md:grid-cols-2">{inputs.map(([key,label])=>field(key,label,data[key],change))}</div>
      <div className="rounded-lg bg-slate-50 p-4">
        <label className="block text-sm font-semibold text-slate-800">Management arrangement
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={data.parties.managementMode||'tenant'}
            onChange={e=>changeParty('managementMode',e.target.value)}>
            <option value="tenant">Managed by this organization</option>
            <option value="outsourced">Outsourced external manager</option>
          </select>
        </label>
        {data.parties.managementMode==='outsourced'&&<div className="mt-4 grid gap-4 md:grid-cols-2">
          {partyFields.map(([key,label])=>field(key,label,data.parties[key],changeParty))}
        </div>}
      </div>
      <div className="rounded-lg bg-slate-50 p-4">
        <label className="block text-sm font-semibold text-slate-800">Legal invoice issuer
          <select value={data.parties.issuerRole||'organization'} onChange={e=>changeParty('issuerRole',e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="organization">This organization's verified issuer profile</option>
            <option value="owner">Verified property owner</option>
            {data.parties.managementMode==='outsourced'&&<option value="manager">Verified external manager</option>}
          </select>
        </label>
        {data.parties.issuerRole==='owner'&&<div className="mt-3 grid gap-4 md:grid-cols-2">{ownerFields.map(([key,label])=>field(key,label,data.parties[key],changeParty))}</div>}
        {data.parties.issuerRole!=='organization'&&<label className="mt-3 flex gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={data.parties.issuerAuthorityConfirmed===true}
            onChange={e=>changeParty('issuerAuthorityConfirmed',e.target.checked)}/>
          I have verified the contractual authority of this invoice issuer.
        </label>}
      </div>
      <p className="text-xs text-slate-500">The bank beneficiary is not inferred from the manager, property owner or invoice issuer. Only authorized organization administrators can save these details.</p>
      <button type="submit" disabled={saving} className="app-button">{saving?'Saving…':'Save invoice billing details'}</button>
    </form>}
  </section>;
}
