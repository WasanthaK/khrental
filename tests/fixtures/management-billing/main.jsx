import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ManagementPricingView,ManagementComplimentaryView} from '../../../src/pages/ManagementPricing';
import {ManagementSubscriptionView} from '../../../src/pages/ManagementSubscription';
import '../../../src/index.css';
const initial={market:'LK',billingCurrency:'USD',baseFee:'5.00',rentCurrency:'LKR',includedRent:'',excessPolicy:'pending',effectiveDate:'',reason:'Synthetic screen review. No commercial approval.'};
function Fixture(){
 const [form,setForm]=useState(initial),[quantity,setQuantity]=useState('12'),[preview,setPreview]=useState(null),[notice,setNotice]=useState('');
 const [compMode,setCompMode]=useState('fixed'),[expiry,setExpiry]=useState('2027-01-01T00:00'),[note,setNote]=useState('Synthetic complimentary acceptance decision.');
 const params=new URLSearchParams(location.search),screen=params.get('screen'),scenario=params.get('scenario');
 const data={enrolled:true,configured:true,inventoryQuantity:12,billedQuantity:12,status:'active',entitlement:{state:'active'},cancelAtPeriodEnd:false,
   inventory:Array.from({length:12},(_,i)=>({key:`unit:${i}`,label:`Example residence · Unit ${i+1}`}))};
 if(screen==='subscription'){
  if(scenario){Object.assign(data,{inventoryQuantity:1,billedQuantity:2,pendingQuantity:1,paidThrough:'2026-12-06T12:00:00.000Z',inventory:[data.inventory[0]]});}
  if(scenario==='applied')Object.assign(data,{billedQuantity:1,pendingQuantity:null});
  if(scenario==='cancelled')data.cancelAtPeriodEnd=true;
  if(scenario==='missing-date')data.paidThrough=null;
  if(scenario==='invalid-date')data.paidThrough='invalid';
  return <ManagementSubscriptionView data={data} notice={notice} onAction={kind=>setNotice(`Fixture action: ${kind}`)} onReload={()=>{}}/>;
 }
 if(screen==='complimentary')return <><h1 className="mx-auto max-w-6xl p-6 text-3xl font-semibold">Management access</h1><ManagementComplimentaryView
  workspaces={[{id:'fixture',name:'Example test workspace'}]} tenantId="fixture" status={{version:1,mode:null,entitlement:{state:'payment_pending'}}}
  mode={compMode} expiry={expiry} note={note} notice={notice} onSelect={()=>{}} onMode={setCompMode} onExpiry={setExpiry} onNote={setNote}
  onSave={()=>setNotice(`Fixture access saved: ${compMode}`)} onReload={()=>{}}/></>;
 return <ManagementPricingView form={form} setForm={setForm} quantity={quantity} setQuantity={setQuantity} preview={preview} notice={notice} ready
  versions={[{id:'fixture',market:'LK',version:1,status:'draft',rules:{baseFeeMinor:500,includedRentMinor:null,rentCurrency:'LKR',effectiveAt:null}}]}
  onPreview={()=>setPreview({quantity:Number(quantity),monthlyBaseMinor:Math.round(Number(form.baseFee)*100)*Number(quantity),currency:'USD',ready:false})}
  onSave={e=>{e.preventDefault();setNotice('Fixture draft saved.');}} onPublish={()=>setNotice('Fixture publication selected.')} onReload={()=>{}}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
