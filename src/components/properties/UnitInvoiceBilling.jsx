import { useEffect,useState } from 'react';
import { getUnitInvoiceBilling,saveUnitInvoiceBilling } from '../../services/platformClient';
export default function UnitInvoiceBilling({propertyId,unitId}){
  const [name,setName]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{
    let active=true;
    getUnitInvoiceBilling(propertyId,unitId).then(({data,error})=>{
      if(!active)return;
      if(error)setError(error.message);else setName(data?.beneficiaryName||'');
      setLoading(false);
    });
    return ()=>{active=false;};
  },[propertyId,unitId]);
  const save=async e=>{
    e.preventDefault();setError('');setNotice('');setSaving(true);
    const result=await saveUnitInvoiceBilling(propertyId,unitId,{beneficiaryName:name});
    if(result.error)setError(result.error.message);
    else {setName(result.data?.beneficiaryName||'');setNotice('Unit beneficiary saved for future billing.');}
    setSaving(false);
  };
  return <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h3 className="text-base font-semibold text-slate-900">Unit invoice recipient</h3>
    <p className="text-xs text-slate-600">If this unit overrides the property bank destination, record its verified account holder. Never infer the beneficiary name.</p>
    {loading?<p className="text-sm">Loading…</p>:<form onSubmit={save} className="mt-3 space-y-3">
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice&&<p role="status" className="text-sm text-emerald-700">{notice}</p>}
      <label className="block text-sm font-medium text-slate-700">Verified unit bank beneficiary
        <input className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={255} value={name} onChange={e=>setName(e.target.value)}/>
      </label>
      <button className="app-button" disabled={saving} type="submit">{saving?'Saving…':'Save beneficiary'}</button>
    </form>}
  </section>;
}
