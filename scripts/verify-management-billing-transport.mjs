import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Synthetic transport probe only: no customer, subscription, invoice or database writes.
// This establishes deployment/configuration, not Stripe-origin delivery acceptance.
const url='https://app.quixo.homes/api/management-billing/webhook';
const secret=process.env.STRIPE_SANDBOX_WEBHOOK_SECRET;
assert.ok(secret?.startsWith('whsec_'),'Webhook signing secret is required');
const body=JSON.stringify({id:'evt_QuixoTransportProbe',type:'quixo.transport_probe',livemode:false,data:{object:{}}});
const post=signature=>fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{'Content-Type':'application/json',...(signature?{'Stripe-Signature':signature}:{})},body});
assert.equal((await post()).status,400,'Unsigned webhook must be rejected');
const timestamp=Math.floor(Date.now()/1000);
const signature=crypto.createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
const response=await post(`t=${timestamp},v1=${signature}`);
assert.equal(response.status,200,'Signed transport probe must succeed');
const result=await response.json();
assert.equal(result.data?.received,true);
assert.equal(result.data?.ignored,true);
console.log('MANAGEMENT_BILLING_TRANSPORT=PASS synthetic_signed_probe unsigned_denied no_business_writes');
