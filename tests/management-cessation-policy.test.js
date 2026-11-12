import test from 'node:test';
import assert from 'node:assert/strict';
import {localCessationAllowed,entitlement} from '../src/api/managementBilling/contract.js';
const now=Date.parse('2026-11-12T00:00:00Z');
const paid={subscription_status:'active',initial_payment_verified:true,paid_through:'2026-12-12T00:00:00Z'};
// Executable subset of handoff 3.1: cells needing provider changes remain on
// their existing paid route or explicitly pending, never treated as no-write.
const matrix=[
 ['active paid',paid,false],['ending',{...paid,cancel_at_period_end:true},false],
 ['trial cleanup pending',{subscription_status:'trialing'},false],
 ['complimentary',{...paid,comp_type:'ongoing'},true],
 ['fixed complimentary',{comp_type:'fixed',comp_expires_at:'2026-11-13T00:00:00Z'},true],
 ['grace provider reduction pending',{...paid,subscription_status:'past_due',grace_started_at:'2026-11-11T00:00:00Z'},false],
 ['incomplete',{subscription_status:'incomplete'},true],['incomplete expired',{subscription_status:'incomplete_expired'},true],
 ['unpaid',{...paid,subscription_status:'unpaid'},true],
 ['grace expired',{...paid,subscription_status:'past_due',grace_started_at:'2026-11-05T00:00:00Z'},true],
 ['cancelled retained stock',{...paid,subscription_status:'canceled',quantity:2},true],
 ['cancelled zero stock',{subscription_status:'canceled',quantity:0},true],
 ['review hold',{...paid,comp_type:'ongoing',risk_hold:true},false],['unenrolled',null,false],
 ['unverified active',{subscription_status:'active'},false]
];
for(const [name,account,allowed] of matrix){test(`cessation no-write policy: ${name}`,()=>assert.equal(localCessationAllowed(account,now),allowed));}
test('complimentary boundary never extends access or changes the underlying paid policy',()=>{
 const account={...paid,comp_type:'fixed',comp_expires_at:new Date(now).toISOString()};
 assert.equal(localCessationAllowed(account,now-1),true);
 assert.equal(localCessationAllowed(account,now),false);
 assert.equal(entitlement(account,now).state,'active');
});
