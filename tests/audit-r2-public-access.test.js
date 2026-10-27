import test from 'node:test';
import assert from 'node:assert/strict';
import {auditR2PublicAccess} from '../scripts/audit-r2-public-access.mjs';

const env={R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET:'example-private-bucket',
  CLOUDFLARE_R2_AUDIT_TOKEN:'synthetic-audit-token'};
const response=result=>({status:200,json:async()=>({success:true,result})});
const simulate=({managed=false,domains=[],extra}={})=>{
  const calls=[];
  return {calls,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/managed'))return response({enabled:managed,domain:'must-not-be-logged.r2.dev'});
    return {status:200,json:async()=>({success:true,result:{domains},...extra})};
  }};
};
test('private bucket requires both managed and custom public access disabled',async()=>{
  const mock=simulate({domains:[{enabled:false,domain:'must-not-be-logged.example'}]});
  const result=await auditR2PublicAccess({env,fetchImpl:mock.fetchImpl});
  assert.deepEqual(result,{status:'PASS',code:'DIRECT_PUBLIC_BUCKET_ACCESS_DISABLED',
    managedPublicAccess:false,enabledCustomDomains:0,configuredCustomDomains:1});
  assert.equal(mock.calls.length,2);
  for(const {url,options} of mock.calls){
    assert.equal(new URL(url).origin,'https://api.cloudflare.com');
    assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+env.R2_ACCOUNT_ID+'/r2/buckets/'+env.R2_BUCKET+'/domains/'));
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer '+env.CLOUDFLARE_R2_AUDIT_TOKEN);
    assert.ok(!Object.hasOwn(options,'body'));
  }
  const output=JSON.stringify(result);
  for(const secret of [env.R2_ACCOUNT_ID,env.R2_BUCKET,env.CLOUDFLARE_R2_AUDIT_TOKEN,
    'must-not-be-logged.r2.dev','must-not-be-logged.example'])assert.ok(!output.includes(secret));
});
test('managed and custom public access independently fail the audit',async()=>{
  for(const config of [{managed:true,domains:[]},{managed:false,domains:[{enabled:true}]}]){
    const result=await auditR2PublicAccess({env,fetchImpl:simulate(config).fetchImpl});
    assert.equal(result.status,'FAIL');
    assert.equal(result.code,'DIRECT_PUBLIC_BUCKET_ACCESS_ENABLED');
  }
});
test('object credentials cannot replace the management audit token',async()=>{
  let called=0;
  const result=await auditR2PublicAccess({
    env:{R2_ACCOUNT_ID:env.R2_ACCOUNT_ID,R2_BUCKET:env.R2_BUCKET,
      R2_ACCESS_KEY_ID:'object-key',R2_SECRET_ACCESS_KEY:'object-secret'},
    fetchImpl:async()=>{called++;throw Error('must not use object credentials');}
  });
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.code,'MISSING_CLOUDFLARE_R2_AUDIT_TOKEN');
  assert.equal(called,0);
});
test('unauthorized and provider errors are blocked and never emit response bodies',async()=>{
  for(const status of [401,403,404,429,500]){
    const result=await auditR2PublicAccess({
      env,fetchImpl:async()=>({status,json:async()=>{throw Error('PRIVATE_PROVIDER_RESPONSE');}})
    });
    assert.equal(result.status,'BLOCKED');
    assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER_RESPONSE'));
  }
  const result=await auditR2PublicAccess({env,fetchImpl:async()=>{throw Error(env.CLOUDFLARE_R2_AUDIT_TOKEN);}});
  assert.deepEqual(result,{status:'BLOCKED',code:'CLOUDFLARE_REQUEST_UNAVAILABLE'});
});
test('missing or ambiguous domain state never produces PASS',async()=>{
  for(const mock of [
    {fetchImpl:async()=>response({})},
    {fetchImpl:async()=>({status:200,json:async()=>({success:false,result:{enabled:false}})})},
    {fetchImpl:async()=>({status:200,json:async()=>{throw Error('invalid JSON');}})},
    simulate({domains:[{}]}),
    simulate({extra:{result_info:{total_count:2}}})
  ]){
    const result=await auditR2PublicAccess({env,fetchImpl:mock.fetchImpl});
    assert.equal(result.status,'BLOCKED');
  }
});
test('invalid identifiers cannot influence request paths or headers',async()=>{
  for(const changes of [
    {R2_ACCOUNT_ID:'../foreign'}, {R2_BUCKET:'private/../../other'},
    {CLOUDFLARE_R2_AUDIT_TOKEN:'header\ninjection'}, {R2_JURISDICTION:'unknown'}
  ]){
    let called=0;
    const result=await auditR2PublicAccess({env:{...env,...changes},fetchImpl:async()=>{called++;}});
    assert.equal(result.status,'BLOCKED');assert.equal(called,0);
  }
});
test('jurisdiction is explicit and preserved on both read-only requests',async()=>{
  const mock=simulate();
  assert.equal((await auditR2PublicAccess({env:{...env,R2_JURISDICTION:'eu'},fetchImpl:mock.fetchImpl})).status,'PASS');
  assert.ok(mock.calls.every(call=>call.options.headers['cf-r2-jurisdiction']==='eu'));
});
