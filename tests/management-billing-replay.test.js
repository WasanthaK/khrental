import test from 'node:test';
import assert from 'node:assert/strict';
import {billingReplay} from './fixtures/management-billing-replay.js';

const day=86400000;
test('synthetic renewal replay uses injected application time, pins grace, and survives duplicate and stale deliveries',async()=>{
  const f=billingReplay();f.publish({id:'evt_paid'});await f.deliver('evt_paid');
  assert.equal((await f.summary()).entitlement.state,'active');
  f.advance(30*day);f.publish({id:'evt_failed',type:'invoice.payment_failed',paid:false,invoiceId:'in_renewal'});
  const first=f.time();await f.deliver('evt_failed');assert.equal((await f.summary()).entitlement.state,'grace');
  assert.deepEqual(await f.deliver('evt_failed'),{received:true,duplicate:true});assert.equal(f.state().audit.length,2);
  f.advance(5*day);f.publish({id:'evt_retry',type:'invoice.payment_failed',paid:false,invoiceId:'in_renewal',created:first/1000,eventCreated:f.time()/1000});await f.deliver('evt_retry');
  assert.equal(new Date(f.state().account.grace_started_at).getTime(),first);
  f.advance(2*day-1);assert.equal((await f.summary()).entitlement.state,'grace');
  f.advance(1);assert.equal((await f.summary()).entitlement.state,'read_only');
  f.publish({id:'evt_late_failure',type:'invoice.payment_failed',paid:false,invoiceId:'in_renewal',created:first/1000,eventCreated:f.time()/1000});
  f.publish({id:'evt_recovered',invoiceId:'in_renewal'});await f.deliver('evt_recovered');
  assert.equal((await f.summary()).entitlement.state,'active');assert.equal(f.state().account.grace_started_at,null);
  await f.deliver('evt_retry');assert.equal((await f.summary()).entitlement.state,'active');assert.equal(f.state().audit.length,4);
  await f.deliver('evt_late_failure');assert.equal((await f.summary()).entitlement.state,'active');assert.equal(f.state().audit.length,5);
});
test('synthetic complimentary expiry follows injected time without a provider request',async()=>{
  const f=billingReplay();f.setComplimentary(new Date(f.time()+day).toISOString());
  assert.equal((await f.summary()).entitlement.state,'complimentary');f.advance(day);
  assert.equal((await f.summary()).entitlement.state,'payment_pending');assert.equal(f.requests.length,0);
});
test('foreign-subscription replay rolls back projection and event ledger together',async()=>{
  const f=billingReplay();f.publish({id:'evt_paid'});await f.deliver('evt_paid');const before=f.state();
  f.publish({id:'evt_foreign',subscriptionId:'sub_foreign'});
  await assert.rejects(f.deliver('evt_foreign'),{code:'BILLING_EVENT_SUBSCRIPTION_MISMATCH'});assert.deepEqual(f.state(),before);
});
