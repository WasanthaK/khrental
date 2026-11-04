import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const probe=(unsignedStatus=400,signedStatus=200,ignored=true)=>spawnSync(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import crypto from 'node:crypto';
  process.env.STRIPE_SANDBOX_WEBHOOK_SECRET='whsec_synthetic_fixture';
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://app.quixo.homes/api/management-billing/webhook');
    assert.equal(options.redirect,'error');
    assert.equal(JSON.parse(options.body).type,'quixo.transport_probe');
    const signature=options.headers['Stripe-Signature'];
    if(!signature)return {status:${unsignedStatus}};
    const [timestamp,mac]=signature.split(',').map(x=>x.split('=')[1]);
    assert.equal(mac,crypto.createHmac('sha256',process.env.STRIPE_SANDBOX_WEBHOOK_SECRET).update(timestamp+'.'+options.body).digest('hex'));
    return {status:${signedStatus},json:async()=>({data:{received:true,ignored:${ignored}}})};
  };
  await import('./scripts/verify-management-billing-transport.mjs');
`],{encoding:'utf8'});

test('transport probe signs exact bytes and sends only an ignored synthetic event',()=>{
  const result=probe();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/TRANSPORT=PASS/);
});
test('transport probe rejects an endpoint that accepts unsigned requests',()=>assert.notEqual(probe(200).status,0));
test('transport probe rejects a disabled or mismatched-signature receiver',()=>assert.notEqual(probe(400,404).status,0));
test('transport probe requires explicit no-business-processing acknowledgement',()=>assert.notEqual(probe(400,200,false).status,0));
