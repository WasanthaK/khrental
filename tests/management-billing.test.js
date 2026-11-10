import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {BILLING_ACCOUNT,parsePricing,pricingPreview,dwellingInventory,entitlement,verifyStripeSignature,complimentaryChange,managementWriteEnforced} from '../src/api/managementBilling/contract.js';
import {assertManagementWrite} from '../src/api/managementBilling/store.js';
import {sql} from '../src/api/mssql/pool.js';
import {createStripeClient,stripeForm,firstRenewalFailure,subscriptionProjection} from '../src/api/managementBilling/stripe.js';
import {createManagementBillingRouter,createManagementBillingWebhook} from '../src/api/managementBilling/router.js';
import {createBillingService} from '../src/api/managementBilling/service.js';

const tenant='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';

test('management write rollout requires explicit server enablement and an exact organization scope',()=>{
  assert.equal(managementWriteEnforced(tenant,{}),false);
  assert.equal(managementWriteEnforced(tenant,{MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:'false'}),false);
  const env={MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:'true',MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS:` ${tenant.toUpperCase()}, ${other} `};
  assert.equal(managementWriteEnforced(tenant,env),true);
  assert.equal(managementWriteEnforced('33333333-3333-4333-8333-333333333333',env),false);
  assert.throws(()=>managementWriteEnforced('invalid',env),{code:'BILLING_ID_INVALID'});
  for(const scope of ['', '*', `${tenant},`, `${tenant},invalid`]) {
    assert.throws(()=>managementWriteEnforced(tenant,{...env,MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS:scope}),{code:'BILLING_ENFORCEMENT_CONFIGURATION'});
  }
  assert.throws(()=>managementWriteEnforced(tenant,{...env,MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:'TRUE'}),{code:'BILLING_ENFORCEMENT_CONFIGURATION'});
});

test('selected management writes fail closed without schema readiness or their own SQL transaction',async()=>{
  const env={MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:'true',MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS:tenant};
  await assert.rejects(assertManagementWrite({tenantId:tenant,env}),{code:'BILLING_ACCESS_UNAVAILABLE'});
  await assert.rejects(assertManagementWrite({tenantId:tenant,env:{...env,MANAGEMENT_BILLING_SCHEMA_READY:'true'},transaction:{request:()=>{throw Error('pool reads must not be used');}}}),{code:'BILLING_ACCESS_UNAVAILABLE'});
  await assertManagementWrite({tenantId:tenant,env:{}});
  await assertManagementWrite({tenantId:other,env});
});

test('management write expiry uses the locked database timestamp rather than the application clock',async t=>{
  const env={MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:'true',MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS:tenant,MANAGEMENT_BILLING_SCHEMA_READY:'true'};
  const transaction=new sql.Transaction();
  let row={stripe_account_id:BILLING_ACCOUNT,subscription_status:'active',initial_payment_verified:true,
    paid_through:new Date('2026-11-09T00:00:00Z'),entitlement_checked_at:new Date('2026-11-10T00:00:00Z')};
  t.mock.method(sql.Request.prototype,'query',async function(){
    assert.equal(this.parent,transaction);
    assert.equal(this.parameters.tenantId.value,tenant);
    return {recordset:row?[row]:[]};
  });
  const now=t.mock.method(Date,'now',()=>0);
  await assert.rejects(assertManagementWrite({tenantId:tenant,transaction,env}),{code:'MANAGEMENT_READ_ONLY'});
  now.mock.mockImplementation(()=>4102444800000);
  row.paid_through=new Date('2026-11-11T00:00:00Z');
  await assertManagementWrite({tenantId:tenant,transaction,env});
  row.entitlement_checked_at=null;
  await assert.rejects(assertManagementWrite({tenantId:tenant,transaction,env}),{code:'BILLING_ACCESS_UNAVAILABLE'});
  row=null;
  await assert.rejects(assertManagementWrite({tenantId:tenant,transaction,env}),{code:'MANAGEMENT_READ_ONLY'});
});
const now=Date.parse('2026-11-03T12:00:00Z');
const rules={market:'LK',billingCurrency:'USD',baseFeeMinor:500,rentCurrency:'LKR',includedRentMinor:null,excessPolicy:'pending',effectiveAt:null,reason:'Threshold awaits an approved market decision.'};
const account={stripe_customer_id:'cus_org',stripe_subscription_id:'sub_org',stripe_price_id:'price_approved',initial_payment_verified:false};
const subscription={id:'sub_org',customer:'cus_org',livemode:false,status:'active',items:{data:[{id:'si_org',quantity:2,current_period_end:now/1000+86400,
  price:{id:'price_approved',currency:'usd',recurring:{interval:'month',usage_type:'licensed'}}}]} };
