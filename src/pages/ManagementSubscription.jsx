import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../hooks/useAuth';
import {requestMssqlApi} from '../services/mssqlApiClient';

const button='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40';
const PreparedStockForm=({busy,onAction,draft,onChange})=>{
  const {id,name,country,type}=draft;
  return <form className="space-y-3" onSubmit={async event=>{
    event.preventDefault();
    await onAction('stock/prepare',{records:[{kind:'property',payload:{id,name,
      propertytype:type,country_code:country,rentalvalues:{listingCategory:'residential'}}}],
      reason:'Organization administrator prepared a dwelling for billing review.'});
  }}>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Property name<input className="mt-1 w-full rounded-lg border p-2" disabled={busy} required maxLength={255} value={name} onChange={e=>onChange({...draft,name:e.target.value})}/></label>
      <label className="text-sm">Country<select className="mt-1 w-full rounded-lg border p-2" disabled={busy} value={country} onChange={e=>onChange({...draft,country:e.target.value})}><option value="LK">Sri Lanka</option><option value="BN">Brunei</option></select></label>
      <label className="text-sm">Property type<select className="mt-1 w-full rounded-lg border p-2" disabled={busy} value={type} onChange={e=>onChange({...draft,type:e.target.value})}><option value="house">House</option><option value="condo">Condominium</option></select></label>
    </div>
    <button className={button} disabled={busy||!name.trim()}>Prepare dwelling</button>
  </form>;
};
export const ManagementSubscriptionView=({data,loading,error,busy,notice,preview,onReload,onAction,stockDraft,onStockDraftChange,cessation,cessationReason='',onCessationReason,restoration,restorationReason='',onRestorationReason})=>{
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
      <PreparedStockForm busy={busy} onAction={onAction} draft={stockDraft} onChange={onStockDraftChange}/>
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
        <p className="text-sm text-slate-600">{data.status==='trialing'?'This existing trial does not grant management access. You can end management without a new charge or credit.':'Monthly, no trial. Additions are prorated onto the next regular invoice. Reductions apply at renewal. A failed renewal has a seven-day grace period.'}</p>
        <div className="flex flex-wrap gap-3">
          {data.status==='pending'&&<button className={button} disabled={busy} onClick={()=>onAction('checkout',{inventoryHash:data.inventoryHash})}>Open sandbox checkout</button>}
          <button className={button} disabled={busy} onClick={()=>onAction('refresh',{})}>Refresh Stripe status</button>
          {data.status!=='pending'&&<><button className={button} disabled={busy} onClick={()=>onAction('portal',{})}>Payment method & invoices</button><button className={button} disabled={busy||data.entitlement.state!=='active'} onClick={()=>onAction('quantity-preview',{})}>Review quantity change</button></>}
        </div>
        {data.pendingOperation&&<div className="space-y-2 text-sm text-amber-800">
          <p>An operation is awaiting confirmation: {data.pendingOperation.kind.replaceAll('_',' ')}.</p>
          <button className={button} disabled={busy} onClick={()=>onAction(data.pendingOperation.kind==='quantity_preview'?'quantity-preview':data.pendingOperation.kind==='quantity_apply'?'quantity-apply':data.pendingOperation.kind==='cessation'?'stock/cessation':data.pendingOperation.kind==='restore'?'stock/restore':data.pendingOperation.kind,data.pendingOperation.payload,data.pendingOperation.id)}>Retry unfinished operation</button>
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
    {cessation&&<section aria-labelledby="cessation-title" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 id="cessation-title" className="text-xl font-semibold">End management: {cessation.label}</h2>
      <p className="text-sm">Management ends only after tenancy, financial, maintenance and reservation obligations are closed. Existing records and documents are retained.</p>
      <p className="text-sm">{cessation.remainingManagedDwellings} managed {cessation.remainingManagedDwellings===1?'dwelling':'dwellings'} will remain. {cessation.cleanupMode?(cessation.timing==='cancel_at_renewal'?'The subscription will end at the current period end. Existing invoices remain payable; no new charge or credit is created.':'The lower quantity applies to future invoices. Existing invoices and retries keep their original amounts; no new charge or credit is created.'):cessation.timing==='unchanged'?'Your subscription and existing invoices will not change. No charge or refund is created.':`${cessation.timing==='cancel_at_renewal'?'The subscription will end at renewal.':'The lower billed quantity starts at renewal.'} The current period remains billed with no immediate refund.`}</p>
      {!cessation.eligible&&<ul role="alert" className="list-disc space-y-2 pl-5 text-sm">{cessation.blockers.map(item=><li key={item.code}>{item.message} ({item.count})</li>)}</ul>}
      <label className="block text-sm">Reason for ending management<textarea className="mt-1 w-full rounded-lg border p-2" disabled={busy} minLength={10} maxLength={1000} value={cessationReason} onChange={e=>onCessationReason(e.target.value)}/></label>
      <button className={button} disabled={busy||!cessation.eligible||cessationReason.trim().length<10} onClick={()=>onAction('stock/cessation',{propertyId:cessation.propertyId,unitId:cessation.unitId,inventoryHash:cessation.inventoryHash,reason:cessationReason})}>Confirm management cessation</button>
    </section>}
    {restoration&&<section aria-labelledby="restoration-title" className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50 p-5">
      <h2 id="restoration-title" className="text-xl font-semibold">Restore management: {restoration.label}</h2>
      <p className="text-sm">The retained dwelling and its eligible units return to management from confirmation. Previous records stay attached; nothing is backdated. Listing preferences are retained.</p>
      <p className="text-sm">{restoration.to} managed dwellings after restoration. {restoration.timing==='unchanged'?'Complimentary access keeps its existing expiry. Subscription obligations remain unchanged.':restoration.timing==='paid_capacity'?'Already-paid capacity is retained. The subscription will still end at its scheduled date.':restoration.timing==='prorated_next_invoice'?'Additional capacity is prorated from confirmation onto the next regular invoice; there is no immediate collection.':'Already-paid capacity is retained; the reviewed quantity applies at renewal.'}</p>
      <label className="block text-sm">Reason for restoring management<textarea className="mt-1 w-full rounded-lg border p-2" value={restorationReason} onChange={e=>onRestorationReason(e.target.value)} maxLength={1000} disabled={busy}/></label>
      <button className={button} disabled={busy||restorationReason.trim().length<10} onClick={()=>onAction('stock/restore',{propertyId:restoration.propertyId,unitId:restoration.unitId,inventoryHash:restoration.inventoryHash,reason:restorationReason})}>Confirm restoration</button>
    </section>}
    {data.restorationEnabled&&data.ceasedStock?.length>0&&<section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-semibold">Management ended</h2><p className="mt-1 text-sm text-slate-500">Review available capacity before restoring a retained dwelling. Cancelled subscriptions require explicit reactivation.</p>
      <ul className="mt-4 divide-y divide-slate-100">{data.ceasedStock.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{item.label}</span><button className={button} disabled={busy} onClick={()=>onAction('stock/restoration-preview',{propertyId:item.propertyId,unitId:item.unitId})}>Review restoration</button></li>)}</ul>
    </section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-semibold">Dwelling inventory</h2><p className="mt-1 text-sm text-slate-500">Vacant and unlisted dwellings count. A building and its separately rentable units are never counted twice.</p><ul className="mt-4 divide-y divide-slate-100">{data.inventory.map(item=><li key={item.key} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{item.label}</span>{data.cessationEnabled&&<button className={button} disabled={busy} onClick={()=>onAction('stock/cessation-preview',{propertyId:item.propertyId,unitId:item.unitId})}>Review ending management</button>}</li>)}</ul></section>
  </>}
</div>;
};

