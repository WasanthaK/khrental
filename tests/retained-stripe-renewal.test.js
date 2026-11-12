import test from 'node:test';
import assert from 'node:assert/strict';
import {targetFromEnv,assertRetainedTerms} from '../scripts/verify-retained-stripe-renewal.mjs';
import {BILLING_PRICE} from '../src/api/managementBilling/contract.js';
const fixture=()=>{
  const target={customer:'cus_demo',subscription:'sub_demo',clock:'clock_demo',schedule:'sub_sched_demo'};
  const subscription={id:target.subscription,customer:target.customer,test_clock:target.clock,schedule:target.schedule,livemode:false,status:'active',
    items:{data:[{id:'si_demo',price:BILLING_PRICE,quantity:2,current_period_end:200}]}};
  const schedule={id:target.schedule,customer:target.customer,subscription:target.subscription,livemode:false,status:'active',end_behavior:'release',
    phases:[{start_date:100,end_date:200,proration_behavior:'none',items:[{price:BILLING_PRICE,quantity:2}]},
      {start_date:200,end_date:300,proration_behavior:'none',items:[{price:BILLING_PRICE,quantity:1}]}]};
  return {target,subscription,schedule,clock:{id:target.clock,livemode:false,status:'ready',frozen_time:150}};
};
test('retained acceptance requires explicit safe provider identifiers',()=>{
  assert.throws(()=>targetFromEnv({}));
  assert.throws(()=>targetFromEnv({RETAINED_CUSTOMER:'cus_demo;echo'}));
});
test('retained acceptance derives exact approved renewal boundary',()=>{
  const f=fixture();assert.deepEqual(assertRetainedTerms(f.target,f.subscription,f.schedule,f.clock),{renewalAt:200,paidThrough:300,itemId:'si_demo'});
});
test('retained acceptance refuses changed ownership, price, schedule, mode or an already advanced clock',()=>{
  for(const change of [f=>{f.subscription.customer='cus_other';},f=>{f.subscription.livemode=true;},f=>{f.subscription.items.data[0].price='price_other';},
    f=>{f.schedule.phases[1].items[0].quantity=3;},f=>{f.schedule.phases[1].proration_behavior='always_invoice';},
    f=>{f.clock.frozen_time=200;},f=>{f.subscription.trial_end=200;},f=>{f.subscription.cancel_at_period_end=true;}]){
    const f=fixture();change(f);assert.throws(()=>assertRetainedTerms(f.target,f.subscription,f.schedule,f.clock));
  }
});
