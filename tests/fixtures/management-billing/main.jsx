import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ManagementPricingView} from '../../../src/pages/ManagementPricing';
import {ManagementSubscriptionView} from '../../../src/pages/ManagementSubscription';
import '../../../src/index.css';
const initial={market:'LK',billingCurrency:'USD',baseFee:'5.00',rentCurrency:'LKR',includedRent:'',excessPolicy:'pending',effectiveDate:'',reason:'Synthetic screen review. No commercial approval.'};
function Fixture(){
 const [form,setForm]=useState(initial),[quantity,setQuantity]=useState('12'),[preview,setPreview]=useState(null),[notice,setNotice]=useState('');
 const screen=new URLSearchParams(location.search).get('screen');
 const data={enrolled:true,configured:true,inventoryQuantity:12,billedQuantity:12,status:'active',entitlement:{state:'active'},cancelAtPeriodEnd:false,
   inventory:Array.from({length:12},(_,i)=>({key:`unit:${i}`,label:`Example residence · Unit ${i+1}`}))};
 if(screen==='subscription')return <ManagementSubscriptionView data={data} notice={notice} onAction={kind=>setNotice(`Fixture action: ${kind}`)} onReload={()=>{}}/>;
 return <ManagementPricingView form={form} setForm={setForm} quantity={quantity} setQuantity={setQuantity} preview={preview} notice={notice} ready
  versions={[{id:'fixture',market:'LK',version:1,status:'draft',rules:{baseFeeMinor:500,includedRentMinor:null,rentCurrency:'LKR',effectiveAt:null}}]}
  onPreview={()=>setPreview({quantity:Number(quantity),monthlyBaseMinor:Math.round(Number(form.baseFee)*100)*Number(quantity),currency:'USD',ready:false})}
  onSave={e=>{e.preventDefault();setNotice('Fixture draft saved.');}} onPublish={()=>setNotice('Fixture publication selected.')} onReload={()=>{}}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
