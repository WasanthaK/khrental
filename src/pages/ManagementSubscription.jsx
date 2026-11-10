import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../hooks/useAuth';
import {requestMssqlApi} from '../services/mssqlApiClient';

const button='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40';
const PreparedStockForm=({busy,onAction})=>{
  const [name,setName]=useState(''),[country,setCountry]=useState('LK'),[type,setType]=useState('house');
  const identity=useRef(null);
  if(!identity.current)identity.current=crypto.randomUUID();
  return <form className="space-y-3" onSubmit={async event=>{
    event.preventDefault();
    const saved=await onAction('stock/prepare',{records:[{kind:'property',payload:{id:identity.current,name,
      propertytype:type,country_code:country,rentalvalues:{listingCategory:'residential'}}}],
      reason:'Organization administrator prepared a dwelling for billing review.'});
    if(saved===true){setName('');identity.current=crypto.randomUUID();}
  }}>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Property name<input className="mt-1 w-full rounded-lg border p-2" required maxLength={255} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="text-sm">Country<select className="mt-1 w-full rounded-lg border p-2" value={country} onChange={e=>setCountry(e.target.value)}><option value="LK">Sri Lanka</option><option value="BN">Brunei</option></select></label>
      <label className="text-sm">Property type<select className="mt-1 w-full rounded-lg border p-2" value={type} onChange={e=>setType(e.target.value)}><option value="house">House</option><option value="condo">Condominium</option></select></label>
    </div>
    <button className={button} disabled={busy||!name.trim()}>Prepare dwelling</button>
  </form>;
};
export const ManagementSubscriptionView=({data,loading,error,busy,notice,preview,onReload,onAction})=>{
  const reductionScheduled=Number.isSafeInteger(data?.pendingQuantity)&&data.pendingQuantity>0
    &&data.pendingQuantity<data.billedQuantity&&!data.cancelAtPeriodEnd;
  const renewalTime=data?.paidThrough?Date.parse(data.paidThrough):NaN;
  const renewalDate=Number.isFinite(renewalTime)
    ?new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'UTC'}).format(renewalTime):null;
  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
  <header><p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Workspace billing</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Management subscription</h1><p className="mt-2 text-slate-600">A monthly subscription for the dwellings your organization manages.</p></header>
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Sandbox test · No live charging</strong><p className="mt-1">This test does not change your workspace’s existing access. Rent, deposits and renter documents are separate from this subscription.</p></div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <button onClick={onReload} className="underline">Retry</button></p>}
  {notice&&<p role="status" className="rounded-xl bg-slate-100 p-4 text-slate-800">{notice}</p>}
  {loading?<p role="status">Loading subscription…</p>:data&&<>
    <div className="grid gap-4 sm:grid-cols-3">{[['Managed dwellings',data.inventoryQuantity],['Current billed quantity',data.billedQuantity],['Subscription',data.status.replaceAll('_',' ')]].map(([title,value])=><section key={title} className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm text-slate-500">{title}</h2><p className="mt-2 text-2xl font-semibold capitalize">{value}</p></section>)}</div>
    {data.stagingEnabled&&<section aria-labelledby="prepared-stock-title" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 id="prepared-stock-title" className="text-xl font-semibold">Prepare additions</h2>
      <p className="text-sm text-slate-600">Prepare a dwelling before billing is set up. It stays private and unavailable for tenancy until billing is confirmed. No payment or subscription change is made by preparing it.</p>
      <PreparedStockForm busy={busy} onAction={onAction}/>
      {data.pendingStock?.length>0&&<div><h3 className="font-semibold">Awaiting billing confirmation</h3><ul className="mt-2 space-y-2 text-sm">{data.pendingStock.map(item=><li key={item.id}>{item.label} · {item.kind==='property'?'Property':'Unit'}</li>)}</ul>
        <button className={`${button} mt-3`} disabled={busy} onClick={()=>onAction('stock/withdraw',{ids:data.pendingStock.map(item=>item.id),reason:'Organization administrator withdrew prepared additions before management activation.'})}>Withdraw prepared additions</button>
        <p className="mt-3 text-sm">Your reviewed total will be {data.proposedInventoryQuantity} managed {data.proposedInventoryQuantity===1?'dwelling':'dwellings'}. {data.enrolled?'Use the billing actions below to review and confirm the change.':'A platform administrator must enroll this test workspace before checkout.'}</p>
      </div>}
    </section>}
    {reductionScheduled&&<section aria-labelledby="scheduled-quantity-title" className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-950">
      <h2 id="scheduled-quantity-title" className="text-xl font-semibold">Scheduled quantity reduction</h2>
      <p className="mt-2">Your billed quantity will change from <strong>{data.billedQuantity}</strong> to <strong>{data.pendingQuantity}</strong> at your next renewal{renewalDate?` on ${renewalDate} (UTC)`:''}.</p>
      {!renewalDate&&<p className="mt-2 text-sm">The renewal date is not available yet.</p>}
      <p className="mt-2 text-sm">The current period remains billed for {data.billedQuantity} dwellings. No current-period refund.</p>
    </section>}
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-semibold">Billing actions</h2>
      {!data.enrolled?<p className="text-slate-600">A platform administrator must enroll this development workspace before sandbox checkout is available.</p>:!data.configured?<p className="text-slate-600">The sandbox connection is being configured. Your existing records remain available.</p>:<>
        <p className="text-sm text-slate-600">Monthly, no trial. Additions are prorated onto the next regular invoice. Reductions apply at renewal. A failed renewal has a seven-day grace period.</p>
        <div className="flex flex-wrap gap-3">
          {data.status==='pending'&&<button className={button} disabled={busy} onClick={()=>onAction('checkout',{inventoryHash:data.inventoryHash})}>Open sandbox checkout</button>}
          <button className={button} disabled={busy} onClick={()=>onAction('refresh',{})}>Refresh Stripe status</button>
          {data.status!=='pending'&&<><button className={button} disabled={busy} onClick={()=>onAction('portal',{})}>Payment method & invoices</button><button className={button} disabled={busy||data.entitlement.state!=='active'} onClick={()=>onAction('quantity-preview',{})}>Review quantity change</button></>}
        </div>
        {data.pendingOperation&&<div className="space-y-2 text-sm text-amber-800">
          <p>An operation is awaiting confirmation: {data.pendingOperation.kind.replaceAll('_',' ')}.</p>
          <button className={button} disabled={busy} onClick={()=>onAction(data.pendingOperation.kind==='quantity_preview'?'quantity-preview':data.pendingOperation.kind==='quantity_apply'?'quantity-apply':data.pendingOperation.kind,data.pendingOperation.payload,data.pendingOperation.id)}>Retry unfinished operation</button>
          {(data.pendingOperation.kind==='quantity_apply'||(data.pendingOperation.kind==='cancellation'&&data.pendingOperation.payload.cancelAtPeriodEnd===true))&&<div>
            <p>If a cancellation was interrupted, check whether it already took effect. This check does not repeat the change.</p>
            <button className={`${button} mt-2`} disabled={busy} onClick={()=>onAction('reconcile-cancellation',{},data.pendingOperation.id)}>Check cancellation result</button>
          </div>}
        </div>}
        {preview&&<div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
          <h3 className="font-semibold">{preview.timing==='cancel_at_renewal'?'End subscription at renewal':`Quantity change: ${preview.from} → ${preview.to}`}</h3>
          <p className="mt-2 text-sm">{preview.timing==='cancel_at_renewal'
            ?'You have no managed dwellings. Confirm to end the subscription at renewal. The current period remains billed with no refund. Historical records and renter access are preserved.'
            :preview.timing==='prorated_next_invoice'?'Proration is added to the next regular invoice; no immediate collection.':preview.timing==='next_renewal'?'The lower quantity starts at the next renewal. No current-period refund.':'The quantity is unchanged.'}</p>
          {preview.nextInvoiceTotalMinor!==null&&<p className="mt-2 font-semibold">Estimated next invoice: {new Intl.NumberFormat('en',{style:'currency',currency:preview.currency}).format(preview.nextInvoiceTotalMinor/100)}</p>}
          <button className={`${button} mt-3`} disabled={busy} onClick={()=>onAction('quantity-apply',{previewId:preview.previewId})}>{preview.timing==='cancel_at_renewal'?'Confirm sandbox cancellation at renewal':'Confirm sandbox quantity change'}</button>
        </div>}
        {['active','past_due'].includes(data.status)&&<div className="border-t pt-4"><h3 className="font-semibold">Renewal</h3><p className="mt-2 text-sm text-slate-600">{data.cancelAtPeriodEnd?'This subscription is set to end at renewal.':'Your monthly subscription renews automatically.'} Historical records and renter access are preserved after cancellation.</p>
          {data.cancelAtPeriodEnd&&data.inventoryQuantity===0?<p className="mt-3 text-sm">Add managed dwellings before choosing to renew again.</p>
            :<button className={`${button} mt-3`} disabled={busy} onClick={()=>onAction('cancellation',{cancelAtPeriodEnd:!data.cancelAtPeriodEnd})}>{data.cancelAtPeriodEnd?'Keep subscription renewing':'End subscription at renewal'}</button>}
        </div>}
      </>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-semibold">Dwelling inventory</h2><p className="mt-1 text-sm text-slate-500">Vacant and unlisted dwellings count. A building and its separately rentable units are never counted twice.</p><ul className="mt-4 divide-y divide-slate-100">{data.inventory.map(item=><li key={item.key} className="py-3 text-sm">{item.label}</li>)}</ul></section>
  </>}
</div>;
};

export default function ManagementSubscription(){
  const {user,membership}=useAuth();
  const tenantId=membership?.tenant_id || user?.tenant_id;
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null);
  const context=useRef('');context.current=`${user?.id}:${tenantId}`;
  const requests=useRef(new Map());
  const load=async()=>{const scope=context.current;setLoading(true);setError('');try{const result=await requestMssqlApi('/api/management-billing/status');if(context.current===scope)setData(result);}catch(e){if(context.current===scope)setError(e.message);}finally{if(context.current===scope)setLoading(false);}};
  useEffect(()=>{setData(null);setPreview(null);setNotice('');requests.current.clear();load();},[user?.id,tenantId]);
  const action=async(kind,payload,resumeId)=>{
    const scope=context.current;setBusy(true);setNotice('');
    const key=`${scope}:${kind}:${JSON.stringify(payload)}`;
    let requestId=resumeId || requests.current.get(key);
    if(!requestId){requestId=crypto.randomUUID();requests.current.set(key,requestId);}
    try{
      const result=await requestMssqlApi(`/api/management-billing/${kind}`,{method:'POST',body:kind==='refresh'?{}:kind.startsWith('stock/')?payload:{...payload,requestId}});
      if(context.current!==scope)return;
      requests.current.delete(key);
      if(result.url){window.location.assign(result.url);return;}
      if(kind==='quantity-preview')setPreview(result);else{setPreview(null);setNotice(kind==='stock/prepare'?'Dwelling prepared. Billing confirmation is still required before it becomes managed.':kind==='stock/withdraw'?'Prepared additions withdrawn. Managed stock and historical records are unchanged.':'Stripe status updated.');}
      await load();
      return true;
    }catch(e){if(context.current===scope){setNotice(e.message);if(e.status>=400&&e.status<500)requests.current.delete(key);await load();}}finally{if(context.current===scope)setBusy(false);}
  };
  return <ManagementSubscriptionView {...{data,loading,error,busy,notice,preview}} onReload={load} onAction={action}/>;
}
