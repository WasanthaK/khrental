import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ManagementPricingView,ManagementComplimentaryView} from '../../../src/pages/ManagementPricing';
import {ManagementSubscriptionView} from '../../../src/pages/ManagementSubscription';
import '../../../src/index.css';
const initial={market:'LK',billingCurrency:'USD',baseFee:'5.00',rentCurrency:'LKR',includedRent:'',excessPolicy:'pending',effectiveDate:'',reason:'Synthetic screen review. No commercial approval.'};
function Fixture(){
 const [form,setForm]=useState(initial),[quantity,setQuantity]=useState('12'),[preview,setPreview]=useState(null),[notice,setNotice]=useState('');
 const [compMode,setCompMode]=useState('fixed'),[expiry,setExpiry]=useState('2027-01-01T00:00'),[note,setNote]=useState('Synthetic complimentary acceptance decision.');
 const [stockDraft,setStockDraft]=useState({id:'11111111-1111-4111-8111-111111111111',name:'',country:'LK',type:'house'});
 const [cessationReason,setCessationReason]=useState(''),[loading,setLoading]=useState(false);
 const params=new URLSearchParams(location.search),screen=params.get('screen'),scenario=params.get('scenario');
 const data={enrolled:true,configured:true,inventoryQuantity:12,billedQuantity:12,status:'active',entitlement:{state:'active'},cancelAtPeriodEnd:false,
   inventory:Array.from({length:12},(_,i)=>({key:`unit:${i}`,label:`Example residence · Unit ${i+1}`}))};
 if(screen==='subscription'){
  if(scenario){Object.assign(data,{inventoryQuantity:1,billedQuantity:2,pendingQuantity:1,paidThrough:'2026-12-06T12:00:00.000Z',inventory:[data.inventory[0]]});}
  if(scenario==='cessation-local'){data.entitlement={state:'complimentary'};}
  if(scenario==='applied'){Object.assign(data,{billedQuantity:1,pendingQuantity:null});}
  if(scenario==='cancelled'){data.cancelAtPeriodEnd=true;}
  if(scenario==='missing-date'){data.paidThrough=null;}
  if(scenario==='invalid-date'){data.paidThrough='invalid';}
  if(['zero-preview','zero-ending'].includes(scenario)){Object.assign(data,{inventoryQuantity:0,inventory:[],pendingQuantity:null});}
  if(scenario==='zero-ending'){Object.assign(data,{cancelAtPeriodEnd:true,pendingQuantity:0,entitlement:{state:'ending'}});}
  if(scenario==='interrupted-cancellation'){data.pendingOperation={id:'fixture-interrupted',kind:'cancellation',payload:{cancelAtPeriodEnd:true}};}
  if(['staged-stock','staged-stock-failure'].includes(scenario)){Object.assign(data,{enrolled:false,stagingEnabled:true,inventoryQuantity:0,billedQuantity:0,status:'not_enrolled',inventory:[],
    pendingStock:[{id:'staged-home',kind:'property',label:'Prepared home'}],proposedInventoryQuantity:1});}
  const quantityPreview=scenario==='zero-preview'?{previewId:'fixture-preview',from:2,to:0,timing:'cancel_at_renewal',nextInvoiceTotalMinor:null,currency:'usd'}:null;
  const cessation=scenario?.startsWith('cessation-')?{label:'Example residence',propertyId:'11111111-1111-4111-8111-111111111111',unitId:null,inventoryHash:'a'.repeat(64),remainingManagedDwellings:0,timing:scenario==='cessation-local'?'unchanged':'cancel_at_renewal',eligible:scenario!=='cessation-blocked',blockers:scenario!=='cessation-blocked'?[]:[{code:'TENANCY_OPEN',message:'Close or cancel the remaining tenancy/agreement work.',count:1}]}:null;
  return <ManagementSubscriptionView data={data} preview={quantityPreview} notice={notice} loading={loading}
    stockDraft={stockDraft} onStockDraftChange={setStockDraft} cessation={cessation} cessationReason={cessationReason} onCessationReason={setCessationReason}
    onAction={async(kind,payload)=>{
      if(scenario==='staged-stock-failure'&&kind==='stock/prepare'){
        window.stockAttempts=[...(window.stockAttempts||[]),payload];setLoading(true);
        setTimeout(()=>{setLoading(false);setNotice('Please retry your prepared addition.');},100);return false;
      }
      setNotice(`Fixture action: ${kind}`);
    }} onReload={()=>{}}/>;
 }
 if(screen==='complimentary'){return <><h1 className="mx-auto max-w-6xl p-6 text-3xl font-semibold">Management access</h1><ManagementComplimentaryView
  workspaces={[{id:'fixture',name:'Example test workspace'}]} tenantId="fixture" status={{version:1,mode:null,entitlement:{state:'payment_pending'}}}
  mode={compMode} expiry={expiry} note={note} notice={notice} onSelect={()=>{}} onMode={setCompMode} onExpiry={setExpiry} onNote={setNote}
  onSave={()=>setNotice(`Fixture access saved: ${compMode}`)} onReload={()=>{}}/></>;}
 return <ManagementPricingView form={form} setForm={setForm} quantity={quantity} setQuantity={setQuantity} preview={preview} notice={notice} ready
  versions={[{id:'fixture',market:'LK',version:1,status:'draft',rules:{baseFeeMinor:500,includedRentMinor:null,rentCurrency:'LKR',effectiveAt:null}}]}
  onPreview={()=>setPreview({quantity:Number(quantity),monthlyBaseMinor:Math.round(Number(form.baseFee)*100)*Number(quantity),currency:'USD',ready:false})}
  onSave={e=>{e.preventDefault();setNotice('Fixture draft saved.');}} onPublish={()=>setNotice('Fixture publication selected.')} onReload={()=>{}}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
