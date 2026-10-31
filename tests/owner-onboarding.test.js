import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOwnerSetup,ownerSetupHandler,parseOwnerProgress,ownerProgressHandler,getOwnerOnboardingContext} from '../src/api/platform/ownerOnboarding.js';
import {getOwnerContinuationPath} from '../src/utils/authRedirect.js';
import {ownerSetupPath} from '../src/utils/enquiryReturnPath.js';
import {normalizePublicSignupDetails} from '../src/api/auth/publicSignupChallengeService.js';
import {createPublicSignupVerificationLink} from '../src/api/auth/publicSignupVerificationEmail.js';
import {consumeSeekerVerificationContext} from '../src/utils/seekerVerificationFragment.js';

const actorId='11111111-1111-4111-8111-111111111111',authId='22222222-2222-4222-8222-222222222222';
const input={name:'Example workspace',country:'LK',requestId:'33333333-3333-4333-8333-333333333333'};
const record={id:'44444444-4444-4444-8444-444444444444',authId,appUserId:actorId,email:'owner@example.test',metadata:{owner_onboarding:input}};
const user={id:actorId,auth_id:authId,email:record.email};

test('durable owner draft permits an unfinished name but no caller authority fields',()=>{
  assert.equal(parseOwnerProgress({...input,name:''}).name,'');
  for(const key of ['role','step','tenantId','appUserId','verified']){
    assert.throws(()=>parseOwnerProgress({...input,[key]:'injected'}),{code:'OWNER_PROGRESS_INVALID'});
  }
});
test('draft endpoint binds reciprocal server identity and rejects foreign or disabled requests before writing',async()=>{
  for(const change of [{user:{...user,id:authId}},{user:{...user,auth_id:actorId}},{user:{...user,email:'other@example.test'}},{authSession:null}]){
    let calls=0;const res={set(){},status(n){this.code=n;return this;},json(){}};
    await ownerProgressHandler({enabled:()=>true,saveProgress:async()=>{calls++;}})({user,authSession:{record},body:input,...change},res,e=>{throw e;});
    assert.equal(res.code,401);assert.equal(calls,0);
  }
  let received;const res={set(){},json(v){this.body=v;}};
  await ownerProgressHandler({enabled:()=>true,saveProgress:async args=>{received=args;return args.input;}})({user,authSession:{record},body:input,tenantId:'foreign'},res,e=>{throw e;});
  assert.deepEqual(received,{record,input});
});
test('continuation uses saved draft, actual selected membership and real property existence',async()=>{
  let calls=0;const query=async()=>{calls++;return [{has_properties:0}];};
  const pending=await getOwnerOnboardingContext({record,user,tenantContext:{memberships:[]},query});
  assert.equal(pending.step,'workspace');assert.equal(calls,0);
  const tenantId='55555555-5555-4555-8555-555555555555';
  const membership={tenant_id:tenantId,role:'admin',status:'active'};
  const subject={record,user,tenantContext:{tenantId,membership,memberships:[membership]},query};
  assert.equal((await getOwnerOnboardingContext(subject)).step,'property');
  assert.equal((await getOwnerOnboardingContext({...subject,query:async()=>[{has_properties:1}]})).step,'complete');
  assert.equal(await getOwnerOnboardingContext({...subject,query:async()=>[]}),null);
  assert.equal(await getOwnerOnboardingContext({...subject,user:{...user,email:'foreign@example.test'}}),null);
  assert.equal(await getOwnerOnboardingContext({...subject,tenantContext:{...subject.tenantContext,membership:{...membership,status:'revoked'}}}),null);
  assert.equal(await getOwnerOnboardingContext({...subject,tenantContext:{memberships:[membership]}}),null);
  assert.equal(getOwnerContinuationPath({user:{role:'authenticated',ownerOnboarding:pending}}),'/owner-start?country=LK');
  assert.equal(getOwnerContinuationPath({user:{role:'admin',ownerOnboarding:pending}}),null);
  const profile={role:'authenticated',ownerOnboarding:{...pending,step:'property',tenantId}};
  assert.equal(getOwnerContinuationPath({user:profile,membership}),'/dashboard/properties/new?country=LK');
  assert.equal(getOwnerContinuationPath({user:{...profile,ownerOnboarding:{...profile.ownerOnboarding,tenantId:actorId}},membership}),'/dashboard/properties');
});
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
