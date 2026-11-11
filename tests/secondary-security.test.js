import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {createCredentialThrottle} from '../src/api/auth/credentialThrottle.js';
import {createSecurityHeaders} from '../src/api/securityHeaders.js';
import {discoverTestFiles} from '../scripts/run-tests.mjs';

const env={NODE_ENV:'production',AUTH_THROTTLE_SECRET:'synthetic-test-key-'.repeat(3)};
const run=async(app,work)=>{
  const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await work('http://127.0.0.1:'+server.address().port);}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
};
const fixture=(options={})=>{
  const app=express(),calls=[],buckets=new Map();let handled=0;
  const limiter={durable:true,consume:async input=>{calls.push(input);const used=buckets.get(input.key)||0;buckets.set(input.key,used+1);return used<input.max;}};
  const throttle=createCredentialThrottle({env,limiter,...options});
  app.use(express.json({limit:'8kb'}));
  for(const kind of ['signin','signup']){app.post('/'+kind,throttle(kind),(_req,res)=>{handled++;res.json({ok:true});});}
  app.use((e,_req,res,_next)=>res.status(e.status||500).json({code:e.code}));
  return {app,calls,count:()=>handled};
};
const post=(origin,kind,email,headers={})=>fetch(origin+'/'+kind,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({email,password:'synthetic'})});

test('production credential endpoints throttle normalized email and socket IP before credential work',async()=>{
  const f=fixture();await run(f.app,async origin=>{
    for(let i=0;i<10;i++){assert.equal((await post(origin,'signin',i%2?' USER@example.test ':'user@example.test',{'x-forwarded-for':'203.0.113.'+i})).status,200);}
    const denied=await post(origin,'signin','USER@example.test');assert.equal(denied.status,429);assert.equal(denied.headers.get('retry-after'),'900');assert.equal(f.count(),10);
    assert.equal(new Set(f.calls.filter(x=>x.scope==='credential-signin-ip').map(x=>x.key)).size,1,'Spoofed XFF must not change the socket quota');
    assert.equal(new Set(f.calls.filter(x=>x.scope==='credential-signin-email').map(x=>x.key)).size,1);
    assert.ok(f.calls.every(x=>/^[a-f0-9]{64}$/.test(x.key)&&x.windowSeconds===900));
    for(let i=0;i<4;i++){assert.equal((await post(origin,'signup','new@example.test')).status,200);}
    assert.equal((await post(origin,'signup','new@example.test')).status,429);assert.equal(f.count(),14);
  });
});

test('rotating emails cannot bypass production credential IP quota',async()=>{
  const f=fixture();await run(f.app,async origin=>{
    for(let i=0;i<20;i++){assert.equal((await post(origin,'signup',`user${i}@example.test`)).status,200);}
    assert.equal((await post(origin,'signup','other@example.test')).status,429);assert.equal(f.count(),20);
  });
});

test('production credential protection fails closed for missing secret, non-durable store, SQL failure and unknown proxy',async()=>{
  for(const options of [
    {env:{NODE_ENV:'production'}},
    {limiter:{consume:async()=>true}},
    {limiter:{durable:true,consume:async()=>{throw Error('private database');}}},
    {env:{...env,PUBLIC_SIGNUP_INGRESS_MODE:'unknown'}}
  ]){
    const f=fixture(options);await run(f.app,async origin=>{const response=await post(origin,'signin','test@example.test');assert.equal(response.status,503);assert.equal(f.count(),0);assert.doesNotMatch(await response.text(),/private/);});
  }
});

test('production security headers block inline code and preserve provider popup and PDF embedding policies',async()=>{
  const app=express();app.use(createSecurityHeaders({production:true}));app.get('/',(_req,res)=>res.send('test'));
  await run(app,async origin=>{
    const r=await fetch(origin);assert.equal(r.headers.get('x-powered-by'),null);assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('cross-origin-opener-policy'),'same-origin-allow-popups');
    assert.equal(r.headers.get('cross-origin-resource-policy'),'cross-origin');assert.match(r.headers.get('strict-transport-security'),/max-age=31536000/);
    const csp=r.headers.get('content-security-policy');assert.match(csp,/script-src 'self';/);assert.match(csp,/object-src 'self' blob:/);assert.match(csp,/frame-src 'self' blob: https:/);assert.match(csp,/script-src-attr 'none'/);
  });
});

test('automatic test discovery includes previously omitted invoice readiness and nested test files',()=>{
  const files=discoverTestFiles();assert.ok(files.includes('tests/invoice-data-readiness.test.js'));assert.ok(files.includes('tests/secondary-security.test.js'));assert.ok(files.length>150);assert.ok(files.every(p=>p.startsWith('tests/')&&/\.test\.(js|mjs|cjs)$/.test(p)));
});

test('server preflight and isolated-router credential guards debit each request once',async()=>{
  const f=fixture();const app=express();app.use(express.json());
  const limiter={durable:true,consume:async input=>{f.calls.push(input);return true;}};
  app.post('/signin',createCredentialThrottle({env,limiter})('signin'),createCredentialThrottle({env,limiter})('signin'),(_req,res)=>res.json({ok:true}));
  await run(app,async origin=>{assert.equal((await post(origin,'signin','user@example.test')).status,200);assert.equal(f.calls.length,2,'One IP debit and one email debit, even across guard instances');});
});
