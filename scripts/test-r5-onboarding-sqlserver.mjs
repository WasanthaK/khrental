// Real HTTP/session/SQL regression; all records and funds below are disposable fixtures.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import sql from 'mssql';
import express from 'express';

const docker = args => execFileSync('docker', args, {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const name = `khrental-r5-${process.pid}-${Date.now()}`;
const password = `SqlFixture!${crypto.randomBytes(20).toString('hex')}9`;
let pool, server, closeMssqlPool, started=false;
try {
  docker(['run','-d','--name',name,'-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e',`MSSQL_SA_PASSWORD=${password}`,'-p','127.0.0.1::1433','mcr.microsoft.com/mssql/server:2022-latest']);
  started=true;
  const port=Number(docker(['port',name,'1433/tcp']).match(/:(\d+)\s*$/)[1]);
  const config={server:'127.0.0.1',port,user:'sa',password,options:{encrypt:false,trustServerCertificate:true},requestTimeout:60000};
  for(let i=0;i<45;i++) {
    try {pool=await new sql.ConnectionPool(config).connect();break;}
    catch(error) {if(i===44)throw error;await new Promise(r=>setTimeout(r,2000));}
  }
  await pool.request().query('CREATE DATABASE r5proof'); await pool.close();
  pool=await new sql.ConnectionPool({...config,database:'r5proof'}).connect();
  for(const file of ['20260913_00_create_fresh_mssql_schema.sql','20260915_01_create_staff_property_assignments.sql','20260915_02_create_user_invitations.sql','20260916_02_add_staff_permission_bundles.sql','20260916_03_add_tenancy_onboarding.sql']) {
    await pool.request().batch(fs.readFileSync(`migrations/${file}`,'utf8'));
  }
  Object.assign(process.env,{MSSQL_SERVER:'127.0.0.1',MSSQL_PORT:String(port),MSSQL_DATABASE:'r5proof',MSSQL_USER:'sa',MSSQL_PASSWORD:password,MSSQL_AUTHENTICATION:'sql-password',MSSQL_ENCRYPT:'false',MSSQL_TRUST_SERVER_CERTIFICATE:'true',ALLOW_LEGACY_AUTH_HEADERS:'false'});
  delete process.env.VITE_ENABLE_DEV_BYPASS;
  const {ensureAuthSchema,createAuthRecord,issueAuthSession,createSessionAuthMiddleware}=await import('../src/api/auth/index.js');
  const {createTenancyOnboardingRouter}=await import('../src/api/platform/tenancyOnboardingRouter.js');
  ({closeMssqlPool}=await import('../src/api/mssql/pool.js'));
  await ensureAuthSchema();
  const q=async(text,params={})=>{const r=pool.request();for(const [k,v] of Object.entries(params))r.input(k,v);return (await r.query(text)).recordset||[];};
  const one=async(...args)=>(await q(...args))[0];
  const fixture=async label=>{
    const t=await one("INSERT tenants(name,slug,status) OUTPUT INSERTED.id VALUES(@label,@label,'active')",{label});
    const tenantId=t.id;
    const person=async role=>{
      const email=`${label}-${role}@example.invalid`,authId=crypto.randomUUID();
      const u=await one("INSERT app_users(tenant_id,name,email,role,user_type,auth_id) OUTPUT INSERTED.id VALUES(@tenantId,@name,@email,@role,@role,@authId)",{tenantId,name:role,email,role,authId});
      await q("INSERT tenant_memberships(tenant_id,app_user_id,role,status) VALUES(@tenantId,@id,@role,'active')",{tenantId,id:u.id,role});
      const record=await createAuthRecord({authId,appUserId:u.id,email,role,password:crypto.randomBytes(24).toString('hex')});
      return {id:u.id,token:(await issueAuthSession(record)).accessToken};
    };
    const owner=await person('admin'),renter=await person('rentee');
    const p=await one("INSERT properties(tenant_id,name,status,checklistitems) OUTPUT INSERTED.id VALUES(@tenantId,@label,'available','[]')",{tenantId,label});
    const a=await one("INSERT agreements(tenant_id,renteeid,propertyid,status,depositamount,signature_status) OUTPUT INSERTED.id VALUES(@tenantId,@renteeId,@propertyId,'signed',125000,'completed')",{tenantId,renteeId:renter.id,propertyId:p.id});
    return {tenantId,owner,renter,propertyId:p.id,agreementId:a.id};
  };
  const a=await fixture('r5-a'),b=await fixture('r5-b');
  const app=express();app.use(express.json());app.use('/api',createSessionAuthMiddleware());app.use('/api/tenancies',createTenancyOnboardingRouter());
  app.use((err,req,res,next)=>res.status(err.status||500).json({error:{message:err.message,code:err.code}}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const call=async(suffix,body,who=a.owner,tenantId=a.tenantId,method=body?'POST':'GET')=>{
    const response=await fetch(`${origin}/api/tenancies/${a.agreementId}${suffix}`,{method,headers:{Authorization:`Bearer ${who.token}`,'x-tenant-id':tenantId,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,json:await response.json()};
  };
  assert.equal((await call('/onboarding',null,b.owner,b.tenantId)).status,404);
  assert.equal((await call('/onboarding',null,a.renter)).status,403);
  assert.equal((await call('/checklist',{})).status,409,'empty property cannot manufacture an inspection');
  const empty=await one("INSERT tenancy_move_in_checklists(tenant_id,agreement_id,propertyid,status) OUTPUT INSERTED.id VALUES(@tenantId,@agreementId,@propertyId,'completed')",a);
  assert.equal((await call('/onboarding')).json.data.readiness.checks.moveInChecklistComplete,false,'legacy empty completed header is not evidence');
  await q('UPDATE properties SET checklistitems=@items WHERE id=@id',{id:a.propertyId,items:JSON.stringify(['Keys counted','Meter readings recorded','Room condition reviewed'])});
  const initialized=await Promise.all([call('/checklist',{}),call('/checklist',{})]);
  assert.deepEqual(initialized.map(x=>x.status),[201,201]);
  const checklist=(await call('/onboarding')).json.data.checklist;
  assert.equal(checklist.id,empty.id);assert.equal(checklist.items.length,3);assert.equal(checklist.status,'open');
  assert.equal((await call('/activate',{})).status,409);
  const deposit={transactionType:'security_deposit',amount:125000,paymentMethod:'SIMULATED TEST',paymentReference:'SIMULATED-R5-01',notes:'Disposable test only; no funds received.'};
  assert.equal((await call('/deposits',{...deposit,paymentReference:''})).status,400);
  assert.equal((await call('/deposits',deposit,b.owner,b.tenantId)).status,404);
  const repeats=await Promise.all([call('/deposits',deposit),call('/deposits',deposit)]);
  assert.deepEqual(repeats.map(x=>x.status).sort(),[200,201]);assert.equal(repeats[0].json.data.id,repeats[1].json.data.id);
  assert.equal((await call('/deposits',{...deposit,amount:1})).status,409);
  let projection=(await call('/onboarding')).json.data;
  assert.equal(projection.deposit.transactions.length,1);assert.equal(projection.deposit.securityDeposit,125000);
  assert.equal((await q("SELECT id FROM tenancy_lifecycle_events WHERE agreement_id=@id AND event_type='deposit_recorded'",{id:a.agreementId})).length,1);
  // Failed audit insert must roll back the associated money record.
  await pool.request().batch("CREATE TRIGGER dbo.r5_deposit_rollback ON dbo.tenancy_lifecycle_events AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE event_type='deposit_recorded') THROW 51099,'FIXTURE_ROLLBACK',1; END");
  assert.equal((await call('/deposits',{...deposit,paymentReference:'ROLLBACK'})).status,500);
  await pool.request().batch('DROP TRIGGER dbo.r5_deposit_rollback');
  assert.equal((await call('/onboarding')).json.data.deposit.transactions.length,1);
  for(const item of checklist.items) assert.equal((await call(`/checklist/items/${item.id}`,{status:'completed'},a.owner,a.tenantId,'PATCH')).status,200);
  projection=(await call('/onboarding')).json.data;assert.equal(projection.readiness.canActivate,true);
  const activations=await Promise.all([call('/activate',{}),call('/activate',{})]);assert.deepEqual(activations.map(x=>x.status),[200,200]);
  assert.equal((await q("SELECT id FROM tenancy_lifecycle_events WHERE agreement_id=@id AND event_type='tenancy_activated'",{id:a.agreementId})).length,1);
  assert.equal((await call('/onboarding')).json.data.agreement.status,'active');
  assert.equal((await one('SELECT status FROM properties WHERE id=@id',{id:a.propertyId})).status,'rented');
  assert.equal((await call(`/checklist/items/${checklist.items[0].id}`,{status:'pending'},a.owner,a.tenantId,'PATCH')).status,404,'activated inspection retained');
  const summary=await fetch(`${origin}/api/tenancies/me/summary`,{headers:{Authorization:`Bearer ${a.renter.token}`,'x-tenant-id':a.tenantId}});
  assert.equal((await summary.json()).data.tenancies.length,1);
  console.log('R5_ONBOARDING_SQL=PASS empty_denial repair concurrency deposits replay conflict rollback isolation activation readback retained_inspection renter_access');
} finally {
  await new Promise(r=>server?server.close(r):r());await closeMssqlPool?.();await pool?.close();if(started)docker(['rm','-f',name]);
}
