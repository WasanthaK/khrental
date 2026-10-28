import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createEnquiriesRouter} from '../src/api/enquiries/router.js';
import {parseEnquiry,parseOwnerAction,seekerReceipt} from '../src/api/enquiries/contract.js';
import {enquiryReturnPath} from '../src/utils/enquiryReturnPath.js';
import {requestSeekerEnquiries} from '../src/services/seekerContextClient.js';

const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const input={listingId:id(1),country:'LK',requestId:id(2),message:'May I arrange a viewing?',consent:true};
const env={PROPERTY_ENQUIRIES_ENABLED:'true',PUBLIC_LISTING_READ_ENABLED:'true',PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'};
const actor={record:{appUserId:id(3),authId:id(4)},sessionId:id(5)};
const launch=async(t,{owner=false,environment=env,session=actor,proof={verified:true,eligible:true},admin=true}={})=>{
  const calls=[];
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{req.authSession=session;next();});
  app.use(createEnquiriesRouter({owner,env:environment,
    context:(req,res,next)=>{
      req.user={id:id(3),status:'active'};req.tenantContext={};
      if(owner){req.tenantId=id(7);req.membership={tenant_id:id(7),status:'active',role:admin?'admin':'staff'};}
      next();
    },verifySeeker:async()=>proof,
    store:{list:async(...args)=>{calls.push(['list',...args]);return {items:[],hasMore:false};},
      submit:async(...args)=>{calls.push(['submit',...args]);return {created:true,receipt:{id:id(8)}};},
      change:async(...args)=>{calls.push(['change',...args]);return {id:id(8)};}}
  }));
  app.use((err,req,res,next)=>res.status(err.status||500).json({code:err.code}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {calls,request:(path='',method='GET',body,origin='https://app.quixo.homes')=>fetch('http://127.0.0.1:'+server.address().port+path,
    {method,headers:{Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})};
};
test('strict enquiry contract refuses spoofed scope, contact, missing consent and oversize content',()=>{
  const parsed=parseEnquiry(input);assert.equal(parsed.message,input.message);
  assert.equal(parsed.payloadHash,parseEnquiry({...input,requestId:id(9)}).payloadHash);
  for(const mutation of [{tenantId:id(7)},{email:'fake@example.test'},{consent:false},{country:'US'},
    {message:'x'.repeat(2001)},{listingId:'x'},{requestId:null},{message:'  '}]){
    assert.throws(()=>parseEnquiry({...input,...mutation}),{code:'INVALID_ENQUIRY'});
  }
});
test('return path accepts only a listing and known market; drops arbitrary destinations',()=>{
  assert.equal(enquiryReturnPath('?listingId='+id(1)+'&country=LK&returnTo=https://evil.test&tenantId='+id(8)),
    '/enquire?listingId='+id(1)+'&country=LK');
  for(const s of ['?next=//evil.test','?listingId=javascript:alert(1)&country=LK','?listingId='+id(1)+'&country=US']){
    assert.equal(enquiryReturnPath(s),null);
  }
});
test('seeker receipt omits tenant, source property, email, actor and payload hashes',()=>{
  const receipt=seekerReceipt({id:id(1),tenant_id:id(2),property_id:id(3),seeker_email:'private',payload_hash:'private'});
  assert.ok(!JSON.stringify(receipt).includes('private'));assert.ok(!Object.hasOwn(receipt,'propertyId'));
  assert.throws(()=>parseOwnerAction({status:'responded',version:1,response:''}));
  assert.throws(()=>parseOwnerAction({status:'pending',version:1,response:'Hi'}));
});
test('personal API omits tenant/cookie context and invalidates a mid-request account change',async()=>{
  const originalFetch=globalThis.fetch;
  const captured=[];
  globalThis.fetch=async(url,options)=>{
    captured.push({url,options});return {ok:true,json:async()=>({data:{items:[]}})};
  };
  try{
    const session={access_token:'synthetic-only',user:{id:'synthetic-seeker'}};
    let reads=0;
    await assert.rejects(requestSeekerEnquiries({getSession:async()=>({data:{session:++reads===1?session:null}})}),/session changed/);
    assert.equal(captured[0].url,'/api/property-enquiries');
    assert.deepEqual(captured[0].options.headers,{Authorization:'Bearer synthetic-only'});
    assert.equal(captured[0].options.credentials,'omit');
    assert.equal(captured[0].options.redirect,'error');
    await assert.rejects(requestSeekerEnquiries({getSession:async()=>({data:{session:null}})}),{status:401});
    assert.equal(captured.length,1);
  } finally {globalThis.fetch=originalFetch;}
});
test('default off, public shutdown and anonymous sessions perform no store operations',async t=>{
  for(const opts of [{environment:{}},{environment:{...env,PUBLIC_LISTING_READ_ENABLED:'false'}},{session:null}]){
    const x=await launch(t,opts);const r=await x.request('', 'POST',input);
    assert.ok([401,404].includes(r.status));assert.equal(x.calls.length,0);
  }
});
test('verified seeker submit derives actor only from server session',async t=>{
  const x=await launch(t);assert.equal((await x.request('','POST',input)).status,201);
  assert.equal(x.calls[0][1].actorId,actor.record.appUserId);
  assert.equal(Object.hasOwn(x.calls[0][1],'tenantId'),false);
  assert.equal((await x.request('','POST',{...input,tenantId:id(7)})).status,400);
});
test('unverified user, foreign origins and out-of-pilot listings fail closed',async t=>{
  const denied=await launch(t,{proof:{verified:true,eligible:false}});
  assert.equal((await denied.request()).status,403);assert.equal(denied.calls.length,0);
  const x=await launch(t,{environment:{...env,PUBLIC_LISTING_PILOT_PUBLIC_ID:id(9)}});
  assert.equal((await x.request('','POST',input,'https://evil.test')).status,403);
  assert.equal((await x.request('','POST',input)).status,409);assert.equal(x.calls.length,0);
});
test('owner inbox requires active admin and server tenant; seeker cannot update owner status',async t=>{
  const staff=await launch(t,{owner:true,admin:false});
  assert.equal((await staff.request()).status,403);assert.equal(staff.calls.length,0);
  const owner=await launch(t,{owner:true});assert.equal((await owner.request()).status,200);
  assert.equal(owner.calls[0][1].tenantId,id(7));assert.equal(owner.calls[0][2],true);
  assert.equal((await owner.request('/'+id(8),'PATCH',{status:'responded',version:1,response:'Please suggest a time.'})).status,200);
  const seeker=await launch(t);assert.equal((await seeker.request('/'+id(8),'PATCH',{status:'closed',version:1})).status,400);
  assert.equal((await seeker.request('/'+id(8),'PATCH',{status:'withdrawn',version:1})).status,200);
  assert.equal((await seeker.request('?offset=-1')).status,400);
});
