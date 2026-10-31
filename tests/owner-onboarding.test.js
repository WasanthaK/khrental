import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOwnerSetup,ownerSetupHandler} from '../src/api/platform/ownerOnboarding.js';
import {ownerSetupPath} from '../src/utils/enquiryReturnPath.js';
import {normalizePublicSignupDetails} from '../src/api/auth/publicSignupChallengeService.js';
import {createPublicSignupVerificationLink} from '../src/api/auth/publicSignupVerificationEmail.js';
import {consumeSeekerVerificationContext} from '../src/utils/seekerVerificationFragment.js';

const actorId='11111111-1111-4111-8111-111111111111',authId='22222222-2222-4222-8222-222222222222';
const input={name:'Example workspace',country:'LK',requestId:'33333333-3333-4333-8333-333333333333'};
test('owner setup accepts only a new workspace command, never authority or billing fields',()=>{
  assert.deepEqual(parseOwnerSetup({...input,name:' Example workspace '}),input);
  for(const bad of [null,[],{...input,name:''},{...input,country:'US'},{...input,requestId:'../other'},
    ...['tenantId','role','plan','stripeCustomerId','appUserId'].map(k=>({...input,[k]:'admin'}))]){
    assert.throws(()=>parseOwnerSetup(bad),{code:'OWNER_SETUP_INVALID'});
  }
});
test('owner handler requires the server-verified same identity before any workspace creation',async()=>{
  for(const change of [{authSession:null},{user:{id:authId}},{authSession:{record:{appUserId:actorId,authId,metadata:{}}}}]){
    let calls=0;
    const req={body:input,user:{id:actorId},authSession:{record:{appUserId:actorId,authId,metadata:{global_email_verified:true}}},...change};
    const res={set(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
    await ownerSetupHandler({enabled:()=>true,createWorkspace:async()=>{calls++;}})(req,res,e=>{throw e;});
    assert.equal(res.code,403);assert.equal(calls,0);
  }
});
test('owner handler passes only persisted actor and validated input; no active workspace selection',async()=>{
  let received;
  const req={body:input,tenantId:'unrelated-workspace',user:{id:actorId},authSession:{record:{appUserId:actorId,authId,metadata:{global_email_verified:true}}}};
  const res={set(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
  await ownerSetupHandler({enabled:()=>true,createWorkspace:async v=>{received=v;return {id:'server-created',testing:true};}})(req,res,e=>{throw e;});
  assert.deepEqual(received,{actorId,authId,input});assert.equal(res.code,201);
  assert.equal(res.body.data.testing,true);
});
test('owner intent survives a new-browser verification link but never grants organization authority',()=>{
  for(const country of ['LK','BN']){
    const details=normalizePublicSignupDetails({name:'Example owner',email:'owner@example.test',ownerCountry:country});
    assert.equal(details.ownerCountry,country);
    const url=new URL(createPublicSignupVerificationLink({token:'a'.repeat(43),baseUrl:'https://app.quixo.homes',production:true,ownerCountry:country}));
    let scrubbed;
    const context=consumeSeekerVerificationContext({location:{pathname:url.pathname,hash:url.hash,search:''},history:{replaceState(_s,_t,path){scrubbed=path;}}});
    assert.equal(scrubbed,'/verify-email');
    assert.equal(context.token,'a'.repeat(43));
    assert.equal(ownerSetupPath(context.enquirySearch),'/owner-start?country='+country);
  }
  for(const ownerCountry of ['US','//evil.test',{},'LK&role=admin']){
    assert.equal(normalizePublicSignupDetails({name:'Example',email:'owner@example.test',ownerCountry}),null);
    assert.throws(()=>createPublicSignupVerificationLink({token:'a'.repeat(43),baseUrl:'https://app.quixo.homes',ownerCountry}));
    assert.equal(ownerSetupPath('?ownerCountry='+encodeURIComponent(ownerCountry)),null);
  }
  assert.equal(ownerSetupPath('?ownerCountry=LK&listingId=anything'),null);
  assert.equal(normalizePublicSignupDetails({name:'Example',email:'owner@example.test',ownerCountry:'LK',enquiry:{}}),null);
});