export default function ManagementSubscription(){
  const {user,membership}=useAuth();
  const tenantId=membership?.tenant_id || user?.tenant_id;
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null);
  const [stockDraft,setStockDraft]=useState(()=>({id:crypto.randomUUID(),name:'',country:'LK',type:'house'}));
  const [restoration,setRestoration]=useState(null),[restorationReason,setRestorationReason]=useState('');
  const [cessation,setCessation]=useState(null),[cessationReason,setCessationReason]=useState('');
  const context=useRef('');context.current=`${user?.id}:${tenantId}`;
  const requests=useRef(new Map());
  const load=async()=>{const scope=context.current;setLoading(true);setError('');try{const result=await requestMssqlApi('/api/management-billing/status');if(context.current===scope){setData(result);}}catch(e){if(context.current===scope){setError(e.message);}}finally{if(context.current===scope){setLoading(false);}}};
  useEffect(()=>{setData(null);setPreview(null);setCessation(null);setRestoration(null);setRestorationReason('');setCessationReason('');setStockDraft({id:crypto.randomUUID(),name:'',country:'LK',type:'house'});setNotice('');requests.current.clear();load();},[user?.id,tenantId]);
  const action=async(kind,payload,resumeId)=>{
    const scope=context.current;setBusy(true);setNotice('');
    const key=`${scope}:${kind}:${JSON.stringify(payload)}`;
    let requestId=resumeId || requests.current.get(key);
    if(!requestId){requestId=crypto.randomUUID();requests.current.set(key,requestId);}
    try{
      const result=await requestMssqlApi(`/api/management-billing/${kind}`,{method:'POST',body:kind==='refresh'?{}:kind.startsWith('stock/')&&!['stock/cessation','stock/restore'].includes(kind)?payload:{...payload,requestId}});
      if(context.current!==scope){return;}
      requests.current.delete(key);
      if(result.url){window.location.assign(result.url);return;}
      if(kind==='stock/restoration-preview'){setRestoration(result);setRestorationReason('');setCessation(null);setPreview(null);}
      else if(kind==='stock/cessation-preview'){setRestoration(null);setCessation(result);setCessationReason('');setPreview(null);}
      else if(kind==='quantity-preview'){setRestoration(null);setPreview(result);setCessation(null);}
      else{setRestoration(null);setCessation(null);setPreview(null);setNotice(kind==='stock/prepare'?'Dwelling prepared. Billing confirmation is still required before it becomes managed.':kind==='stock/withdraw'?'Prepared additions withdrawn. Managed stock and historical records are unchanged.':'Stripe status updated.');}
      if(kind==='stock/restore'){setNotice('Management restored from now. Previous records remain available; no billing was backdated.');}
      if(kind==='stock/prepare'){setStockDraft({id:crypto.randomUUID(),name:'',country:'LK',type:'house'});}
      if(kind==='stock/cessation'){setNotice(result.cleanupMode?'Management ended. Existing invoices remain payable; no new charge or credit was created. Historical records remain available.':result.billingUnchanged?'Management ended. Subscription and existing invoices are unchanged; historical records remain available.':'Management ended. Billing changes apply at renewal; historical records remain available.');}
      await load();
      return true;
    }catch(e){if(context.current===scope){setNotice(e.message);if(e.status>=400&&e.status<500){requests.current.delete(key);}await load();}}finally{if(context.current===scope){setBusy(false);}}
  };
  return <ManagementSubscriptionView {...{data,loading,error,busy,notice,preview,stockDraft,cessation,cessationReason,restoration,restorationReason}} onRestorationReason={setRestorationReason} onStockDraftChange={setStockDraft} onCessationReason={setCessationReason} onReload={load} onAction={action}/>;
}
