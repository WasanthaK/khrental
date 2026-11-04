import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {BILLING_ACCOUNT,parsePricing,pricingPreview,dwellingInventory,entitlement,verifyStripeSignature} from '../src/api/managementBilling/contract.js';
import {createStripeClient,stripeForm,subscriptionProjection} from '../src/api/managementBilling/stripe.js';
import {createManagementBillingRouter,createManagementBillingWebhook} from '../src/api/managementBilling/router.js';

const tenant='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const now=Date.parse('2026-11-03T12:00:00Z');
const rules={market:'LK',billingCurrency:'USD',baseFeeMinor:500,rentCurrency:'LKR',includedRentMinor:null,excessPolicy:'pending',effectiveAt:null,reason:'Threshold awaits an approved market decision.'};
const account={stripe_customer_id:'cus_org',stripe_subscription_id:'sub_org',stripe_price_id:'price_approved',initial_payment_verified:false};
const subscription={id:'sub_org',customer:'cus_org',livemode:false,status:'active',items:{data:[{id:'si_org',quantity:2,current_period_end:now/1000+86400,
  price:{id:'price_approved',currency:'usd',recurring:{interval:'month',usage_type:'licensed'}}}]} };
const invoice={id:'in_org',customer:'cus_org',livemode:false,parent:{subscription_details:{subscription:'sub_org'}},currency:'usd',status:'paid',amount_due:1000,amount_paid:1000,amount_remaining:0,
  lines:{data:[{parent:{subscription_item_details:{subscription_item:'si_org',proration:false}},period:{end:now/1000+86400}}]}};

