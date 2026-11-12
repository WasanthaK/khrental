// Test-only, read-only outcome: every synthetic SQL write is rolled back.
// No Stripe calls, no worker-scope changes, no durable test fixture.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getMssqlPool,closeMssqlPool,sql} from 'file:///app/src/api/mssql/pool.js';
import {BILLING_ACCOUNT,BILLING_PRICE} from 'file:///app/src/api/managementBilling/contract.js';

let tx;
const tenantId=randomUUID(),actorId=randomUUID(),propertyId=randomUUID();
const result={kind:'customer_creation_fixture_schema',rolledBack:false,customerCreated:false,workerScopeChanged:false};
try {
  assert.equal(process.env.MANAGEMENT_BILLING_SANDBOX_ENABLED,'true');
  assert.equal(process.env.MANAGEMENT_RECOVERY_SCHEMA_READY,'true');
  assert.equal(process.env.MANAGEMENT_RECOVERY_WORKER_ENABLED,'true');
  const scopes=String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  assert.equal(scopes.length,1,'Must preserve the one approved recovery-worker organization');
  assert.notEqual(scopes[0].toLowerCase(),tenantId.toLowerCase());
  const pool=await getMssqlPool();
  const scopeRows=await pool.request().input('scope',sql.UniqueIdentifier,scopes[0])
    .query("SELECT stripe_customer_id,stripe_subscription_id,subscription_status,quantity FROM dbo.management_billing_accounts WHERE tenant_id=@scope");
  assert.equal(scopeRows.recordset.length,1);
  assert.ok(scopeRows.recordset[0].stripe_subscription_id,'Accepted worker organization must remain subscribed');
  const baseline=JSON.stringify(scopeRows.recordset[0]);
  const before=await pool.request().input('tenant',sql.UniqueIdentifier,tenantId)
    .query('SELECT COUNT(*) AS n FROM dbo.tenants WHERE id=@tenant');
  assert.equal(before.recordset[0].n,0);

  tx=new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const fixture=new sql.Request(tx)
    .input('tenant',sql.UniqueIdentifier,tenantId)
    .input('actor',sql.UniqueIdentifier,actorId)
    .input('property',sql.UniqueIdentifier,propertyId)
    .input('account',sql.VarChar(100),BILLING_ACCOUNT)
    .input('price',sql.VarChar(100),BILLING_PRICE)
    .input('slug',sql.NVarChar(200),'r5-customer-rollback-'+tenantId)
    .input('email',sql.NVarChar(320),'r5-customer-'+tenantId+'@example.invalid');
  const rows=await fixture.query(`
    INSERT INTO dbo.tenants(id,name,slug,status,[plan])
      VALUES(@tenant,'R5 customer recovery rollback-only fixture',@slug,'active','development-testing');
    INSERT INTO dbo.app_users(id,tenant_id,name,email,role,user_type,status)
      VALUES(@actor,@tenant,'Synthetic recovery fixture admin',@email,'admin','admin','active');
    INSERT INTO dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default)
      VALUES(@tenant,@actor,'admin','active',1);
    INSERT INTO dbo.properties(id,tenant_id,name,status,propertytype,country_code,createdat,updatedat)
      VALUES(@property,@tenant,'Synthetic customer recovery dwelling','available','residential','LK',SYSUTCDATETIME(),SYSUTCDATETIME());
    INSERT INTO dbo.management_billing_accounts
      (tenant_id,stripe_account_id,stripe_price_id,market,inventory_json,subscription_status)
      VALUES(@tenant,@account,@price,'LK','[]','pending');
    SELECT
      (SELECT COUNT(*) FROM dbo.tenants WHERE id=@tenant) AS tenant_count,
      (SELECT COUNT(*) FROM dbo.app_users WHERE id=@actor AND tenant_id=@tenant) AS actor_count,
      (SELECT COUNT(*) FROM dbo.tenant_memberships WHERE app_user_id=@actor AND tenant_id=@tenant) AS membership_count,
      (SELECT COUNT(*) FROM dbo.properties WHERE id=@property AND tenant_id=@tenant AND country_code='LK') AS property_count,
      (SELECT COUNT(*) FROM dbo.public_listing_preferences WHERE property_id=@property AND tenant_id=@tenant AND country_code='LK') AS preference_count,
      (SELECT COUNT(*) FROM dbo.management_billing_accounts WHERE tenant_id=@tenant AND stripe_customer_id IS NULL AND stripe_subscription_id IS NULL) AS unsubscribed_count;
  `);
  const counts=rows.recordset[0];
  for(const [name,value] of Object.entries(counts)){assert.equal(value,1,'Fixture contract failed: '+name);}
  await tx.rollback();tx=null;
  const after=await pool.request()
    .input('tenant',sql.UniqueIdentifier,tenantId)
    .input('actor',sql.UniqueIdentifier,actorId)
    .input('property',sql.UniqueIdentifier,propertyId)
    .query(`SELECT
      (SELECT COUNT(*) FROM dbo.tenants WHERE id=@tenant) AS tenants,
      (SELECT COUNT(*) FROM dbo.app_users WHERE id=@actor) AS users,
      (SELECT COUNT(*) FROM dbo.tenant_memberships WHERE app_user_id=@actor) AS memberships,
      (SELECT COUNT(*) FROM dbo.properties WHERE id=@property) AS properties,
      (SELECT COUNT(*) FROM dbo.public_listing_preferences WHERE property_id=@property) AS preferences,
      (SELECT COUNT(*) FROM dbo.management_billing_accounts WHERE tenant_id=@tenant) AS accounts`);
  for(const [name,value] of Object.entries(after.recordset[0])){assert.equal(value,0,'Rollback left row: '+name);}
  const scopeAfter=await pool.request().input('scope',sql.UniqueIdentifier,scopes[0])
    .query('SELECT stripe_customer_id,stripe_subscription_id,subscription_status,quantity FROM dbo.management_billing_accounts WHERE tenant_id=@scope');
  assert.equal(JSON.stringify(scopeAfter.recordset[0]),baseline);
  result.rolledBack=true;
  result.syntheticChecks=Object.keys(counts).length;
  result.rollbackChecks=Object.keys(after.recordset[0]).length;
  result.existingScopePreserved=true;
  result.fixtureId=tenantId;
  console.log('R5_CUSTOMER_FIXTURE_PASS='+JSON.stringify(result));
} catch(error){
  if(tx){try{await tx.rollback();}catch(rollbackError){console.error('R5_CUSTOMER_ROLLBACK_FAILED='+String(rollbackError.code||rollbackError.message));}}
  console.error('R5_CUSTOMER_FIXTURE_FAILED='+JSON.stringify({stage:'rollback_fixture',code:error.code||'ASSERTION_FAILED',message:error.message}));
  process.exitCode=1;
} finally {await closeMssqlPool();}
