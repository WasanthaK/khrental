// Public HTTP against a temporary server-owned scope; seeded billing dates are
// explicit test data, not claims of naturally elapsed Stripe grace.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {BILLING_ACCOUNT,BILLING_PRICE,hash} from '/app/src/api/managementBilling/contract.js';
import {createAuthRecord,issueAuthSession,revokeAccessToken} from '/app/src/api/auth/index.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const target=JSON.parse(process.env.HTTP_ACCEPTANCE_TARGET||'{}'),store=createBillingStore();
const proof={fixtureId:target.id,scope:'public authenticated HTTP + deployed SQL; seeded billing states',checks:[]};
let stage='preflight',token,actorId,created=false;
const check=(name)=>{proof.checks.push(name);console.log('HTTP_CHECK='+name);};
const main=async()=>{
  assert.match(target.id||'',/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(process.env.MANAGEMENT_BILLING_SCHEMA_READY,'true');
  assert.equal(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED,'true');
  assert.equal(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS,target.id);
  const protectedId='80A4B392-13F8-484D-81FA-A110A6EF75F0';
  assert.notEqual(target.id.toLowerCase(),protectedId.toLowerCase());
  assert.deepEqual(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).split(',').map(x=>x.trim().toLowerCase()),[protectedId.toLowerCase()]);
  const controlHash=hash(await store.account(protectedId));
  const dedicatedId='2383f4fc-e107-4ac7-9e13-39db501f40ec',dedicatedHash=hash(await store.account(dedicatedId));
  await store.locked(target.id,async q=>{
    assert.equal((await q('SELECT id FROM dbo.tenants WHERE id=@id',{id:target.id})).length,0,'Existing fixture must be inspected, not rerun');
    await q("INSERT INTO dbo.tenants(id,name,slug,status,[plan]) VALUES(@id,'R5 HTTP enforcement acceptance',@slug,'active','development-testing')",{id:target.id,slug:`r5-http-${target.id}`});
    await q(`INSERT INTO dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,market,inventory_json,subscription_status,initial_payment_verified,grace_started_at)
      VALUES(@id,@account,@price,'LK','[]','past_due',1,DATEADD(DAY,-8,SYSUTCDATETIME()))`,{id:target.id,account:BILLING_ACCOUNT,price:BILLING_PRICE});
  });created=true;
  stage='persisted_fixture_session';
  actorId=randomUUID();const authId=randomUUID(),email=`r5-http-${target.id}@example.invalid`;
  await store.locked(target.id,async q=>{
    await q("INSERT INTO dbo.app_users(id,tenant_id,name,email,role,user_type,auth_id,status) VALUES(@actor,@id,'R5 HTTP fixture administrator',@email,'admin','admin',@auth,'active')",{actor:actorId,id:target.id,email,auth:authId});
    await q("INSERT INTO dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@id,@actor,'admin','active',1)",{id:target.id,actor:actorId});
  });
  const record=await createAuthRecord({authId,appUserId:actorId,email,role:'admin',password:randomBytes(32).toString('base64url'),metadata:{acceptance_fixture:target.id}});
  token=(await issueAuthSession(record)).accessToken;
  const api=async(method,path,body,tenant=target.id)=>{
    const response=await fetch('https://app.quixo.homes/api/mssql/'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{Authorization:`Bearer ${token}`,'x-tenant-id':tenant,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();return {status:response.status,data};
  };
  const templateId=randomUUID();proof.templateId=templateId;
  const snapshot=async()=>hash(await store.read('SELECT * FROM dbo.agreement_templates WHERE tenant_id=@id',{id:target.id}));
  const denied=async(method,path,body)=>{
    const before=await snapshot(),response=await api(method,path,body);
    assert.equal(response.status,403);assert.equal(response.data.code,'MANAGEMENT_READ_ONLY');assert.equal(await snapshot(),before);
  };
  const state=async(statement,params={})=>store.locked(target.id,q=>q('UPDATE dbo.management_billing_accounts SET '+statement+' WHERE tenant_id=@id',{id:target.id,...params}));
  stage='public_expired_grace_denial';
  await denied('POST','agreement-templates',{id:templateId,name:'R5 fixture',content:'<p>Acceptance fixture only.</p>',MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:false});
  check('expired_grace_create_denied_without_write');
  await state('grace_started_at=SYSUTCDATETIME()');
  let response=await api('POST','agreement-templates',{id:templateId,name:'R5 fixture',content:'<p>Acceptance fixture only.</p>'});
  assert.equal(response.status,201);assert.equal(response.data.data.id.toLowerCase(),templateId);check('current_grace_create_allowed');
  const path='agreement-templates/'+templateId;
  await state('grace_started_at=DATEADD(DAY,-8,SYSUTCDATETIME())');
  await denied('PUT',path,{name:'Must not persist'});
  response=await api('GET',path);assert.equal(response.status,200);assert.equal(response.data.data.name,'R5 fixture');
  check('expired_grace_update_denied_history_read_allowed');
  stage='natural_complimentary_expiry';
  await state("comp_type='fixed',comp_expires_at=DATEADD(SECOND,30,SYSUTCDATETIME())");
  response=await api('PUT',path,{name:'Temporary complimentary access'});assert.equal(response.status,200);check('fixed_complimentary_write_allowed');
  let expired=false;
  for(let n=0;n<45;n++){
    const row=(await store.read('SELECT CASE WHEN SYSUTCDATETIME()>=comp_expires_at THEN 1 ELSE 0 END AS expired FROM dbo.management_billing_accounts WHERE tenant_id=@id',{id:target.id}))[0];
    if(row.expired===1){expired=true;break;}await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(expired);await denied('PUT',path,{name:'Expired complimentary write'});check('natural_fixed_complimentary_expiry_denied');
  await state("comp_type='ongoing',comp_expires_at=NULL");
  response=await api('PUT',path,{name:'Ongoing complimentary access'});assert.equal(response.status,200);
  await state('comp_type=NULL');await denied('PUT',path,{name:'Revoked complimentary write'});check('complimentary_revoke_denied');
  stage='paid_state_and_authority';
  await state("subscription_status='active',paid_through=DATEADD(DAY,1,SYSUTCDATETIME()),grace_started_at=NULL");
  response=await api('PUT',path,{name:'Paid fixture write'});assert.equal(response.status,200);check('seeded_paid_write_allowed');
  response=await api('GET',path,undefined,protectedId);assert.equal(response.status,403);check('foreign_organization_denied');
  await store.locked(target.id,q=>q("UPDATE dbo.tenant_memberships SET role='rentee' WHERE tenant_id=@id AND app_user_id=@actor",{id:target.id,actor:actorId}));
  const before=await snapshot();response=await api('PUT',path,{name:'Stale admin must not write'});assert.equal(response.status,403);assert.equal(await snapshot(),before);check('stale_administrator_role_denied');
  assert.equal(hash(await store.account(protectedId)),controlHash);assert.equal(hash(await store.account(dedicatedId)),dedicatedHash);
  Object.assign(proof,{passed:true,protectedBillingFixturesUnchanged:true,stripeWrites:0,seededGraceDates:true,naturalSevenDayGrace:false,naturalComplimentaryExpiry:true,
    credentialLoginAccepted:false,persistedSessionAuthority:true,fullRouteMatrixAccepted:false});
};
try{await main();}catch(error){console.error('HTTP_FAILED='+JSON.stringify({stage,code:error.code||'UNCONFIRMED',...proof}));process.exitCode=1;}
finally{
  try{
    if(token){await revokeAccessToken(token);}
    if(created){await store.locked(target.id,async q=>{
      if(actorId){await q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@id AND app_user_id=@actor; UPDATE dbo.app_users SET status='inactive',active=0 WHERE id=@actor AND tenant_id=@id",{id:target.id,actor:actorId});}
      await q("UPDATE dbo.tenants SET status='inactive' WHERE id=@id",{id:target.id});
    });}
    proof.fixtureClosed=true;
    if(proof.passed){console.log('HTTP_PASS='+JSON.stringify(proof));}
  }catch{console.error('HTTP_CLEANUP_FAILED='+JSON.stringify({fixtureId:target.id}));process.exitCode=1;}
  await closeMssqlPool();
}
