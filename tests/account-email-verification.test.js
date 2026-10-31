import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createAccountEmailVerificationRouter,hashAccountEmailToken} from '../src/api/auth/accountEmailVerification.js';
import {hashPublicSignupChallengeToken} from '../src/api/auth/publicSignupChallenge.js';
import {createPublicSignupVerificationEmail} from '../src/api/auth/publicSignupVerificationEmail.js';
import {consumeSeekerVerificationContext} from '../src/utils/seekerVerificationFragment.js';
import {createPublicSignupSendGridAdapters} from '../src/api/auth/publicSignupSendGrid.js';

const id='11111111-1111-4111-8111-111111111111';
const authId='22222222-2222-4222-8222-222222222222';
const appUserId='33333333-3333-4333-8333-333333333333';
const token='b'.repeat(43);
const record={id,auth_id:authId,app_user_id:appUserId,email:'owner@example.test',password_hash:'fixture-credential',password_salt:'fixture-salt'};

test('existing-account proof is purpose-separated and bound to identity, email and current credential',()=>{
  const digest=hashAccountEmailToken(token,record);
  assert.notEqual(digest,hashPublicSignupChallengeToken(token));
  for(const [key,value] of Object.entries({id:authId,auth_id:appUserId,app_user_id:authId,
    email:'other@example.test',password_hash:'changed',password_salt:'changed',password_algorithm:'changed'})){
    assert.notEqual(hashAccountEmailToken(token,{...record,[key]:value}),digest,key);
  }
  assert.equal(hashAccountEmailToken(token,{...record,email:'OWNER@EXAMPLE.TEST',id:id.toUpperCase()}),digest);
  assert.throws(()=>hashAccountEmailToken('short',record));
  assert.throws(()=>hashAccountEmailToken(token,{...record,app_user_id:null}));
});

test('existing-account mail carries a distinct isolated fragment and unchanged SendGrid tracking policy',async()=>{
  let payload;
  const mail=createPublicSignupSendGridAdapters({apiKey:'synthetic',senderEmail:'noreply@quixo.homes',
    baseUrl:'https://app.quixo.homes',production:true,fetchImpl:async(_url,options)=>{
      payload=JSON.parse(options.body);return {ok:true,status:202,headers:{get:()=>null}};
    }});
  const email=mail.makeEmail({token,accountChallenge:id,ownerCountry:'BN'});
  assert.ok(email.text.includes('existing account'));
  await mail.sendEmail({to:record.email,...email});
  assert.deepEqual(payload.tracking_settings,{click_tracking:{enable:false,enable_text:false},open_tracking:{enable:false}});
  const link=email.text.split('\n').find(x=>x.startsWith('https:'));
  const url=new URL(link);let scrubbed;
  const context=consumeSeekerVerificationContext({location:url,history:{replaceState(_a,_b,path){scrubbed=path;}}});
  assert.equal(url.search,'');assert.equal(scrubbed,'/verify-email');
  assert.deepEqual(context,{token,enquirySearch:'?ownerCountry=BN',accountChallenge:id});
  assert.throws(()=>createPublicSignupVerificationEmail({token,baseUrl:'https://app.quixo.homes',accountChallenge:'bad',ownerCountry:'LK'}));
});

const fixture=async(options,run)=>{
  const calls={sent:[],finished:[],issued:0,redeemed:0,limits:[]};
  const config={enabled:true,authenticate:(req,_res,next)=>{req.authSession={record:{appUserId,authId,email:record.email}};next();},
    limiter:{durable:true,consume:async value=>{calls.limits.push(value);return true;}},
    clientAddress:()=> '192.0.2.1',throttleSecret:'fixture-only-secret'.repeat(3),
    mail:{makeEmail:()=>({subject:'Synthetic verification'}),sendEmail:async value=>{calls.sent.push(value);return {success:true};}},
    finishDelivery:async value=>{calls.finished.push(value);return true;},
    store:{begin:async()=>{calls.issued++;return {challengeId:id,token,email:record.email};},
      redeem:async()=>{calls.redeemed++;return {verified:true};}},...options};
  const app=express();app.use(express.json());app.use(createAccountEmailVerificationRouter(config));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{await run(async(path,body)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+path,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};},calls);}
  finally{await new Promise(r=>server.close(r));}
};

test('signed-in send uses only server email and reports provider acceptance, never delivered or raw token',async()=>{
  await fixture({},async(post,calls)=>{
    const response=await post('/account-challenge',{country:'LK'});
    assert.equal(response.status,200);assert.equal(response.body.data.accepted,true);
    assert.ok(!JSON.stringify(response).includes(token));assert.equal(calls.sent[0].to,record.email);
    assert.deepEqual(calls.finished,[{challengeId:id,providerAccepted:true}]);
    assert.deepEqual(calls.limits.map(x=>x.scope),['challenge-ip','challenge-email']);
    assert.ok(calls.limits.every(x=>/^[a-f0-9]{64}$/.test(x.key)));
    assert.equal((await post('/account-challenge',{country:'LK',email:'other@example.test'})).status,400);
    assert.equal(calls.sent.length,1);
  });
});
test('anonymous requests, missing provider, exhausted quota and cooldown never send',async()=>{
  for(const [options,status] of [
    [{authenticate:(_req,_res,next)=>next()},401],
    [{mail:null},503],
    [{pilotEmail:'different@example.test'},403],
    [{limiter:{durable:true,consume:async()=>false}},429],
    [{store:{begin:async()=>null}},429]
  ]){await fixture(options,async(post,calls)=>{assert.equal((await post('/account-challenge',{country:'BN'})).status,status);assert.equal(calls.sent.length,0);});}
});
test('pilot redemption passes the server-selected mailbox constraint to the store',async()=>{
  await fixture({pilotEmail:record.email,store:{redeem:async input=>{
    assert.deepEqual(input,{token,challengeId:id,expectedEmail:record.email});return {verified:true};
  }}},async post=>assert.equal((await post('/account-redeem',{token,challengeId:id})).status,200));
});
test('rejected or ambiguous provider delivery revokes the issued challenge and never claims success',async()=>{
  for(const result of [null,{success:true,simulated:true},{success:false}]){
    await fixture({mail:{makeEmail:()=>({}),sendEmail:async()=>result}},async(post,calls)=>{
      assert.equal((await post('/account-challenge',{country:'LK'})).status,503);
      assert.deepEqual(calls.finished,[{challengeId:id,providerAccepted:false}]);
    });
  }
});
test('anonymous explicit redemption grants verification only, never a session or account switch',async()=>{
  await fixture({},async(post,calls)=>{
    assert.deepEqual(await post('/account-redeem',{token,challengeId:id}),{status:200,body:{data:{verified:true}}});
    assert.equal(calls.redeemed,1);assert.deepEqual(calls.limits.map(x=>x.scope),['redeem-ip']);
    assert.equal((await post('/account-redeem',{token,challengeId:id,role:'admin'})).status,400);
    assert.equal(calls.redeemed,1);
  });
});
