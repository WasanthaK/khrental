import test from 'node:test';
import assert from 'node:assert/strict';
import {restorationPolicy} from '../src/api/managementBilling/contract.js';
const now=Date.UTC(2026,10,12),paid={subscription_status:'active',quantity:2,initial_payment_verified:true,paid_through:new Date(now+86400000).toISOString()};
for(const [label,account,target,expected] of [
  ['paid retained capacity',paid,2,'active'],['paid additional capacity',paid,3,'active'],
  ['ending retains paid capacity',{...paid,cancel_at_period_end:true},2,'ending'],
  ['ending requires capacity',{...paid,cancel_at_period_end:true},3,'BILLING_RESTORE_CAPACITY_REQUIRED'],
  ['complimentary with no subscription',{comp_type:'ongoing',quantity:0},4,'complimentary'],
  ['complimentary over cancelled subscription',{...paid,subscription_status:'canceled',comp_type:'ongoing'},4,'complimentary'],
  ['complimentary same expiry',{comp_type:'fixed',comp_expires_at:new Date(now+1).toISOString()},4,'complimentary'],
  ['complimentary expired',{comp_type:'fixed',comp_expires_at:new Date(now).toISOString()},1,'BILLING_RESTORE_PAYMENT_REQUIRED'],
  ['grace retained capacity',{...paid,subscription_status:'past_due',grace_started_at:new Date(now-86400000).toISOString()},2,'grace'],
  ['grace missing capacity',{...paid,subscription_status:'past_due',grace_started_at:new Date(now-86400000).toISOString()},3,'BILLING_RESTORE_CAPACITY_REQUIRED'],
  ['grace expired',{...paid,subscription_status:'past_due',grace_started_at:new Date(now-7*86400000).toISOString()},1,'BILLING_RESTORE_PAYMENT_REQUIRED'],
  ['trial',{...paid,subscription_status:'trialing'},1,'BILLING_RESTORE_PAYMENT_REQUIRED'],
  ['incomplete',{...paid,subscription_status:'incomplete',initial_payment_verified:false},1,'BILLING_RESTORE_PAYMENT_REQUIRED'],
  ['unpaid',{...paid,subscription_status:'unpaid'},1,'BILLING_RESTORE_PAYMENT_REQUIRED'],
  ['cancelled with stock',{...paid,subscription_status:'canceled'},1,'BILLING_REACTIVATION_REQUIRED'],
  ['cancelled zero stock',{...paid,subscription_status:'canceled',quantity:0},1,'BILLING_REACTIVATION_REQUIRED'],
  ['risk hold',{...paid,risk_hold:true},1,'BILLING_RESTORE_REVIEW']
]){
  test(`restoration matrix: ${label}`,()=>{
    const before=structuredClone(account);
    if(expected.startsWith('BILLING_')){assert.throws(()=>restorationPolicy(account,target,now),{code:expected});}
    else{assert.equal(restorationPolicy(account,target,now),expected);}
    assert.deepEqual(account,before,'Policy never renews grants, changes capacity or reactivates a subscription');
  });
}