const invoice={id:'in_org',customer:'cus_org',livemode:false,parent:{subscription_details:{subscription:'sub_org'}},currency:'usd',status:'paid',amount_due:1000,amount_paid:1000,amount_remaining:0,
  lines:{data:[{parent:{subscription_item_details:{subscription_item:'si_org',proration:false}},period:{end:now/1000+86400}}]}};

// A transactional in-memory store exercises provider response loss locally.
// SQL locking, rollback and constraints are covered separately by the disposable SQL suite.
const zeroStockFixture=()=>{
  const end=Math.floor(Date.now()/1000)+30*86400;
  let state={account:{...account,tenant_id:tenant,initial_payment_verified:true,quantity:2},commands:{},inventory:[]};
  const remote={...structuredClone(subscription),latest_invoice:invoice.id,cancel_at_period_end:false};
  remote.items.data[0].current_period_end=end;
  const paid=structuredClone(invoice);paid.lines.data[0].period.end=end;
  const calls=[];let loseResponse=false,denyActor=false,failAudit=false;
  const q=async(statement,params={})=>{
    if(statement.startsWith('SELECT * FROM dbo.management_billing_commands')){
      const saved=state.commands[params.id];
      return saved&&(!params.tenantId||params.tenantId===saved.tenant_id)?[saved]:[];
    }
    if(statement.startsWith('SELECT result_json')){
      const saved=state.commands[params.previewId];
      return saved?.tenant_id===params.tenantId && saved.kind==='quantity_preview' && saved.status==='completed'?[saved]:[];
    }
    if(statement.startsWith('UPDATE dbo.management_billing_accounts SET subscription_status')){
      const {tenantId,...projection}=params;Object.assign(state.account,projection);return [];
    }
    if(statement.startsWith('UPDATE dbo.management_billing_accounts SET inventory_json')){
      state.account.inventory_json=params.inventory;state.account.pending_quantity=0;return [];
    }
    if(statement.includes("SET status='failed'")){
      Object.assign(state.commands[params.id],{status:'failed',result_json:params.result});return [];
    }
    throw new Error(`Unhandled fixture query: ${statement}`);
  };
  const store={account:async()=>({...state.account}),inventory:async()=>structuredClone(state.inventory),
    read:async()=>Object.values(state.commands).filter(command=>command.status==='pending'),
    assertActor:async()=>{if(denyActor)throw Object.assign(new Error('Revoked actor'),{code:'BILLING_ADMIN_REQUIRED'});},
    audit:async()=>{if(failAudit)throw new Error('Synthetic audit failure');},
    locked:async(_tenant,action)=>{
      const snapshot=structuredClone(state);
      try{return await action(q);}catch(error){state=snapshot;throw error;}
    },
    beginCommand:async({id,kind,payload,tenantId})=>{
      const existing=state.commands[id];if(existing)return {...existing,createdNow:false};
      const storedPayload=['cancellation','quantity_apply'].includes(kind)?{...payload,_subscriptionId:state.account.stripe_subscription_id}:payload;
      state.commands[id]={id,tenant_id:tenantId,kind,payload,payload_json:JSON.stringify(storedPayload),status:'pending'};
      return {...state.commands[id],createdNow:true};
    },
    completeCommand:async(_q,id,result)=>Object.assign(state.commands[id],{status:'completed',result_json:JSON.stringify(result)})};
  const stripe={configured:()=>true,assertAccount:async()=>{},request:async(method,path,body,key)=>{
    calls.push({method,path,body,key});
    if(method==='GET'&&path===`/v1/subscriptions/${remote.id}`)return structuredClone(remote);
    if(method==='GET'&&path===`/v1/invoices/${paid.id}`)return structuredClone(paid);
    if(method==='POST'&&path===`/v1/subscriptions/${remote.id}`){
      assert.ok(key);assert.deepEqual(Object.keys(body),['cancel_at_period_end']);
      remote.cancel_at_period_end=body.cancel_at_period_end;
      if(loseResponse){loseResponse=false;throw Object.assign(new Error('Response lost after provider success'),{code:'STRIPE_UNAVAILABLE',status:503});}
      return structuredClone(remote);
    }
    throw new Error(`Unexpected provider operation: ${method} ${path}`);
  }};
  return {service:createBillingService({store,stripe}),calls,remote,state:()=>state,
    loseNextResponse:()=>{loseResponse=true;},restoreStock:()=>{state.inventory=[{key:'property:restored'}];},
    denyActor:()=>{denyActor=true;},failAudit:()=>{failAudit=true;}};
};