test('pricing drafts preserve unresolved policy and preview uses exact minor units',()=>{
  assert.equal(pricingPreview(parsePricing(rules),12).monthlyBaseMinor,6000);
  assert.equal(pricingPreview(parsePricing(rules),12).ready,false);
  assert.equal(pricingPreview(parsePricing({...rules,includedRentMinor:0,excessPolicy:'none',effectiveAt:'2026-12-01T00:00:00Z'}),1).ready,true);
  for(const change of [{market:'US'},{billingCurrency:'LKR'},{rentCurrency:'BND'},{baseFeeMinor:1.1},{baseFeeMinor:0},{includedRentMinor:-1},{excessPolicy:'percentage'},{reason:'short'},{effectiveAt:'2026-12-01'}])
    assert.throws(()=>parsePricing({...rules,...change}));
  for(const quantity of [0,-1,1.1,10001,'12']) assert.throws(()=>pricingPreview(rules,quantity));
});
test('dwelling count separates whole houses and child units without occupancy or listing loopholes',()=>{
  const properties=[{id:'p1',tenant_id:tenant,name:'House',propertytype:'house',status:'occupied',published:false},
    {id:'p2',tenant_id:tenant,name:'Apartments',propertytype:'apartment complex'},
    {id:'p3',tenant_id:tenant,name:'Land',propertytype:'land'},
    {id:'foreign',tenant_id:other,name:'Other',propertytype:'house'}];
  const units=Array.from({length:12},(_,i)=>({id:`u${i}`,tenant_id:tenant,propertyid:'p2',unitnumber:i,status:i%2?'occupied':'available'}));
  const result=dwellingInventory({tenantId:tenant,properties,units});
  assert.equal(result.length,13);assert.equal(result.some(i=>i.key==='property:p2'),false);
  assert.throws(()=>dwellingInventory({tenantId:tenant,properties,units:[...units,{...units[0],tenant_id:other}]}),{code:'BILLING_INVENTORY_SCOPE'});
  assert.throws(()=>dwellingInventory({tenantId:tenant,properties,units:[...units,units[0]]}),{code:'BILLING_DUPLICATE_DWELLING'});
});
test('initial payment proof is required; canceled accounts preserve historical access',()=>{
  for(const state of [null,{subscription_status:'active'},{subscription_status:'trialing'},{subscription_status:'canceled',paid_through:new Date(now+86400000).toISOString()}]){
    assert.equal(entitlement(state,now).management,false);assert.equal(entitlement(state,now).historicalAccess,true);
  }
  assert.equal(entitlement({subscription_status:'active',paid_through:new Date(now+86400000).toISOString()},now).management,false);
  assert.equal(entitlement({initial_payment_verified:true,subscription_status:'active',paid_through:new Date(now+86400000).toISOString()},now).management,true);
});
test('renewal grace lasts exactly seven days and never turns an initial failure into a trial',()=>{
  const state={subscription_status:'past_due',initial_payment_verified:true,grace_started_at:new Date(now).toISOString()};
  assert.equal(entitlement(state,now+7*86400000-1).management,true);
  assert.equal(entitlement(state,now+7*86400000).management,false);
  assert.equal(entitlement({...state,initial_payment_verified:false},now).management,false);
  assert.equal(entitlement({...state,subscription_status:'unpaid'},now).management,false);
  assert.equal(entitlement({...state,risk_hold:true},now).management,false);
});
test('fixed complimentary grants expire, ongoing grants are explicit',()=>{
  assert.equal(entitlement({comp_type:'fixed',comp_expires_at:new Date(now+1).toISOString()},now).management,true);
  assert.equal(entitlement({comp_type:'fixed',comp_expires_at:new Date(now).toISOString()},now).management,false);
  assert.equal(entitlement({comp_type:'ongoing'},now).state,'complimentary');
});
test('webhook signatures require original bytes, bounded timestamps, sandbox and account binding',()=>{
  const secret='whsec_fixture';const body=Buffer.from(JSON.stringify({id:'evt_test',type:'invoice.paid',livemode:false,data:{object:{id:'in_test'}}}));
  const signatureFor=(bytes,timestamp=now/1000)=>`t=${timestamp},v1=${crypto.createHmac('sha256',secret).update(`${timestamp}.`).update(bytes).digest('hex')}`;
  const signature=signatureFor(body);
  assert.equal(verifyStripeSignature({body,signature,secret,now}).id,'evt_test');
  for(const change of [{body:Buffer.concat([body,Buffer.from(' ')])},{signature:signatureFor(body,now/1000-301)},{signature:signatureFor(body,now/1000+301)},
    {signature:`${signature},t=${now/1000}`},{signature:signature.replace(/v1=.*/, 'v1=bad')},{body:JSON.parse(body)}])
    assert.throws(()=>verifyStripeSignature({body,signature,secret,now,...change}),{code:'STRIPE_SIGNATURE_INVALID'});
  for(const extra of [{livemode:true},{account:'acct_other'}]){
    const changed=Buffer.from(JSON.stringify({...JSON.parse(body),...extra}));
    assert.throws(()=>verifyStripeSignature({body:changed,signature:signatureFor(changed),secret,now}));
  }
});
test('paid invoice graph and line period, not active status, establish initial payment',()=>{
  const projected=subscriptionProjection({subscription,invoice,account,now});
  assert.equal(projected.initial_payment_verified,true);assert.equal(projected.paid_through,new Date(now+86400000).toISOString());
  for(const change of [{customer:'cus_foreign'},{parent:{subscription_details:{subscription:'sub_foreign'}}},{status:'open'},{amount_remaining:1},{lines:{data:[]}}])
    assert.equal(subscriptionProjection({subscription,invoice:{...invoice,...change},account,now}).initial_payment_verified,false);
  assert.throws(()=>subscriptionProjection({subscription:{...subscription,customer:'cus_foreign'},invoice,account,now}),{code:'BILLING_SUBSCRIPTION_MISMATCH'});
  assert.throws(()=>subscriptionProjection({subscription:{...subscription,trial_end:now/1000+30},invoice,account,now}),{code:'BILLING_SUBSCRIPTION_MISMATCH'});
});
test('repeated failed-invoice reconciliation cannot extend grace',()=>{
  const failure={...invoice,status:'open',amount_remaining:1000,attempted:true,period_end:now/1000};
  const pastDue={...subscription,status:'past_due'};
  const first=subscriptionProjection({subscription:pastDue,invoice:failure,account:{...account,initial_payment_verified:true},now});
  const retry=subscriptionProjection({subscription:pastDue,invoice:failure,account:{...account,...first},now:now+2*86400000});
  assert.equal(first.grace_started_at,retry.grace_started_at);
});
test('Stripe client encodes nested fields, pins account and refuses live configuration',async()=>{
  assert.equal(stripeForm({line_items:[{price:'price_x',quantity:12}],automatic_tax:{enabled:false}}).get('line_items[0][quantity]'),'12');
  const env={MANAGEMENT_BILLING_SANDBOX_ENABLED:'true',STRIPE_SANDBOX_SECRET_KEY:'rk_test_fixture',STRIPE_SANDBOX_ACCOUNT_ID:BILLING_ACCOUNT};
  let called=0;const fetchImpl=async(url,options)=>{called++;assert.equal(options.headers['Stripe-Version'],'2026-09-30.endive');return {ok:true,json:async()=>({id:BILLING_ACCOUNT})};};
  await createStripeClient({env,fetchImpl}).assertAccount();assert.equal(called,1);
  await assert.rejects(createStripeClient({env:{...env,STRIPE_SANDBOX_SECRET_KEY:'sk_live_fixture'},fetchImpl}).assertAccount(),{code:'BILLING_NOT_CONFIGURED'});
  await assert.rejects(createStripeClient({env,fetchImpl}).request('POST','/v1/customers',{}),{code:'BILLING_IDEMPOTENCY_REQUIRED'});
  await assert.rejects(createStripeClient({env,fetchImpl:async()=>({ok:true,json:async()=>({id:'acct_foreign'})})}).assertAccount(),{code:'STRIPE_ACCOUNT_MISMATCH'});
});

