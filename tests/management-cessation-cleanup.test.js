import test from 'node:test';
import assert from 'node:assert/strict';
import {cessationCleanupRecovery} from '../src/api/managementBilling/recoveryQuantity.js';
import {cessationCleanupMode,entitlement} from '../src/api/managementBilling/contract.js';
import {subscriptionProjection} from '../src/api/managementBilling/stripe.js';
import {createRecoveryRunner} from '../src/api/managementBilling/recovery.js';

const now=Date.UTC(2026,10,12);
const fixture=()=>{
  const job={id:'cleanup',tenant_id:'tenant',kind:'cessation',created_at:new Date(now).toISOString(),attempts:1,
    intent:{cleanupMode:'grace',_subscriptionId:'sub',customerId:'cus',priceId:'price',itemId:'item',periodEnd:now/1000+86400,
      trialStart:null,trialEnd:null,ending:false,scheduleId:null,preview:{from:2,to:1}}};
  const account={stripe_subscription_id:'sub',stripe_customer_id:'cus',stripe_price_id:'price'};
  const sub={id:'sub',customer:'cus',livemode:false,status:'past_due',schedule:null,cancel_at_period_end:false,
    items:{data:[{id:'item',price:'price',quantity:2,current_period_end:job.intent.periodEnd}]}};
  const state={events:[],writes:[],steps:{},age:0,denied:false,finished:false,review:false};
  const stripe={assertAccount:async()=>{},request:async(method,url,body,key)=>{
    if(method==='GET'){
      if(url==='/v1/events'){return {data:state.events,has_more:false};}
      assert.equal(url,'/v1/subscriptions/sub');return structuredClone(sub);
    }
    assert.equal(method,'POST');assert.equal(url,'/v1/subscriptions/sub');
    state.writes.push({body,key});
    if(body.items){sub.items.data[0].quantity=body.items[0].quantity;}
    if('cancel_at_period_end' in body){sub.cancel_at_period_end=body.cancel_at_period_end;}
    state.events.push({id:'evt',type:'customer.subscription.updated',livemode:false,created:now/1000,
      request:{idempotency_key:key},data:{object:structuredClone(sub)}});
    return structuredClone(sub);
  }};
  const journal={claim:async()=>({token:'claim',job}),
    prepareStep:async({name,input,key})=>state.steps[name]??=( {input,idempotency_key:key,created_at:new Date(now-state.age).toISOString()}),
    renew:async()=>{if(state.denied){throw Object.assign(new Error('Authority expired'),{status:409,code:'BILLING_CESSATION_STATE_CHANGED'});}},
    completeStep:async({name,result})=>{Object.assign(state.steps[name],{completed_at:new Date(now).toISOString(),result_json:JSON.stringify(result)});},
    finish:async({result})=>{state.finished=true;return result;},fail:async({review})=>{state.review=review;return {review};}};
  const run=()=>createRecoveryRunner({journal,clock:{now:()=>now},logger:{error:()=>{}},
    handlers:{cessation:cessationCleanupRecovery({store:{account:async()=>account},stripe,clock:{now:()=>now}})}}).run({tenantId:'tenant',id:'cleanup'});
  return {job,account,sub,state,run};
};

