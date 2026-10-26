import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createPublicListingsRouter,createPublicListingPreferencesRouter} from '../src/api/publicListings/router.js';

const tenant='22222222-2222-4222-8222-222222222222';
const user='11111111-1111-4111-8111-111111111111';
const property='33333333-3333-4333-8333-333333333333';
const publicId='44444444-4444-4444-8444-444444444444';
const row={public_id:publicId,propertytype:'house',country_code:'LK',
  public_headline:'Family home',monthly_rent:145000,location_label:'Colombo district',opted_out:0,
  bank_account_number:'redacted_by_contract',property_id:'private_source_id'};
const actor={authSession:{},user:{id:user,role:'admin'},tenantId:tenant,
  membership:{status:'active',role:'admin',tenant_id:tenant}};
const makeCall=async(router,method,path,body,identity)=>{
  const app=express();app.use(express.json());app.use((req,res,next)=>{if(identity)Object.assign(req,identity);next();});
  app.use('/listing',router);
  app.use((error,req,res,next)=>res.status(error.status||500).json({code:error.code||'ERROR'}));
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  try{
    const result=await fetch('http://127.0.0.1:'+server.address().port+'/listing'+path,
      {method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {status:result.status,body:await result.json()};
  }finally{await new Promise(resolve=>server.close(resolve));}
};
test('default-off public API returns 404 before querying SQL',async()=>{
 let called=false;
 const router=createPublicListingsRouter({env:{},rateLimit:async()=>{called=true;return true;},list:async()=>{called=true;return [row]}});
 const result=await makeCall(router,'GET','/?country=LK');
 assert.equal(result.status,404);assert.equal(called,false);
});
test('public read returns only allowlisted data for eligible listings',async()=>{
 const router=createPublicListingsRouter({env:{PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'},
   rateLimit:async()=>true,list:async country=>country==='LK'?[row]:[]});
 const ok=await makeCall(router,'GET','/?country=LK');
 assert.equal(ok.status,200);
 assert.deepEqual(Object.keys(ok.body.data[0]),['id','country','category','title','location','monthlyRent','currency','images']);
 assert.equal(ok.body.data[0].monthlyRent,145000);
 assert.deepEqual(ok.body.data[0].images,[]);
 assert.equal(JSON.stringify(ok.body).includes('redacted_by_contract'),false);
 assert.equal((await makeCall(router,'GET','/?country=US')).status,400);
});
test('country filter discards foreign-market rows even if database list is mis-scoped',async()=>{
  const mixed=[row,{...row,country_code:'BN',public_id:'66666666-6666-4666-8666-666666666666'}];
  const router=createPublicListingsRouter({
    env:{PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'},
    rateLimit:async()=>true,list:async()=>mixed
  });
  const sriLanka=await makeCall(router,'GET','/?country=LK');
  const brunei=await makeCall(router,'GET','/?country=BN');
  assert.equal(sriLanka.status,200);
  assert.equal(sriLanka.body.data.length,1);
  assert.equal(sriLanka.body.data[0].country,'LK');
  assert.equal(brunei.body.data.length,1);
  assert.equal(brunei.body.data[0].country,'BN');
});

test('listing details cannot be opened through the wrong country',async()=>{
  const router=createPublicListingsRouter({
    env:{PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'},
    rateLimit:async()=>true,find:async()=>row
  });
  assert.equal((await makeCall(router,'GET','/'+publicId)).status,400);
  assert.equal((await makeCall(router,'GET','/'+publicId+'?country=US')).status,400);
  assert.equal((await makeCall(router,'GET','/'+publicId+'?country=BN')).status,404);
  const result=await makeCall(router,'GET','/'+publicId+'?country=LK');
  assert.equal(result.status,200);
  assert.equal(result.body.data.country,'LK');
});

test('shared limiter blocks browsing before querying listings',async()=>{
 let count=0;
 const router=createPublicListingsRouter({env:{PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'},
  rateLimit:async()=>false,list:async()=>{count++;return [row]}});
 assert.equal((await makeCall(router,'GET','/?country=LK')).status,429);assert.equal(count,0);
});
test('management is disabled without release switch',async()=>{
 const router=createPublicListingPreferencesRouter({env:{},context:(req,res,next)=>next()});
 assert.equal((await makeCall(router,'PATCH','/'+property,{optedOut:true},actor)).status,404);
});
test('only authenticated active tenant admins can change public opt-out',async()=>{
 let writes=0;
 const router=createPublicListingPreferencesRouter({
  env:{PUBLIC_LISTING_MANAGEMENT_ENABLED:'true'},
  context:(req,res,next)=>next(),
  put:async()=>{writes++;return {opted_out:1}}
 });
 for(const identity of [undefined,{...actor,user:{id:user,role:'staff'},membership:{...actor.membership,role:'staff'}},
   {...actor,membership:{...actor.membership,status:'inactive'}},
   {...actor,membership:{...actor.membership,tenant_id:'55555555-5555-4555-8555-555555555555'}}]){
   assert.equal((await makeCall(router,'PATCH','/'+property,{optedOut:true},identity)).status,403);
 }
 assert.equal(writes,0);
});
test('tenant admin may opt out and restore eligibility without manual publication',async()=>{
 const seen=[];
 const router=createPublicListingPreferencesRouter({
  env:{PUBLIC_LISTING_MANAGEMENT_ENABLED:'true'},context:(req,res,next)=>next(),
  put:async input=>{seen.push(input.changes.optedOut);return {public_id:publicId, opted_out:input.changes.optedOut, country_code:'LK'};}
 });
 assert.equal((await makeCall(router,'PATCH','/'+property,{optedOut:true},actor)).status,200);
 assert.equal((await makeCall(router,'PATCH','/'+property,{optedOut:false},actor)).status,200);
 assert.deepEqual(seen,[true,false]);
});
