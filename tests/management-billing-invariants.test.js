import test from 'node:test';
import assert from 'node:assert/strict';
import {BILLING_ACCOUNT} from '../src/api/managementBilling/contract.js';
import {billingInvariants,createBillingInvariantInspector,readOnlyStripe} from '../src/api/managementBilling/invariants.js';

const now=Date.parse('2026-11-12T00:00:00Z');
const fixture=()=>({now,inventory:[{},{}],account:{stripe_account_id:BILLING_ACCOUNT,stripe_customer_id:'cus_a',stripe_subscription_id:'sub_a',
  stripe_item_id:'si_a',stripe_price_id:'price_a',stripe_schedule_id:null,quantity:2,pending_quantity:null,subscription_status:'active',
  initial_payment_verified:true,paid_through:new Date(now+86400000).toISOString(),cancel_at_period_end:false},
subscription:{id:'sub_a',customer:'cus_a',livemode:false,status:'active',schedule:null,cancel_at_period_end:false,
  items:{data:[{id:'si_a',price:'price_a',quantity:2,current_period_end:999}]}}});
const schedule=(f,target)=>{
  f.account.stripe_schedule_id='sched_a';f.account.pending_quantity=target;f.subscription.schedule='sched_a';
  f.inventory=Array.from({length:target},()=>({}));
  f.schedule={id:'sched_a',customer:'cus_a',subscription:'sub_a',livemode:false,status:'active',end_behavior:'release',current_phase:{start_date:111},
    phases:[{start_date:111,end_date:999,items:[{price:'price_a',quantity:2}]},
      {start_date:999,proration_behavior:'none',items:[{price:'price_a',quantity:target}]}]};
};
test('current quantity and verified renewal inventory are independently consistent for reductions and deferred splits',()=>{
  for(const target of [1,3]){
    const f=fixture();schedule(f,target);const result=billingInvariants(f);
    assert.equal(result.status,'consistent');assert.equal(result.currentPaidQuantity,2);assert.equal(result.nextRenewalQuantity,target);
  }
});
test('zero stock with period-end cancellation preserves current paid quantity without a quantity-zero item',()=>{
  const f=fixture();f.inventory=[];f.account.cancel_at_period_end=true;f.account.pending_quantity=0;f.subscription.cancel_at_period_end=true;
  assert.equal(billingInvariants(f).status,'consistent');assert.equal(billingInvariants(f).nextRenewalQuantity,0);
  f.subscription.items.data[0].quantity=0;assert.ok(billingInvariants(f).issues.includes('CURRENT_PAID_QUANTITY'));
});
test('complimentary overlay does not demand cancellation of an existing paid subscription or additional charge',()=>{
  const f=fixture();f.account.comp_type='ongoing';f.inventory.push({});assert.equal(billingInvariants(f).status,'consistent');
  f.account.comp_type='fixed';f.account.comp_expires_at=new Date(now+1).toISOString();assert.equal(billingInvariants(f).status,'consistent');
  f.now++;assert.ok(billingInvariants(f).issues.includes('RENEWAL_INVENTORY_QUANTITY'));
});
test('terminal subscription can retain inventory only with explicit reactivation-required observation',()=>{
  const f=fixture();f.account.subscription_status='canceled';f.subscription.status='canceled';
  const result=billingInvariants(f);assert.equal(result.reactivationRequired,true);assert.equal(result.nextRenewalQuantity,0);
});
test('missing/wrong schedules, foreign bindings and quantity drift are never explained away by a pending command',()=>{
  const f=fixture();schedule(f,1);f.schedule.phases[1].items[0].quantity=2;
  f.commands=[{id:'pending'}];assert.equal(billingInvariants(f).status,'needs_review');
  assert.ok(billingInvariants(f).issues.includes('RENEWAL_SCHEDULE'));
  f.schedule.customer='cus_other';assert.ok(billingInvariants(f).issues.includes('RENEWAL_SCHEDULE'));
  f.account.stripe_schedule_id=null;f.subscription.schedule=null;assert.ok(billingInvariants(f).issues.includes('MISSING_RENEWAL_SCHEDULE'));
  f.subscription.customer='cus_other';assert.ok(billingInvariants(f).issues.includes('SUBSCRIPTION_BINDING'));
});
test('a consistent snapshot with unfinished operations remains pending, not accepted',()=>{
  const f=fixture();f.commands=[{id:'pending'}];assert.equal(billingInvariants(f).status,'operation_pending');
});
test('inspector is read-only and refuses a conclusion if local state changes during provider reads',async()=>{
  const f=fixture();let snapshots=0;const methods=[];
  const store={locked:async(_id,action)=>{snapshots++;return action(async sql=>{assert.match(sql,/^SELECT/);return [];});},
    account:async()=>({...f.account,version:snapshots}),inventory:async()=>f.inventory};
  const stripe=readOnlyStripe({assertAccount:async()=>{},request:async method=>{methods.push(method);return f.subscription;}});
  assert.throws(()=>stripe.request('POST','/v1/subscriptions'),{code:'BILLING_INSPECTION_WRITE_DENIED'});
  const result=await createBillingInvariantInspector({store,stripe,clock:{now:()=>now}}).inspect('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(result.status,'inconclusive');assert.deepEqual(methods,['GET']);assert.equal(snapshots,2);
});