const interruptedCancellation=async(kind='quantity_apply')=>{
  const f=zeroStockFixture(),request={tenantId:tenant,id:crypto.randomUUID(),actorId:tenant};
  const preview=await f.service.quantityPreview({...request,id:crypto.randomUUID()});
  f.loseNextResponse();
  await assert.rejects(kind==='quantity_apply'?f.service.quantityApply({...request,previewId:preview.previewId}):
    f.service.cancel({...request,cancelAtPeriodEnd:true}),{code:'STRIPE_UNAVAILABLE'});
  return {f,request};
};

test('interrupted cancellation readback completes once without replaying provider writes',async()=>{
  for(const kind of ['quantity_apply','cancellation']){
    const {f,request}=await interruptedCancellation(kind);
    // Recovery does not depend on the original command's idempotency window.
    f.state().commands[request.id].created_at=new Date(Date.now()-48*3600000);
    const before=f.calls.filter(call=>call.method==='POST').length;
    const result=await f.service.reconcileCancellation(request);
    assert.equal(result.cancelAtPeriodEnd,true);
    if(kind==='quantity_apply')assert.equal(f.state().account.pending_quantity,0);
    assert.equal(f.state().commands[request.id].status,'completed');
    assert.deepEqual(await f.service.reconcileCancellation(request),result);
    assert.equal(f.calls.filter(call=>call.method==='POST').length,before);
  }
});

test('cancellation readback rejects foreign commands and revoked actors before subscription access',async()=>{
  for(const denied of ['foreign','revoked']){
    const {f,request}=await interruptedCancellation();
    const before=f.calls.length;
    if(denied==='foreign')request.tenantId=other;else f.denyActor();
    await assert.rejects(f.service.reconcileCancellation(request),{code:denied==='foreign'?'BILLING_COMMAND_NOT_FOUND':'BILLING_ADMIN_REQUIRED'});
    assert.equal(f.calls.length,before);
    assert.equal(f.state().commands[request.id].status,'pending');
  }
});

test('unconfirmed cancellation, active schedule and changed stock retain pending work',async()=>{
  for(const mismatch of ['flag','schedule','inventory','quantity','renewal','binding','legacy']){
    const {f,request}=await interruptedCancellation();
    if(mismatch==='flag')f.remote.cancel_at_period_end=false;
    if(mismatch==='schedule')f.remote.schedule='sub_sched_unfinished';
    if(mismatch==='inventory')f.restoreStock();
    const preview=Object.values(f.state().commands).find(command=>command.kind==='quantity_preview');
    if(mismatch==='quantity')preview.result_json=JSON.stringify({...JSON.parse(preview.result_json),to:1});
    if(mismatch==='renewal')Object.assign(f.state().commands[request.id],{kind:'cancellation',payload_json:'{"cancelAtPeriodEnd":false}'});
    if(mismatch==='binding'||mismatch==='legacy'){
      const command=f.state().commands[request.id],payload=JSON.parse(command.payload_json);
      if(mismatch==='binding')payload._subscriptionId='sub_other';else delete payload._subscriptionId;
      command.payload_json=JSON.stringify(payload);
    }
    const before=f.calls.filter(call=>call.method==='POST').length;
    await assert.rejects(f.service.reconcileCancellation(request));
    assert.equal(f.state().commands[request.id].status,'pending');
    assert.equal(f.calls.filter(call=>call.method==='POST').length,before);
  }
});

