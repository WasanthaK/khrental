import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePublicSignupRelease,createPublicSignupRuntime} from '../src/api/auth/publicSignupRuntime.js';
import express from 'express';
import {createPublicListingsRouter} from '../src/api/publicListings/router.js';
const base={NODE_ENV:'production',PUBLIC_SIGNUP_ENABLED:'true',PUBLIC_SIGNUP_PILOT_APPROVED:'true'};
test('the existing production canary still requires an exact normalized mailbox',()=>{
  assert.equal(resolvePublicSignupRelease(base).enabled,false);
  const pilot=resolvePublicSignupRelease({...base,PUBLIC_SIGNUP_PILOT_EMAIL:'seeker@example.test'});
  assert.deepEqual(pilot,{enabled:true,pilotEmail:'seeker@example.test',mode:'pilot'});
  assert.equal(resolvePublicSignupRelease({...base,PUBLIC_SIGNUP_PILOT_EMAIL:' Seeker@example.test '}).enabled,false);
});
test('general registration requires explicit public mode, public approval and both legacy gates',()=>{
  const full={...base,PUBLIC_SIGNUP_RELEASE_MODE:'public',PUBLIC_SIGNUP_PUBLIC_APPROVED:'true'};
  assert.deepEqual(resolvePublicSignupRelease(full),{enabled:true,pilotEmail:null,mode:'public'});
  for(const key of ['PUBLIC_SIGNUP_ENABLED','PUBLIC_SIGNUP_PILOT_APPROVED','PUBLIC_SIGNUP_PUBLIC_APPROVED']){
    assert.equal(resolvePublicSignupRelease({...full,[key]:'false'}).enabled,false);
  }
  assert.equal(resolvePublicSignupRelease({...full,PUBLIC_SIGNUP_RELEASE_MODE:'unknown'}).enabled,false);
  assert.equal(resolvePublicSignupRelease({...full,PUBLIC_SIGNUP_PUBLIC_APPROVED:'TRUE'}).enabled,false);
  assert.equal(resolvePublicSignupRelease({...base,PUBLIC_SIGNUP_PUBLIC_APPROVED:'true'}).enabled,false);
});
test('public release flags cannot bypass origin or missing provider/ingress readiness',async t=>{
  const app=express();app.use('/api/public-signup',createPublicSignupRuntime({config:{...base,
    PUBLIC_SIGNUP_RELEASE_MODE:'public',PUBLIC_SIGNUP_PUBLIC_APPROVED:'true'}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/public-signup/challenge',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'example@example.test',name:'A seeker'})});
  assert.equal(response.status,403);assert.equal((await response.json()).code,'SIGNUP_ORIGIN_DENIED');
});
test('public enquiry entry reflects approved public mode, all UI/API gates and current listing scope',async t=>{
  const id='11111111-1111-4111-8111-111111111111';
  const enabled={...base,PUBLIC_SIGNUP_RELEASE_MODE:'public',PUBLIC_SIGNUP_PUBLIC_APPROVED:'true',
    PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true',
    PROPERTY_ENQUIRIES_ENABLED:'true',PUBLIC_SEEKER_CONTEXT_ENABLED:'true',VITE_PROPERTY_ENQUIRIES_UI_ENABLED:'true',
    VITE_PUBLIC_SIGNUP_UI_ENABLED:'true',VITE_PUBLIC_SEEKER_LANDING_ENABLED:'true'};
  const configs=[enabled,{...enabled,PROPERTY_ENQUIRIES_ENABLED:'false'},
    {...enabled,VITE_PROPERTY_ENQUIRIES_UI_ENABLED:'false'},
    {...enabled,PUBLIC_SIGNUP_RELEASE_MODE:'pilot',PUBLIC_SIGNUP_PILOT_EMAIL:'seeker@example.test'}];
  for(let n=0;n<configs.length;n++){
    const app=express();app.use(createPublicListingsRouter({env:configs[n],rateLimit:async()=>true,
      find:async listing=>listing===id?{public_id:id,country_code:'LK',propertytype:'house'}:null}));
    const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    t.after(()=>new Promise(r=>server.close(r)));
    const origin='http://127.0.0.1:'+server.address().port;
    const r=await fetch(origin+'/'+id+'/enquiry-status?country=LK');assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{data:{enquiriesOpen:n===0}});
    assert.match(r.headers.get('cache-control'),/no-store/);
    assert.equal((await fetch(origin+'/'+id+'/enquiry-status?country=BN')).status,404);
    assert.equal((await fetch(origin+'/22222222-2222-4222-8222-222222222222/enquiry-status?country=LK')).status,404);
  }
});
