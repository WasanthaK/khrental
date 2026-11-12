// Read-only reconciliation of BL08.11-A's first genuine sandbox attempt.
// No Stripe provider writes; no SQL INSERT/UPDATE/DELETE or app configuration changes.
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';
import {BILLING_ACCOUNT} from '/app/src/api/managementBilling/contract.js';

const store=createBillingStore();
const marker='BL08.11-A-20261112';
let stage='preflight';
const main=async()=>{
  const allowed=process.env.MANAGEMENT_BILLING_SANDBOX_ENABLED==='true'&&
    process.env.MANAGEMENT_RECOVERY_SCHEMA_READY==='true'&&
    process.env.STRIPE_SANDBOX_ACCOUNT_ID===BILLING_ACCOUNT;
  if(!allowed){throw Object.assign(new Error('Sandbox configuration mismatch'),{code:'R5_SANDBOX_NOT_READY'});}
  const scopes=String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(scopes.length!==1){throw Object.assign(new Error('Worker scope not singular'),{code:'R5_WORKER_SCOPE_UNEXPECTED'});}
  const original=await store.read('SELECT stripe_customer_id,stripe_subscription_id,subscription_status FROM dbo.management_billing_accounts WHERE tenant_id=@tenant',{tenant:scopes[0]});
  if(original.length!==1){throw Object.assign(new Error('Original billing account not found'),{code:'R5_ORIGINAL_MISSING'});}
  stage='inspect_fixture_tenants';
  const fixtures=await store.read("SELECT id,status FROM dbo.tenants WHERE slug LIKE 'r5-customer-recovery-%'");
  if(fixtures.length>8){throw Object.assign(new Error('Too many synthetic fixtures'),{code:'R5_FIXTURE_SET_TOO_LARGE'});}
  const rows=[];
  for(const fixture of fixtures){
    const id=fixture.id;
    const billing=await store.read('SELECT stripe_customer_id,stripe_subscription_id FROM dbo.management_billing_accounts WHERE tenant_id=@tenant',{tenant:id});
    const commands=await store.read("SELECT c.id,c.kind,c.status,r.state,r.attempts,r.last_error,r.lease_until,r.next_attempt_at FROM dbo.management_billing_commands c LEFT JOIN dbo.management_billing_recovery r ON r.command_id=c.id WHERE c.tenant_id=@tenant",{tenant:id});
    const steps=await store.read("SELECT s.name,s.idempotency_key,s.completed_at,s.result_json FROM dbo.management_billing_steps s JOIN dbo.management_billing_commands c ON c.id=s.command_id WHERE c.tenant_id=@tenant",{tenant:id});
    const counts=await store.read("SELECT (SELECT COUNT(*) FROM dbo.app_users WHERE tenant_id=@tenant) AS users,(SELECT COUNT(*) FROM dbo.tenant_memberships WHERE tenant_id=@tenant) AS members,(SELECT COUNT(*) FROM dbo.properties WHERE tenant_id=@tenant) AS properties,(SELECT COUNT(*) FROM dbo.public_listing_preferences WHERE tenant_id=@tenant) AS preferences,(SELECT COUNT(*) FROM dbo.management_billing_audit WHERE tenant_id=@tenant) AS audits",{tenant:id});
    rows.push({tenantId:id,status:fixture.status,hasBilling:billing.length===1,
      hasCustomerBinding:Boolean(billing[0]?.stripe_customer_id),hasSubscription:Boolean(billing[0]?.stripe_subscription_id),
      ...counts[0],commands:commands.map(c=>({id:c.id,kind:c.kind,status:c.status,recoveryState:c.state||null,attempts:c.attempts||0,lastError:c.last_error||null,
        leased:Boolean(c.lease_until&&new Date(c.lease_until)>new Date()),due:c.next_attempt_at?new Date(c.next_attempt_at).toISOString():null})),
      steps:steps.map(s=>({name:s.name,hasIdempotencyKey:Boolean(s.idempotency_key),completed:Boolean(s.completed_at),
        hasProviderResult:Boolean(s.result_json)}))});
  }
  stage='inspect_one_time_receipt';
  const receipt=await store.read("SELECT resource_id FROM dbo.management_billing_audit WHERE action='sandbox.customer_recovery.tested' AND resource_id=@marker",{marker});
  console.log('R5_CUSTOMER_RUN_READONLY='+JSON.stringify({
    inspectOnly:true,fixtureCount:fixtures.length,fixtures:rows,
    originalScopeSingle:scopes.length===1,
    originalAccountPresent:original.length===1,
    originalSubscriptionPresent:Boolean(original[0].stripe_subscription_id),
    originalCustomerPresent:Boolean(original[0].stripe_customer_id),
    oneTimeReceiptCount:receipt.length,
    noStripeWrite:true,noSqlWrite:true,workerScopeChanged:false
  }));
};
try{await main();}
catch(error){console.error('R5_CUSTOMER_RUN_READONLY_FAILED='+JSON.stringify({stage,code:error.code||'READONLY_INSPECTION_FAILED'}));process.exitCode=1;}
finally{await closeMssqlPool();}