test('cancellation recovery audit failure rolls back local completion and preserves remote truth',async()=>{
  const {f,request}=await interruptedCancellation();
  const before=structuredClone(f.state());f.failAudit();
  await assert.rejects(f.service.reconcileCancellation(request),/Synthetic audit failure/);
  assert.deepEqual(f.state(),before);
  assert.equal(f.remote.cancel_at_period_end,true);
});

test('zero-stock preview and confirmation end at renewal without a zero-quantity subscription',async()=>{
  const f=zeroStockFixture(),actorId=tenant;
  const preview=await f.service.quantityPreview({tenantId:tenant,id:crypto.randomUUID(),actorId});
  assert.equal(preview.to,0);assert.equal(preview.timing,'cancel_at_renewal');
  assert.equal(f.calls.some(c=>c.method==='POST'),false,'Review must not change provider state');
  const request={tenantId:tenant,id:crypto.randomUUID(),actorId,previewId:preview.previewId};
  const result=await f.service.quantityApply(request);
  assert.equal(result.currentQuantity,2);assert.equal(result.nextRenewalQuantity,0);
  assert.equal(result.cancelAtPeriodEnd,true);assert.equal(f.remote.items.data[0].quantity,2);
  const writes=f.calls.filter(c=>c.method==='POST');
  assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{cancel_at_period_end:true});
  assert.deepEqual(await f.service.quantityApply(request),result);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1,'Completed retry reuses its durable result');
});

test('zero-stock cancellation resumes after lost response and independent ending readback',async()=>{
  const f=zeroStockFixture(),actorId=tenant;
  const preview=await f.service.quantityPreview({tenantId:tenant,id:crypto.randomUUID(),actorId});
  const request={tenantId:tenant,id:crypto.randomUUID(),actorId,previewId:preview.previewId};
  f.loseNextResponse();
  await assert.rejects(f.service.quantityApply(request),{code:'STRIPE_UNAVAILABLE'});
  assert.equal(f.state().commands[request.id].status,'pending');
  assert.equal(f.remote.cancel_at_period_end,true);
  await f.service.refresh(tenant);
  assert.equal(entitlement(f.state().account).state,'ending');
  const result=await f.service.quantityApply(request);
  assert.equal(result.cancelAtPeriodEnd,true);assert.equal(f.state().account.pending_quantity,0);
  assert.equal(new Set(f.calls.filter(c=>c.method==='POST').map(c=>c.key)).size,1,'Ambiguous retries keep the provider idempotency key');
});

test('restored inventory invalidates a zero-stock preview before provider writes',async()=>{
  const f=zeroStockFixture(),actorId=tenant;
  const preview=await f.service.quantityPreview({tenantId:tenant,id:crypto.randomUUID(),actorId});
  f.restoreStock();
  await assert.rejects(f.service.quantityApply({tenantId:tenant,id:crypto.randomUUID(),actorId,previewId:preview.previewId}),{code:'BILLING_PREVIEW_EXPIRED'});
  assert.equal(f.calls.some(c=>c.method==='POST'),false);
});

