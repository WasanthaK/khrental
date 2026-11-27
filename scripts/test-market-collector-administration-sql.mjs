import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {BILLING_ACCOUNT} from '../src/api/managementBilling/contract.js';
import express from 'express';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createManagementBillingRouter} from '../src/api/managementBilling/router.js';

export async function verifyCollectorAdministration(pool) {
  const store=createBillingStore({getPool:async()=>pool});
  const [actor]=await store.read('SELECT TOP (1) id FROM dbo.app_users ORDER BY id');
  const app=express();
  app.use(express.json());
  let admin=true,stillAuthorized=true;
  app.use(createManagementBillingRouter({store,env:{MANAGEMENT_BILLING_SCHEMA_READY:'true'},
    resolveContext:(req,_res,next)=>{Object.assign(req,{authSession:{},user:{id:actor.id}});next();},
    checkPlatformAdmin:async(_user, options)=>options?stillAuthorized:admin}));
  const server=app.listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    const endpoint='http://127.0.0.1:'+server.address().port+'/admin/collectors';
    const date=new Date();
    date.setUTCFullYear(date.getUTCFullYear()+1);date.setUTCSeconds(0,0);
    const first={market:'lk',provider:'stripe',receivingAccount:'acct_fixtureFirst',effectiveAt:date.toISOString(),approvalReference:'Sandbox QA decision A'};
    const post=async data=>{
      const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      return {status:res.status,body:await res.json()};
    };
    admin=false;
    assert.equal((await post(first)).status,403);
    assert.equal((await fetch(endpoint)).status,403);
    admin=true;stillAuthorized=false;
    assert.equal((await post(first)).status,403);
    stillAuthorized=true;
    const saved=await post(first);
    assert.equal(saved.status,200,JSON.stringify(saved.body));
    const retry=await post(first);
    assert.deepEqual(retry,saved);
    assert.equal((await post({...first,receivingAccount:'acct_other'})).status,409);
    const second={...first,receivingAccount:'acct_fixtureSecond',approvalReference:'Sandbox QA decision B',effectiveAt:new Date(+date+60000).toISOString()};
    assert.equal((await post(second)).status,200);
    const resolveAt=async (market,instant)=>store.read(`SELECT provider,receiving_account
      FROM dbo.management_sandbox_collector_at(@market,CONVERT(datetime2,@instant))`,{market,instant:instant.slice(0,-1)});
    assert.deepEqual(await resolveAt('LK',new Date(+date-1).toISOString()),[]);
    assert.deepEqual(await resolveAt('NZ',second.effectiveAt),[]);
    assert.deepEqual(await resolveAt('LK',first.effectiveAt),[{provider:'stripe',receiving_account:first.receivingAccount}]);
    assert.deepEqual(await resolveAt('LK',second.effectiveAt),[{provider:'stripe',receiving_account:second.receivingAccount}]);
    const rows=(await (await fetch(endpoint)).json()).data;
    assert.equal(rows.length,2);
    assert.deepEqual(rows.map(row=>row.receivingAccount),[second.receivingAccount,first.receivingAccount]);
    await assert.rejects(store.read('UPDATE dbo.management_market_sandbox_collectors SET receiving_account=@ref WHERE id=@id',{ref:'acct_changed',id:saved.body.data.id}),/history is retained/);
    const audits=await store.read("SELECT id FROM dbo.management_billing_audit WHERE action='collector.sandbox.scheduled'");
    assert.equal(audits.length,2);
    // Use dated fixture history to exercise today's normal enrollment without advancing any clock.
    const oldTenant=randomUUID(), newTenant=randomUUID();
    const enroll=tenantId=>store.enroll({tenantId,actorId:actor.id,market:'LK',
      useApprovedSandboxBaseline:true,reason:'Disposable collector account selection fixture.'});
    for (const tenantId of [oldTenant,newTenant]) {
      await store.read("INSERT dbo.tenants(id,slug,status,[plan]) VALUES(@tenantId,@slug,'active','development-testing')",
        {tenantId,slug:'collector-'+tenantId});
      await store.read("INSERT dbo.properties(id,tenant_id,name,propertytype,country_code) VALUES(@id,@tenantId,'Collector fixture','house','LK')",
        {id:randomUUID(),tenantId});
    }
    const insertHistorical=async(account,days)=>{
      const id=randomUUID();
      await store.read(`INSERT dbo.management_market_sandbox_collectors(id,market,provider,receiving_account,
        effective_at_utc,approval_reference,created_by) VALUES(@id,'LK','stripe',@account,
        DATEADD(day,@days,SYSUTCDATETIME()),'Disposable pre-existing decision',@actorId)`,
        {id,account,days,actorId:actor.id});
      return id.toLowerCase();
    };
    const originalAssignment=await insertHistorical(BILLING_ACCOUNT,-2);
    const account=await enroll(oldTenant);
    assert.equal(account.collector_assignment_id.toLowerCase(),originalAssignment);
    await insertHistorical('acct_differentFixture',-1);
    const retained=await enroll(oldTenant);
    assert.equal(retained.collector_assignment_id.toLowerCase(),originalAssignment);
    assert.equal(retained.stripe_account_id,account.stripe_account_id);
    await assert.rejects(enroll(newTenant),{code:'BILLING_COLLECTOR_UNAVAILABLE'});
    assert.equal(await store.account(newTenant),null);
    console.log('R5_33_SANDBOX_COLLECTOR=PASS admin_only recheck_before_write original_retry immutable_by_date country_isolation two_versions old_binding_retained mismatch_rolled_back');
  } finally {await new Promise(resolve=>server.close(resolve));}
}