const withServer=async(router,run)=>{
  const app=express();app.use(express.json());app.use(router);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}
};
test('pricing API denies organization admins, absent sessions and development bypass',async()=>{
  const env={MANAGEMENT_BILLING_SCHEMA_READY:'true'};
  for(const identity of [{authSession:{},user:{id:tenant},admin:false},{authSession:null,user:{id:tenant},admin:true},{authSession:{},user:{id:tenant,is_dev_bypass:true},admin:true}]){
    let read=false;
    const router=createManagementBillingRouter({env,store:{listPricing:async()=>{read=true;return [];}},stripe:{configured:()=>false},
      resolveContext:(req,_res,next)=>{Object.assign(req,identity);next();},checkPlatformAdmin:async()=>identity.admin});
    await withServer(router,async origin=>{const response=await fetch(`${origin}/admin/pricing`);assert.ok([401,403].includes(response.status));});
    assert.equal(read,false);
  }
});
test('pricing API rejects stale version authority fields and never accepts a client price ID',async()=>{
  let saved=0;const router=createManagementBillingRouter({env:{MANAGEMENT_BILLING_SCHEMA_READY:'true'},
    store:{savePricing:async()=>{saved++;throw Object.assign(new Error('Changed'),{status:409});}},stripe:{configured:()=>false},
    resolveContext:(req,_res,next)=>{req.authSession={};req.user={id:tenant};next();},checkPlatformAdmin:async()=>true});
  await withServer(router,async origin=>{
    const call=body=>fetch(`${origin}/admin/pricing`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await call({rules,expectedVersion:0,stripePriceId:'price_attacker'})).status,400);
    assert.equal((await call({rules,expectedVersion:0})).status,409);assert.equal(saved,1);
  });
});
test('disabled webhook does not read the store or acknowledge events as processed',async()=>{
  await withServer(createManagementBillingWebhook({env:{},store:{},stripe:{configured:()=>false}}),async origin=>{
    assert.equal((await fetch(origin,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
  });
});
