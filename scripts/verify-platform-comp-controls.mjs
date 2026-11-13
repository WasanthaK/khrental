// BL07.2 fixture preparation and read-only audit verification. All access
// decisions are performed separately in the real signed-in Platform Admin UI.
import assert from 'node:assert/strict';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {hash,BILLING_ACCOUNT} from '/app/src/api/managementBilling/contract.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';
const id='50d11c5d-ccb0-4e36-92c5-4f09e4962d68',property='a12bdd7b-3277-4125-8b44-f12051f59d61';
const store=createBillingStore(),mode=process.env.COMP_MODE;
let stage='preflight';
try{
  assert.ok(['prepare','inspect'].includes(mode));
  assert.equal(process.env.MANAGEMENT_BILLING_SANDBOX_ENABLED,'true');
  assert.equal(process.env.MANAGEMENT_BILLING_SCHEMA_READY,'true');
  const protectedIds=['80a4b392-13f8-484d-81fa-a110a6ef75f0','2383f4fc-e107-4ac7-9e13-39db501f40ec'];
  const before=await Promise.all(protectedIds.map(async key=>hash(await store.account(key))));
  assert.equal(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).toLowerCase(),protectedIds[0]);
  const tenant=(await store.read('SELECT id,name,slug,status,[plan] FROM dbo.tenants WHERE id=@id',{id}))[0];
  assert.equal(tenant?.slug,'r5-comp-controls-20261113');
  assert.equal(tenant.plan,'development-testing');
  assert.equal((await store.read('SELECT id FROM dbo.app_users WHERE tenant_id=@id',{id})).length,0);
  assert.equal((await store.read('SELECT id FROM dbo.tenant_memberships WHERE tenant_id=@id',{id})).length,0);
  if(mode==='prepare'){
    stage='prepare_private_stock';
    await store.locked(id,async q=>{
      assert.equal(tenant.status,'active');
      assert.equal(await store.account(id,q),null);
      assert.equal((await q('SELECT id FROM dbo.properties WHERE tenant_id=@id',{id})).length,0,'Existing fixture: inspect instead of replaying');
      await q("INSERT dbo.properties(id,tenant_id,name,status,propertytype,country_code,createdat,updatedat) VALUES(@property,@id,'BL07.2 unpublished synthetic house','available','house','LK',SYSUTCDATETIME(),SYSUTCDATETIME())",{id,property});
      await q('UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME() WHERE property_id=@property AND tenant_id=@id',{id,property});
      assert.equal((await q('SELECT property_id FROM dbo.public_listing_preferences WHERE property_id=@property AND tenant_id=@id AND opted_out=1',{id,property})).length,1);
      assert.equal((await store.inventory(id,q)).length,1);
    });
  }else{
    stage='verify_ui_decision_audit';
    assert.equal(tenant.status,'inactive');
    const account=await store.account(id);
    assert.equal(account.stripe_account_id,BILLING_ACCOUNT);
    for(const key of ['stripe_customer_id','stripe_subscription_id','comp_type','comp_expires_at']){assert.equal(account[key],null);}
    assert.equal(account.version,4);
    const rows=await store.read('SELECT id,actor_id,action,resource_id,previous_hash,current_hash,reason,created_at FROM dbo.management_billing_audit WHERE tenant_id=@id ORDER BY created_at,id',{id});
    assert.equal(rows.length,4);
    assert.equal(rows[0].action,'sandbox.enrolled');
    const states=[{type:null,expiresAt:null},{type:'fixed',expiresAt:'2026-11-14T00:00:00.000Z'},{type:'ongoing',expiresAt:null},{type:null,expiresAt:null}];
    for(const [n,action] of ['fixed','ongoing','revoke'].entries()){
      const row=rows[n+1];assert.equal(row.action,'sandbox.complimentary.'+action);
      assert.equal(row.reason,'BL07.2 browser acceptance '+action+' 20261113');
      assert.equal(row.previous_hash,hash(states[n]));assert.equal(row.current_hash,hash(states[n+1]));
      assert.equal(row.resource_id.toLowerCase(),id);assert.equal(row.actor_id,rows[0].actor_id);
    }
    assert.ok(rows[0].actor_id);
    assert.equal((await store.read('SELECT id FROM dbo.management_billing_commands WHERE tenant_id=@id',{id})).length,0);
    assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE property_id=@property AND tenant_id=@id AND opted_out=1',{id,property})).length,1);
    console.log('COMP_AUDIT='+JSON.stringify(rows));
  }
  assert.deepEqual(await Promise.all(protectedIds.map(async key=>hash(await store.account(key)))),before);
  console.log('COMP_PASS='+JSON.stringify({mode,tenantId:id,propertyId:property,passed:true,protectedAccountsUnchanged:true,stripeWrites:0,authCreated:false,accessDecisionsWrittenByScript:false,fixtureClosed:mode==='inspect'}));
}catch(error){console.error('COMP_FAILED='+JSON.stringify({mode,stage,code:error.code||'UNCONFIRMED',message:error.message}));process.exitCode=1;}
finally{await closeMssqlPool();}