test('renewal restoration rejects empty stock and a new risk hold stops cancellation retry',async()=>{
  const f=zeroStockFixture(),actorId=tenant;
  await assert.rejects(f.service.cancel({tenantId:tenant,id:crypto.randomUUID(),actorId,cancelAtPeriodEnd:false}),{code:'BILLING_INVENTORY_EMPTY'});
  assert.equal(f.calls.some(c=>c.method==='POST'),false);
  const preview=await f.service.quantityPreview({tenantId:tenant,id:crypto.randomUUID(),actorId});
  const request={tenantId:tenant,id:crypto.randomUUID(),actorId,previewId:preview.previewId};
  f.loseNextResponse();await assert.rejects(f.service.quantityApply(request),{code:'STRIPE_UNAVAILABLE'});
  f.state().account.risk_hold=true;
  await assert.rejects(f.service.quantityApply(request),{code:'BILLING_PREVIEW_STALE'});
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1,'Risk hold cannot be bypassed by the ending-state retry');
});

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
test('complimentary changes require an explicit mode, fresh version, decision note and exact future expiry',()=>{
  const input={mode:'fixed',expiresAt:'2026-11-04T12:00:00Z',expectedVersion:1,reason:'Authorized sandbox acceptance grant.'};
  assert.equal(complimentaryChange(input,now).expiresAt,'2026-11-04T12:00:00.000Z');
  for(const change of [{mode:'free'},{expiresAt:null},{expiresAt:'2026-11-03T12:00:00Z'},
    {expiresAt:'2026-02-30T00:00:00Z'},{expiresAt:'2026-11-04'},{expiresAt:'2026-11-04T12:00:00+00:00'},
    {expectedVersion:0},{expectedVersion:1.5},{reason:'short'},{mode:'ongoing'},{mode:'revoke'}]) {
    assert.throws(()=>complimentaryChange({...input,...change},now));
  }
  for(const mode of ['ongoing','revoke']) {
    assert.equal(complimentaryChange({...input,mode,expiresAt:null},now).expiresAt,null);
  }
  assert.equal(entitlement({comp_type:'ongoing',risk_hold:true},now).management,false,'A comp grant never clears a risk hold');
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
  const first=subscriptionProjection({subscription:pastDue,invoice:failure,account:{...account,initial_payment_verified:true},firstFailureAt:new Date(now).toISOString(),now});
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
test('cancellation reconciliation API requires a genuine organization administrator and rejects authority overrides',async()=>{
  for(const denied of ['anonymous','bypass','participant','revoked','none']){
    let accessed=false;
    const identity={authSession:denied==='anonymous'?null:{},tenantId:tenant,
      user:{id:tenant,is_dev_bypass:denied==='bypass'},
      membership:{tenant_id:tenant,status:denied==='revoked'?'inactive':'active',role:denied==='participant'?'rentee':'admin'}};
    const router=createManagementBillingRouter({env:{MANAGEMENT_BILLING_SCHEMA_READY:'true'},
      store:{locked:async()=>{accessed=true;throw Error('Must reject before store access');}},
      stripe:{assertAccount:async()=>{}},resolveContext:(req,_res,next)=>{Object.assign(req,identity);next();}});
    await withServer(router,async origin=>{
      const response=await fetch(`${origin}/reconcile-cancellation`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requestId:tenant,...(denied==='none'?{tenantId:other,actorId:other}: {})})});
      assert.equal(response.status,denied==='none'?400:denied==='anonymous'||denied==='bypass'?401:403);
    });
    assert.equal(accessed,false);
  }
});
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
test('complimentary API is platform-admin only and never accepts caller-supplied actor or Stripe fields',async()=>{
  let writes=0;
  for(const allowed of [false,true]) {
    const router=createManagementBillingRouter({env:{MANAGEMENT_BILLING_SCHEMA_READY:'true'},
      store:{setComplimentary:async args=>{writes++;assert.equal(args.actorId,tenant);return {version:2,mode:'ongoing'};}},
      stripe:{configured:()=>true},resolveContext:(req,_res,next)=>{req.authSession={};req.user={id:tenant};next();},
      checkPlatformAdmin:async()=>allowed});
    await withServer(router,async origin=>{
      const call=body=>fetch(`${origin}/admin/complimentary/${other}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const body={mode:'ongoing',expiresAt:null,expectedVersion:1,reason:'Sandbox grant acceptance only.'};
      assert.equal((await call(body)).status,allowed?200:403);
      if(allowed) {
        assert.equal((await call({...body,actorId:other})).status,400);
        assert.equal((await call({...body,risk_hold:false})).status,400);
        assert.equal((await call({...body,stripe_subscription_id:'sub_other'})).status,400);
      }
    });
  }
  assert.equal(writes,1);
});
test('disabled webhook does not read the store or acknowledge events as processed',async()=>{
  await withServer(createManagementBillingWebhook({env:{},store:{},stripe:{configured:()=>false}}),async origin=>{
    assert.equal((await fetch(origin,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
  });
});

test('delayed first failure uses provider attempt time and expires at exactly seven days',()=>{
  const failedAt=now-2*86400000;
  const failure={...invoice,status:'open',amount_remaining:1000,attempted:true,created:failedAt/1000-3600,period_end:now/1000+28*86400};
  const pastDue={...subscription,status:'past_due'};
  const project=extra=>subscriptionProjection({subscription:pastDue,invoice:failure,
    account:{...account,initial_payment_verified:true},now,...extra});
  const state=project({firstFailureAt:new Date(failedAt).toISOString()});
  assert.equal(state.grace_started_at,new Date(failedAt).toISOString());
  assert.equal(entitlement(state,failedAt+7*86400000-1).management,true);
  assert.equal(entitlement(state,failedAt+7*86400000).management,false);
  assert.equal(entitlement(state,failedAt+7*86400000).historicalAccess,true);
  for(const firstFailureAt of [null,'invalid',new Date(now+86400000).toISOString()]) {
    assert.equal(project({firstFailureAt}).grace_started_at,null,'Unconfirmed timestamps cannot start grace');
  }
  const retry=project({account:{...account,...state},firstFailureAt:new Date(now).toISOString()});
  assert.equal(retry.grace_started_at,state.grace_started_at);
  const correction=project({account:{...account,...state,grace_started_at:new Date(now).toISOString()},firstFailureAt:new Date(failedAt).toISOString()});
  assert.equal(correction.grace_started_at,state.grace_started_at,'Earlier provider evidence corrects a delayed stored timestamp');
  const recovered=subscriptionProjection({subscription,invoice,account:{...account,...state},now});
  assert.equal(recovered.grace_started_at,null);
  assert.equal(entitlement(recovered,now).management,true);
});

test('failure lookup exhausts pagination and binds the earliest attempt to its invoice and subscription',async()=>{
  const created=now/1000-3*86400;
  const failure={...invoice,created};
  const event=(id,at,change={})=>({id,type:'invoice.payment_failed',livemode:false,created:at,data:{object:failure},...change});
  const pages=[{data:[event('evt_retry',created+2*86400),event('evt_foreign',created+1,{data:{object:{...failure,customer:'cus_foreign'}}})],has_more:true},
    {data:[event('evt_first',created+3600),event('evt_otherSub',created+2,{data:{object:{...failure,parent:{subscription_details:{subscription:'sub_foreign'}}}}}),
      event('evt_live',created+3,{livemode:true}),event('evt_otherInvoice',created+4,{data:{object:{...failure,id:'in_other'}}}),
      event('evt_otherAccount',created+5,{account:'acct_foreign'})],has_more:false}];
  const calls=[];
  const stripe={request:async(method,path,params)=>{calls.push({method,path,params});return pages[calls.length-1];}};
  assert.equal(await firstRenewalFailure({stripe,invoice:failure,account,now}),new Date((created+3600)*1000).toISOString());
  assert.deepEqual(calls[0],{method:'GET',path:'/v1/events',params:{type:'invoice.payment_failed',created:{gte:created},limit:100}});
  assert.equal(calls[1].params.starting_after,'evt_foreign');
});

test('missing failure history cannot invent grace and incomplete pagination cannot select a retry',async()=>{
  const failure={...invoice,created:now/1000-86400};
  assert.equal(await firstRenewalFailure({stripe:{request:async()=>({data:[],has_more:false})},invoice:failure,account,now}),null);
  for(const page of [{data:[],has_more:true},{data:null,has_more:false},{data:[],has_more:'false'}]) {
    await assert.rejects(firstRenewalFailure({stripe:{request:async()=>page},invoice:failure,account,now}),{code:'BILLING_FAILURE_TIME_UNCONFIRMED'});
  }
  await assert.rejects(firstRenewalFailure({stripe:{request:async()=>({data:[{id:'evt_same'}],has_more:true})},invoice:failure,account,now}),{code:'BILLING_FAILURE_TIME_UNCONFIRMED'});
});

 test('expired provider event history cannot make a recent retry the first failure',async()=>{
  let calls=0;
  const failure={...invoice,created:now/1000-31*86400};
  assert.equal(await firstRenewalFailure({stripe:{request:async()=>{calls++;}},invoice:failure,account,now}),null);
  assert.equal(calls,0);
 });
