import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createInvitationDelivery} from '../src/api/auth/invitations.js';
import {createInvitationRouter} from '../src/api/auth/invitationRouter.js';
import {consumeEmailQuota} from '../src/api/email/manualEmailPolicy.js';

const token='synthetic-invitation-capability';
const target={appUserId:'person',email:'recipient@example.invalid',name:'Recipient',intendedRole:'rentee',userType:'rentee'};
const input={tenantId:'tenant',appUserId:'person',createdBy:'admin'};
const issued=()=>({token,expiresAt:'2030-01-01T00:00:00Z',target});
const env={NODE_ENV:'production',PASSWORD_RESET_BASE_URL:'https://app.quixo.homes'};

test('invitation delivery binds persisted recipient and hides token from actual HTTP response',async()=>{
  const messages=[];
  const deliver=createInvitationDelivery({env,quota:async()=>{},issue:async args=>{assert.deepEqual(args,input);return issued();},
    sendEmail:async message=>{messages.push(message);return{success:true,providerStatus:202};}});
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{req.tenantContext={tenantId:'tenant',user:{id:'admin',role:'admin'},membership:{tenant_id:'tenant',role:'admin',status:'active'}};next();});
  app.use(createInvitationRouter({sendInvitation:deliver}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/invitations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({appUserId:'person',email:'attacker@example.invalid',baseUrl:'https://attacker.invalid'})});
    assert.equal(r.status,201);const body=await r.json();
    assert.equal(body.data.delivery.accepted,true);assert.equal(body.data.invitation.token,undefined);
    assert.ok(!JSON.stringify(body).includes(token));assert.equal(messages.length,1);
    assert.equal(messages[0].to,target.email);assert.match(messages[0].text,/https:\/\/app.quixo.homes\/accept-invite\?token=/);
    assert.ok(messages[0].text.includes(token));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('uncertain or failed provider delivery revokes only its issued token',async()=>{
  for(const result of [null,{success:false,providerStatus:202},{success:true,providerStatus:200},{success:true,providerStatus:202,simulated:true},new Error('private provider data')]){
    const revoked=[];const deliver=createInvitationDelivery({env,quota:async()=>{},issue:async()=>issued(),revoke:async t=>revoked.push(t),sendEmail:async()=>{if(result instanceof Error){throw result;}return result;}});
    await assert.rejects(deliver(input),e=>e.code==='INVITATION_DELIVERY_UNCONFIRMED'&&!e.message.includes('private'));
    assert.deepEqual(revoked,[token]);
  }
});

test('quota and origin failure happen before token issue or mail dispatch',async()=>{
  let calls=0;
  const issue=async()=>{calls++;return issued();};
  const quota=async()=>{throw Object.assign(new Error('quota'),{status:429});};
  await assert.rejects(createInvitationDelivery({env,issue,quota})(input),{status:429});
  await assert.rejects(createInvitationDelivery({env:{...env,PASSWORD_RESET_BASE_URL:'https://attacker.invalid'},issue})(input),{code:'INVITATION_DELIVERY_UNAVAILABLE'});
  assert.equal(calls,0);
  const buckets=[];
  await consumeEmailQuota({actorId:'admin',tenantId:'tenant',secret:'x'.repeat(32),limiter:{durable:true,consume:async x=>{buckets.push(x);return true;}}});
  assert.deepEqual(buckets.map(x=>[x.scope,x.max]),[['manual-email-user',5],['manual-email-tenant',50]]);
  assert.ok(buckets.every(x=>/^[a-f0-9]{64}$/.test(x.key)));
});
