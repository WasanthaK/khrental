// BL08.11-A: execute only via reviewed main-only sandbox acceptance workflow.
// Exactly one real Stripe sandbox customer POST, with a deliberate lost response.
// The checkout-session POST is prohibited. No worker scope or live configuration changes.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createBillingService} from '/app/src/api/managementBilling/service.js';
import {createStripeClient} from '/app/src/api/managementBilling/stripe.js';
import {requestObjectEvidence} from '/app/src/api/managementBilling/recoveryEvidence.js';
import {BILLING_ACCOUNT,hash} from '/app/src/api/managementBilling/contract.js';
import {getMssqlPool,closeMssqlPool,sql} from '/app/src/api/mssql/pool.js';

const store=createBillingStore(),stripe=createStripeClient();
const tenantId=randomUUID(),actorId=randomUUID(),propertyId=randomUUID(),operationId=randomUUID();
const marker='BL08.11-A-20261112';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let stage='preflight',fixtureCreated=false,customerId=null,customerDeleted=false;
let customerWrites=0,checkoutWrites=0,checkoutBlocked=0,eventId=null,fixtureCleaned=false;
let originalTenant=null,originalAccountHash=null,scopedTenant=null;

async function createFixture(priceId) {
  stage='create_disposable_fixture';
  const tx=new sql.Transaction(await getMssqlPool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const q=new sql.Request(tx).input('tenant',sql.UniqueIdentifier,tenantId)
      .input('actor',sql.UniqueIdentifier,actorId).input('property',sql.UniqueIdentifier,propertyId)
      .input('account',sql.VarChar(100),BILLING_ACCOUNT).input('price',sql.VarChar(100),priceId)
      .input('slug',sql.NVarChar(200),'r5-customer-recovery-'+tenantId)
      .input('email',sql.NVarChar(320),'r5-customer-'+tenantId+'@example.invalid');
    const rows=await q.query("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@tenant,'BL08.11-A isolated customer recovery fixture',@slug,'active','development-testing');"+
      "INSERT dbo.app_users(id,tenant_id,name,email,role,user_type,status) VALUES(@actor,@tenant,'BL08.11-A synthetic admin',@email,'admin','admin','active');"+
      "INSERT dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@tenant,@actor,'admin','active',1);"+
      "INSERT dbo.properties(id,tenant_id,name,status,propertytype,country_code,createdat,updatedat) VALUES(@property,@tenant,'BL08.11-A unpublished test stock','available','residential','LK',SYSUTCDATETIME(),SYSUTCDATETIME());"+
      "UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME() WHERE property_id=@property AND tenant_id=@tenant;"+
      "INSERT dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,market,inventory_json,subscription_status) VALUES(@tenant,@account,@price,'LK','[]','pending');"+
      "SELECT (SELECT COUNT(*) FROM dbo.tenants WHERE id=@tenant AND [plan]='development-testing') AS tenant_count,"+
      "(SELECT COUNT(*) FROM dbo.app_users WHERE id=@actor AND tenant_id=@tenant) AS actor_count,"+
      "(SELECT COUNT(*) FROM dbo.tenant_memberships WHERE app_user_id=@actor AND tenant_id=@tenant AND role='admin') AS membership_count,"+
      "(SELECT COUNT(*) FROM dbo.properties WHERE id=@property AND tenant_id=@tenant AND country_code='LK') AS property_count,"+
      "(SELECT COUNT(*) FROM dbo.public_listing_preferences WHERE property_id=@property AND tenant_id=@tenant AND opted_out=1) AS private_count,"+
      "(SELECT COUNT(*) FROM dbo.management_billing_accounts WHERE tenant_id=@tenant AND stripe_customer_id IS NULL AND stripe_subscription_id IS NULL) AS unsubscribed_count;");
    assert.equal(Object.keys(rows.recordset[0]).length,6);
    for(const count of Object.values(rows.recordset[0])){assert.equal(count,1);}
    await tx.commit();
    fixtureCreated=true;
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
}
async function cleanupFixture() {
  stage='cleanup_sql_fixture';
  const tx=new sql.Transaction(await getMssqlPool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const q=new sql.Request(tx).input('tenant',sql.UniqueIdentifier,tenantId)
      .input('actor',sql.UniqueIdentifier,actorId).input('property',sql.UniqueIdentifier,propertyId)
      .input('op',sql.UniqueIdentifier,operationId);
    const result=await q.query("IF EXISTS(SELECT 1 FROM dbo.management_billing_accounts WHERE tenant_id=@tenant AND (stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL)) THROW 51018,'Fixture account must remain unsubscribed and unbound',1;"+
      "IF EXISTS(SELECT 1 FROM dbo.management_billing_commands WHERE tenant_id=@tenant AND id<>@op) THROW 51019,'Foreign command on fixture tenant',1;"+
      "DELETE dbo.management_billing_steps WHERE command_id=@op;"+
      "DELETE dbo.management_billing_recovery WHERE command_id=@op;"+
      "DELETE dbo.management_billing_commands WHERE tenant_id=@tenant AND id=@op;"+
      "DELETE dbo.management_billing_audit WHERE tenant_id=@tenant;"+
      "DELETE dbo.management_billing_accounts WHERE tenant_id=@tenant;"+
      "DELETE dbo.public_listing_preferences WHERE property_id=@property AND tenant_id=@tenant;"+
      "DELETE dbo.properties WHERE id=@property AND tenant_id=@tenant;"+
      "DELETE dbo.tenant_memberships WHERE tenant_id=@tenant AND app_user_id=@actor;"+
      "DELETE dbo.app_users WHERE id=@actor AND tenant_id=@tenant;"+
      "DELETE dbo.tenants WHERE id=@tenant;"+
      "SELECT (SELECT COUNT(*) FROM dbo.tenants WHERE id=@tenant) AS tenants,"+
      "(SELECT COUNT(*) FROM dbo.app_users WHERE id=@actor) AS users,"+
      "(SELECT COUNT(*) FROM dbo.tenant_memberships WHERE app_user_id=@actor) AS memberships,"+
      "(SELECT COUNT(*) FROM dbo.properties WHERE id=@property) AS properties,"+
      "(SELECT COUNT(*) FROM dbo.public_listing_preferences WHERE property_id=@property) AS preferences,"+
      "(SELECT COUNT(*) FROM dbo.management_billing_accounts WHERE tenant_id=@tenant) AS accounts,"+
      "(SELECT COUNT(*) FROM dbo.management_billing_commands WHERE id=@op) AS commands,"+
      "(SELECT COUNT(*) FROM dbo.management_billing_recovery WHERE command_id=@op) AS recovery,"+
      "(SELECT COUNT(*) FROM dbo.management_billing_steps WHERE command_id=@op) AS steps;");
    assert.equal(Object.keys(result.recordset[0]).length,9);
    for(const value of Object.values(result.recordset[0])){assert.equal(value,0);}
    await tx.commit();fixtureCleaned=true;
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
}
async function main() {
  for(const flag of ['MANAGEMENT_BILLING_SANDBOX_ENABLED','MANAGEMENT_RECOVERY_SCHEMA_READY','MANAGEMENT_RECOVERY_WORKER_ENABLED']){
    assert.equal(process.env[flag],'true');
  }
  assert.match(process.env.STRIPE_SANDBOX_SECRET_KEY||'',/^(sk|rk)_test_/);
  assert.equal(process.env.STRIPE_SANDBOX_ACCOUNT_ID,BILLING_ACCOUNT);
  const scopes=String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS||'').split(',').map(v=>v.trim()).filter(Boolean);
  assert.equal(scopes.length,1,'Existing recovery worker must remain scoped to one approved organization');
  scopedTenant=scopes[0];
  assert.notEqual(scopedTenant.toLowerCase(),tenantId.toLowerCase());
  const oldRows=await store.read("SELECT a.* FROM dbo.management_billing_accounts a JOIN dbo.tenants t ON t.id=a.tenant_id WHERE a.tenant_id=@tenant AND t.status='active' AND t.[plan]='development-testing'",{tenant:scopedTenant});
  assert.equal(oldRows.length,1);originalTenant=oldRows[0];
  assert.ok(originalTenant.stripe_customer_id&&originalTenant.stripe_subscription_id);
  originalAccountHash=hash(originalTenant);
  assert.equal((await store.read("SELECT id FROM dbo.management_billing_commands WHERE tenant_id=@tenant AND status='pending'",{tenant:scopedTenant})).length,0);
  assert.equal((await store.read("SELECT id FROM dbo.tenants WHERE slug LIKE 'r5-customer-recovery-%' AND status='active'")).length,0,
    'Unreconciled disposable recovery fixture already exists');
  assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE action='sandbox.customer_recovery.tested' AND resource_id=@marker",{marker})).length,0,
    'This evidence checkpoint already succeeded; never replay an accepted provider write');
  await stripe.assertAccount();
  const price=await stripe.request('GET','/v1/prices/'+originalTenant.stripe_price_id);
  assert.equal(price.id,originalTenant.stripe_price_id);
  assert.equal(price.livemode,false);assert.equal(price.active,true);
  await createFixture(price.id);
  assert.equal((await store.inventory(tenantId)).length,1);
  const inventoryHash=hash(await store.inventory(tenantId,undefined,{includePending:true}));
  let expectedKey='quixo:'+tenantId+':'+operationId+':customer';
  const interrupted={...stripe,request:async(method,path,body,key)=>{
    if(method==='GET'){return stripe.request(method,path,body,key);}
    assert.equal(method,'POST');assert.equal(path,'/v1/customers');
    assert.equal(++customerWrites,1);
    assert.equal(String(key).toLowerCase(),expectedKey.toLowerCase());
    // SQL may return uppercase UUIDs. Stripe keys are case-sensitive: retain
    // the exact key actually sent for event correlation and duplicate checks.
    expectedKey=String(key);
    assert.equal(body.metadata.quixo_operation.toLowerCase(),operationId.toLowerCase());
    assert.equal(body.metadata.quixo_tenant.toLowerCase(),tenantId.toLowerCase());
    const response=await stripe.request(method,path,body,key);
    assert.equal(response.livemode,false);
    assert.match(response.id,/^cus_[a-zA-Z0-9]+$/);
    customerId=response.id;
    assert.equal(response.metadata.quixo_operation.toLowerCase(),operationId.toLowerCase());
    throw Object.assign(new Error('Controlled response loss after genuine sandbox customer creation'),{status:503,code:'STRIPE_UNAVAILABLE'});
  }};
  stage='single_customer_post_with_response_loss';
  const service=createBillingService({store,stripe:interrupted});
  await assert.rejects(service.checkout({tenantId,actorId,id:operationId,inventoryHash}),e=>e.code==='STRIPE_UNAVAILABLE');
  assert.equal(customerWrites,1);assert.ok(customerId);
  const commandRows=await store.read("SELECT c.status,c.created_at,r.state,r.attempts,r.last_error,r.next_attempt_at FROM dbo.management_billing_commands c JOIN dbo.management_billing_recovery r ON r.command_id=c.id WHERE c.tenant_id=@tenant AND c.id=@op",{tenant:tenantId,op:operationId});
  assert.equal(commandRows.length,1);
  const pending=commandRows[0];
  assert.equal(pending.status,'pending');assert.equal(pending.state,'pending');
  assert.equal(pending.attempts,1);assert.equal(pending.last_error,'STRIPE_UNAVAILABLE');
  stage='stripe_customer_event_readback';
  let proof=null;
  for(let n=0;n<24;n++){
    proof=await requestObjectEvidence({stripe,type:'customer.created',key:expectedKey,since:pending.created_at,
      matches:value=>value.metadata?.quixo_operation?.toLowerCase()===operationId.toLowerCase()&&
        value.metadata?.quixo_tenant?.toLowerCase()===tenantId.toLowerCase()});
    if(proof){break;}
    await sleep(5000);
  }
  assert.ok(proof,'Stripe customer.created matching the original idempotency key was not found');
  assert.equal(proof.object.id,customerId);eventId=proof.eventId;
  const originalCustomer=await stripe.request('GET','/v1/customers/'+customerId);
  assert.equal(originalCustomer.id,customerId);assert.equal(originalCustomer.livemode,false);
  stage='bounded_one_shot_customer_step_recovery';
  let due=false;
  for(let n=0;n<24;n++){
    const q=(await store.read("SELECT CASE WHEN next_attempt_at<=SYSUTCDATETIME() AND lease_until IS NULL THEN 1 ELSE 0 END AS due FROM dbo.management_billing_recovery WHERE command_id=@op",{op:operationId}))[0];
    assert.ok(q);
    if(q.due===1){due=true;break;}
    await sleep(5000);
  }
  assert.ok(due,'Retry backoff did not expire');
  const readbackOnly={...stripe,request:async(method,path,body,key)=>{
    if(method==='GET'){return stripe.request(method,path,body,key);}
    assert.equal(method,'POST');
    if(path==='/v1/checkout/sessions'){
      checkoutBlocked++;
      throw Object.assign(new Error('The customer-only acceptance boundary prohibits checkout'),{status:503,code:'R5_CHECKOUT_BLOCKED'});
    }
    throw Object.assign(new Error('Customer create replay prohibited'),{status:503,code:'R5_CUSTOMER_REPLAY_BLOCKED'});
  }};
  const recovered=createBillingService({store,stripe:readbackOnly});
  await assert.rejects(recovered.recoverOperation({tenantId,id:operationId}),e=>e.code==='R5_CHECKOUT_BLOCKED');
  assert.equal(checkoutBlocked,1);assert.equal(customerWrites,1);assert.equal(checkoutWrites,0);
  const steps=await store.read("SELECT name,idempotency_key,completed_at,result_json FROM dbo.management_billing_steps WHERE command_id=@op ORDER BY name",{op:operationId});
  assert.equal(steps.length,2);
  const customerStep=steps.find(s=>s.name==='create_customer'),checkoutStep=steps.find(s=>s.name==='create_checkout');
  assert.ok(customerStep?.completed_at);
  assert.equal(customerStep.idempotency_key.toLowerCase(),expectedKey.toLowerCase());
  const stepResult=JSON.parse(customerStep.result_json);
  assert.equal(stepResult.customerId,customerId);assert.equal(stepResult.eventId,eventId);
  assert.ok(checkoutStep);assert.equal(checkoutStep.completed_at,null);
  const commandAfter=(await store.read("SELECT c.status,r.state,r.attempts,r.last_error FROM dbo.management_billing_commands c JOIN dbo.management_billing_recovery r ON r.command_id=c.id WHERE c.id=@op",{op:operationId}))[0];
  assert.equal(commandAfter.status,'pending');assert.equal(commandAfter.state,'pending');
  assert.equal(commandAfter.attempts,2);assert.equal(commandAfter.last_error,'R5_CHECKOUT_BLOCKED');
  stage='provider_no_duplicate_and_no_checkout';
  const createdEvents=[];let cursor,exhausted=false;
  for(let n=0;n<10;n++){
    const page=await stripe.request('GET','/v1/events',{type:'customer.created',
      created:{gte:Math.floor(new Date(pending.created_at).getTime()/1000)-60},limit:100,...(cursor?{starting_after:cursor}:{})});
    assert.ok(Array.isArray(page.data));assert.equal(typeof page.has_more,'boolean');
    for(const event of page.data){
      if(event.request?.idempotency_key===expectedKey&&event.data.object?.metadata?.quixo_operation?.toLowerCase()===operationId.toLowerCase()){
        createdEvents.push(event.id);
      }
    }
    if(!page.has_more){exhausted=true;break;}
    cursor=page.data.at(-1)?.id;assert.ok(cursor);
  }
  assert.ok(exhausted);assert.deepEqual(createdEvents,[eventId]);
  const sessions=await stripe.request('GET','/v1/checkout/sessions',{customer:customerId,limit:100});
  assert.deepEqual(sessions.data,[]);assert.equal(sessions.has_more,false);
  const subscriptions=await stripe.request('GET','/v1/subscriptions',{customer:customerId,limit:100});
  assert.deepEqual(subscriptions.data,[]);assert.equal(subscriptions.has_more,false);
  assert.equal(hash(await store.account(scopedTenant)),originalAccountHash);
  assert.equal(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).trim().toLowerCase(),scopedTenant.toLowerCase());
  stage='delete_single_disposable_stripe_customer';
  const deleted=await stripe.request('DELETE','/v1/customers/'+customerId,{},'quixo:'+tenantId+':'+operationId+':cleanup');
  assert.equal(deleted.id,customerId);assert.equal(deleted.deleted,true);customerDeleted=true;
  await cleanupFixture();
  assert.equal(hash(await store.account(scopedTenant)),originalAccountHash);
  stage='record_one_time_test_completion';
  await store.locked('r5-customer-recovery-test',async q=>{
    await store.audit(q,{action:'sandbox.customer_recovery.tested',resourceId:marker,
      current:{operationId,eventId,customerId,providerWrites:1,step:'create_customer',fixtureCleaned:true},
      reason:'BL08.11-A: genuine Stripe test customer creation, controlled response loss, provider event readback, original step checkpoint, zero checkout, and cleanup.'});
  });
  console.log('R5_GENUINE_CUSTOMER_RECOVERY_PASS='+JSON.stringify({
    operationId,customerId,eventId,sandbox:true,providerWrites:customerWrites,
    responseDiscarded:true,customerStepCompleted:true,recoveredByProviderEvidence:true,
    originalIdempotencyKeyPreserved:true,matchingCustomerEvents:createdEvents.length,
    checkoutSessionPosts:checkoutWrites,checkoutPostBlocked:checkoutBlocked,
    subscriptionsCreated:0,originalScopedAccountUnchanged:true,customerDeleted,
    fixtureCleaned,automaticWorkerRetargeted:false,liveChargingEnabled:false
  }));
}
try{await main();}
catch(error){
  // Only auto-clean if no Stripe customer write was attempted, or the exact
  // created customer has already been confirmed deleted. An ambiguous write
  // must retain its durable journal for manual reconciliation.
  const failedStage=stage;
  if(fixtureCreated&&!fixtureCleaned&&(customerWrites===0||customerDeleted)){
    try{await cleanupFixture();}catch(cleanupError){
      console.error('R5_GENUINE_CUSTOMER_CLEANUP_FAILED='+JSON.stringify({
        code:cleanupError.code||'CLEANUP_UNCONFIRMED',operationId,tenantId
      }));
    }
  }
  const code=/^[A-Z0-9_]{3,80}$/.test(error.code||'')?error.code:'UNCONFIRMED';
  console.error('R5_GENUINE_CUSTOMER_RECOVERY_FAILED='+JSON.stringify({
    stage:failedStage,code,operationId,tenantId,customerId,customerWrites,checkoutWrites,
    fixtureCreated,customerDeleted,fixtureCleaned,fixtureRetained:fixtureCreated&&!fixtureCleaned,
    safety:'No checkout POST or live subscription permitted; retained fixture requires reconciliation before retry'
  }));
  process.exitCode=1;
}finally{await closeMssqlPool();}