for(const [label,mutate,code] of [
  ['foreign local customer',f=>{f.account.stripe_customer_id='foreign';},'BILLING_RECONCILIATION_REQUIRED'],
  ['foreign provider customer',f=>{f.sub.customer='foreign';},'BILLING_SUBSCRIPTION_MISMATCH'],
  ['live object',f=>{f.sub.livemode=true;},'BILLING_SUBSCRIPTION_MISMATCH'],
  ['payment recovered',f=>{f.sub.status='active';},'BILLING_SUBSCRIPTION_MISMATCH'],
  ['grace ended',f=>{f.sub.status='unpaid';},'BILLING_SUBSCRIPTION_MISMATCH'],
  ['price changed',f=>{f.sub.items.data[0].price='other';},'BILLING_SUBSCRIPTION_MISMATCH'],
  ['period changed',f=>{f.sub.items.data[0].current_period_end++;},'BILLING_SUBSCRIPTION_MISMATCH'],
  ['extra item',f=>{f.sub.items.data.push({...f.sub.items.data[0]});},'BILLING_SUBSCRIPTION_MISMATCH'],
  ['unexpected schedule',f=>{f.sub.schedule='other';},'BILLING_SCHEDULE_MISMATCH'],
  ['unreviewed increase',f=>{f.job.intent.preview.to=3;},'BILLING_CESSATION_STATE_CHANGED'],
  ['negative target',f=>{f.job.intent.preview.to=-1;},'BILLING_CESSATION_STATE_CHANGED'],
  ['quantity changed',f=>{f.sub.items.data[0].quantity=3;},'BILLING_CESSATION_STATE_CHANGED'],
  ['unproven matching quantity',f=>{f.sub.items.data[0].quantity=1;},'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE'],
  ['authority expired before write',f=>{f.state.denied=true;},'BILLING_CESSATION_STATE_CHANGED'],
  ['aged missing evidence',f=>{f.state.age=23*3600000;},'BILLING_RECOVERY_EVIDENCE_REQUIRED'],
  ['trial date changed',f=>{f.job.intent.cleanupMode='trial';f.sub.status='trialing';f.sub.trial_end=now/1000+86400;},'BILLING_SUBSCRIPTION_MISMATCH']
]){
  test(`cleanup rejects ${label} without provider writes or completion`,async()=>{
    const f=fixture();mutate(f);await assert.rejects(f.run(),{code});
    assert.equal(f.state.writes.length,0);assert.equal(f.state.finished,false);
  });
}

test('cleanup preserves existing ending quantity and needs no provider mutation',async()=>{
  const f=fixture();f.job.intent.ending=true;f.sub.cancel_at_period_end=true;
  const result=await f.run();assert.equal(result.currentQuantity,2);assert.equal(result.nextRenewalQuantity,0);assert.equal(f.state.writes.length,0);
});
test('old cleanup with exact request evidence completes without a fresh write',async()=>{
  const f=fixture();await f.run();f.state.steps={};f.state.age=24*3600000;f.state.finished=false;
  await f.run();assert.equal(f.state.writes.length,1);assert.equal(f.state.finished,true);
});
test('another operation cannot supply cleanup request evidence',async()=>{
  const f=fixture();await f.run();f.state.steps={};f.state.finished=false;f.state.events[0].request.idempotency_key='different';
  await assert.rejects(f.run(),{code:'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE'});assert.equal(f.state.writes.length,1);assert.equal(f.state.finished,false);
});


test('cleanup grace ends at its original exact boundary and overlays/risk cannot authorize writes',()=>{
  const account={subscription_status:'past_due',initial_payment_verified:true,grace_started_at:new Date(now-7*86400000+1).toISOString()};
  assert.equal(cessationCleanupMode(account,now),'grace');assert.equal(cessationCleanupMode(account,now+1),null);
  assert.equal(cessationCleanupMode({...account,risk_hold:true},now),null);
  assert.equal(cessationCleanupMode({...account,comp_type:'ongoing'},now),null);
  assert.equal(cessationCleanupMode({...account,initial_payment_verified:false},now),null);
});
test('explicit legacy trial cleanup projects without payment/access while default projection still rejects trials',()=>{
  const f=fixture();f.sub.status='trialing';f.sub.trial_start=now/1000-86400;f.sub.trial_end=now/1000+86400;
  f.sub.items.data[0].price={id:'price',currency:'usd',recurring:{interval:'month',usage_type:'licensed'}};
  const input={subscription:f.sub,account:f.account,invoice:null,now};
  assert.throws(()=>subscriptionProjection(input),{code:'BILLING_SUBSCRIPTION_MISMATCH'});
  const projection=subscriptionProjection({...input,cessationCleanup:true});
  assert.equal(projection.initial_payment_verified,false);assert.equal(entitlement({...f.account,...projection},now).management,false);
  assert.throws(()=>subscriptionProjection({...input,invoice:{status:'paid'},cessationCleanup:true}),{code:'BILLING_SUBSCRIPTION_MISMATCH'});
  f.sub.status='active';assert.throws(()=>subscriptionProjection({...input,cessationCleanup:true}),{code:'BILLING_SUBSCRIPTION_MISMATCH'});
  f.sub.status='canceled';assert.equal(entitlement({...f.account,...subscriptionProjection({...input,cessationCleanup:true})},now).management,false);
});
