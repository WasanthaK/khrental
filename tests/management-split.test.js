import test from 'node:test';
import assert from 'node:assert/strict';
import {splitPolicy,splitUnits} from '../src/api/managementBilling/contract.js';
import {splitScheduleBody} from '../src/api/managementBilling/recoveryQuantity.js';
const now=Date.UTC(2026,10,12),paid={subscription_status:'active',quantity:1,initial_payment_verified:true,paid_through:new Date(now+86400000).toISOString()};
for(const [label,account,expected] of [
  ['active',paid,'active'],['ending',{...paid,cancel_at_period_end:true},'BILLING_SPLIT_RENEWAL_REQUIRED'],
  ['grace',{...paid,subscription_status:'past_due',grace_started_at:new Date(now-86400000).toISOString()},'grace'],
  ['expired grace',{...paid,subscription_status:'past_due',grace_started_at:new Date(now-7*86400000).toISOString()},'BILLING_SPLIT_PAYMENT_REQUIRED'],
  ['complimentary',{comp_type:'ongoing'},'complimentary'],['complimentary cancelled',{comp_type:'ongoing',subscription_status:'canceled'},'complimentary'],
  ...['trialing','incomplete','unpaid','canceled'].map(subscription_status=>[subscription_status,{...paid,subscription_status},'BILLING_SPLIT_PAYMENT_REQUIRED']),
  ['risk',{...paid,risk_hold:true},'BILLING_SPLIT_REVIEW']
]){test(`split policy: ${label}`,()=>{const original=structuredClone(account);if(expected.startsWith('BILLING_')){assert.throws(()=>splitPolicy(account,now),{code:expected});}else{assert.equal(splitPolicy(account,now),expected);}assert.deepEqual(account,original);});}
test('split schedules increased quantity only at renewal without prorating',()=>{
  const body=splitScheduleBody({phaseStart:1,periodEnd:100,priceId:'price',from:1,to:4});
  assert.equal(body.proration_behavior,'none');assert.deepEqual(body.phases.map(p=>p.items[0].quantity),[1,4]);
  assert.ok(body.phases.every(p=>p.proration_behavior==='none'));assert.equal(body.phases[1].start_date,100);
});
test('split validates independent unit identities and exact parent',()=>{
  const propertyId='11111111-1111-4111-8111-111111111111',units=[2,3].map(n=>({id:`${n}`.repeat(8)+'-'+`${n}`.repeat(4)+'-4'+`${n}`.repeat(3)+'-8'+`${n}`.repeat(3)+'-'+`${n}`.repeat(12),propertyid:propertyId,unitnumber:`Unit ${n}`}));
  assert.equal(splitUnits(propertyId,units).length,2);
  assert.throws(()=>splitUnits(propertyId,[units[0],units[0]]),{code:'BILLING_DUPLICATE_DWELLING'});
  assert.throws(()=>splitUnits(propertyId,[units[0],{...units[1],unitnumber:'Unit 2'}]),{code:'BILLING_SPLIT_DUPLICATE_LABEL'});
  assert.throws(()=>splitUnits(propertyId,[units[0],{...units[1],propertyid:units[1].id}]),{code:'BILLING_SPLIT_PARENT_MISMATCH'});
  assert.throws(()=>splitUnits(propertyId,[units[0]]),{code:'BILLING_SPLIT_UNITS_REQUIRED'});
});
