// BL08.11: one unpaid sandbox Checkout response-loss proof, or read-only
// inspection / bounded cleanup of that same fixture. Never replay verification.
// Imports deliberately use the unchanged serving image's implementation.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createBillingService} from '/app/src/api/managementBilling/service.js';
import {createStripeClient,objectId} from '/app/src/api/managementBilling/stripe.js';
import {requestObjectEvidence} from '/app/src/api/managementBilling/recoveryEvidence.js';
import {BILLING_ACCOUNT,BILLING_PRICE,entitlement,hash,stagedStock} from '/app/src/api/managementBilling/contract.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const operation=process.env.CHECKOUT_RECOVERY_OPERATION;
const mode=process.env.CHECKOUT_RECOVERY_MODE;
const confirmations={verify:'VERIFY-CHECKOUT-RECOVERY',inspect:'INSPECT-CHECKOUT-RECOVERY',cleanup:'CLEANUP-CHECKOUT-RECOVERY'};
const protectedIds=['80a4b392-13f8-484d-81fa-a110a6ef75f0','2383f4fc-e107-4ac7-9e13-39db501f40ec'];
const originalScope=process.env.MANAGEMENT_RECOVERY_TENANT_IDS;
// This copy only enables verified staging reads/writes in this process. It does
// not activate a serving feature, change process.env, or retarget the worker.
const env={...process.env,MANAGEMENT_INVENTORY_SCHEMA_READY:'true'};
const store=createBillingStore({env}),stripe=createStripeClient();
const fixtureName='R5 private Checkout response-loss acceptance';
const fixtureAction='sandbox.checkout_recovery.fixture';
const cleanupAction='sandbox.checkout_recovery.cleaned';
const checks=[];
let stage='input',fixtureCreated=false,fixtureObserved=false,cleanupVerified=false,cleanupAttempted=false;
let baseline=null,origin=null,customerId=null,sessionId=null,customerEventId=null;
let customerKey=null,checkoutKey=null,customerPosts=0,checkoutPosts=0,recoveryProviderWrites=0,cleanupPosts=0;
let responseDiscarded=false,expiryResponseRecovered=false;
const lower=value=>String(value).toLowerCase();
const emit=(name,value)=>console.log(name+'='+JSON.stringify({operation,mode,...value}));
const progress=name=>{
  stage=name;
  emit('CHECKOUT_RECOVERY_PROGRESS',{stage,fixtureCreated,customerId,sessionId,customerPosts,checkoutPosts,recoveryProviderWrites,cleanupPosts});
};
const check=name=>{checks.push(name);emit('CHECKOUT_RECOVERY_CHECK',{name});};
const fail=code=>Object.assign(new Error(code),{code,status:503});
const read=(path,params)=>stripe.request('GET',path,params);
const fixtureStamp=actorId=>({version:1,operation,actorId:lower(actorId),stockId:operation});
const stockRecord=()=>({kind:'property',payload:{id:operation,name:'Private unpaid Checkout recovery stock',
  propertytype:'house',country_code:'LK',availability:'inactive',rentalvalues:{listingCategory:'residential'}}});

async function listAll(path,params={}) {
  const found=[],seen=new Set(),cursors=new Set();let cursor;
  for(let pageNumber=0;pageNumber<10;pageNumber++){
    const page=await read(path,{...params,limit:100,...(cursor?{starting_after:cursor}:{})});
    assert.ok(Array.isArray(page.data));assert.equal(typeof page.has_more,'boolean');
    for(const item of page.data){
      assert.equal(typeof item.id,'string');assert.ok(!seen.has(item.id));
      assert.notEqual(item.livemode,true);seen.add(item.id);found.push(item);
    }
    if(!page.has_more){return found;}
    cursor=page.data.at(-1)?.id;
    if(!cursor||cursors.has(cursor)){throw fail('CHECKOUT_LISTING_UNCONFIRMED');}
    cursors.add(cursor);
  }
  throw fail('CHECKOUT_LISTING_UNEXHAUSTED');
}

async function protectedState() {
  const result=[];
  for(const id of protectedIds){
    const account=await store.account(id);assert.ok(account?.stripe_subscription_id);
    const subscription=await read('/v1/subscriptions/'+account.stripe_subscription_id);
    assert.equal(subscription.livemode,false);assert.equal(objectId(subscription.customer),account.stripe_customer_id);
    const clockId=objectId(subscription.test_clock);
    const clock=clockId?await read('/v1/test_helpers/test_clocks/'+clockId):null;
    if(clock){assert.equal(clock.id,clockId);assert.equal(clock.livemode,false);}
    result.push({tenant:id,account:hash(account),subscription:hash(subscription),
      clock:clock?hash({id:clock.id,status:clock.status,frozen_time:clock.frozen_time}):null});
  }
  return result;
}

async function verifyProtected() {
  assert.equal(process.env.MANAGEMENT_RECOVERY_TENANT_IDS,originalScope);
  assert.equal(env.MANAGEMENT_RECOVERY_TENANT_IDS,originalScope);
  assert.deepEqual(await protectedState(),baseline);
}

async function preflight() {
  assert.match(operation||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.ok(Object.hasOwn(confirmations,mode));
  assert.equal(process.env.CHECKOUT_RECOVERY_CONFIRMATION,confirmations[mode]);
  assert.ok(!protectedIds.includes(operation));
  for(const flag of ['MANAGEMENT_BILLING_SANDBOX_ENABLED','MANAGEMENT_BILLING_SCHEMA_READY','MANAGEMENT_RECOVERY_SCHEMA_READY','MANAGEMENT_RECOVERY_WORKER_ENABLED']){
    assert.equal(process.env[flag],'true');
  }
  assert.notEqual(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED,'true');
  assert.match(process.env.STRIPE_SANDBOX_SECRET_KEY||'',/^(sk|rk)_test_/);
  assert.equal(process.env.STRIPE_SANDBOX_ACCOUNT_ID,BILLING_ACCOUNT);
  const scopes=String(originalScope||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  assert.deepEqual(scopes,[protectedIds[0]]);
  const configuredOrigin=new URL(env.PUBLIC_APP_URL||env.PASSWORD_RESET_BASE_URL);
  assert.equal(configuredOrigin.href,'https://app.quixo.homes/');origin=configuredOrigin.origin;
  for(const table of ['management_billing_accounts','management_billing_commands','management_billing_recovery',
    'management_billing_steps','management_billing_audit','management_inventory_staging']){
    assert.ok((await store.read('SELECT OBJECT_ID(@name) AS id',{name:'dbo.'+table}))[0]?.id);
  }
  await stripe.assertAccount();
  const price=await createBillingService({store,stripe,env}).price(BILLING_PRICE);
  assert.equal(price.unit_amount,500);
  baseline=await protectedState();
}

async function createFixture() {
  const actorId=randomUUID();
  await store.locked('r5-checkout-recovery-fixtures',async q=>{
    assert.equal((await q('SELECT id FROM dbo.tenants WHERE id=@operation',{operation})).length,0,'Never reuse a fixture UUID');
    assert.equal((await q('SELECT id FROM dbo.management_billing_commands WHERE id=@operation',{operation})).length,0);
    const unresolved=await q(`SELECT t.id FROM dbo.tenants t WHERE t.slug LIKE 'r5-checkout-recovery-%'
      AND (t.status='active' OR NOT EXISTS(SELECT 1 FROM dbo.management_billing_audit a WHERE a.tenant_id=t.id
        AND a.action=@action AND LOWER(a.resource_id)=LOWER(CONVERT(VARCHAR(36),t.id))))`,{action:cleanupAction});
    assert.equal(unresolved.length,0,'Inspect and clean the earlier fixture before creating another');
    await q("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@operation,@name,@slug,'active','development-testing')",
      {operation,name:fixtureName,slug:'r5-checkout-recovery-'+operation});
    await q("INSERT dbo.app_users(id,tenant_id,name,email,role,user_type,status) VALUES(@actorId,@operation,'Synthetic non-login Checkout actor',@email,'admin','admin','active')",
      {actorId,operation,email:'r5-checkout-recovery-'+operation+'@example.invalid'});
    await q("INSERT dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@operation,@actorId,'admin','active',1)",{operation,actorId});
    await q("INSERT dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,market,inventory_json,subscription_status) VALUES(@operation,@account,@price,'LK','[]','pending')",
      {operation,account:BILLING_ACCOUNT,price:BILLING_PRICE});
    await store.audit(q,{tenantId:operation,actorId,action:fixtureAction,resourceId:operation,
      current:fixtureStamp(actorId),reason:'Version 1 isolated unpaid Checkout recovery fixture; no credentials or consent created.'});
  });
  fixtureCreated=true;progress('prepare_private_stock');
  await store.stageStock({tenantId:operation,actorId,records:[stockRecord()],
    reason:'Prepare one private unpaid dwelling solely for the bounded Checkout response-loss proof.'});
  return actorId;
}

async function loadFixture() {
  const tenants=await store.read('SELECT id,name,slug,status,[plan] FROM dbo.tenants WHERE id=@operation',{operation});
  assert.equal(tenants.length,1,'Fixture does not exist; inspect and cleanup never create it');
  const tenant=tenants[0];assert.equal(tenant.name,fixtureName);
  assert.equal(tenant.slug,'r5-checkout-recovery-'+operation);assert.equal(tenant.plan,'development-testing');
  assert.ok(['active','inactive'].includes(tenant.status));
  fixtureObserved=true;
  const actors=await store.read('SELECT id,tenant_id,email,role,user_type,status,auth_id FROM dbo.app_users WHERE tenant_id=@operation',{operation});
  assert.equal(actors.length,1);const actor=actors[0];
  assert.equal(actor.email,'r5-checkout-recovery-'+operation+'@example.invalid');
  assert.equal(actor.role,'admin');assert.equal(actor.user_type,'admin');assert.equal(actor.auth_id,null);
  const memberships=await store.read('SELECT * FROM dbo.tenant_memberships WHERE tenant_id=@operation',{operation});
  assert.equal(memberships.length,1);assert.equal(lower(memberships[0].app_user_id),lower(actor.id));
  assert.equal(memberships[0].role,'admin');assert.equal(memberships[0].status,actor.status);assert.equal(actor.status,tenant.status);
  const account=await store.account(operation);assert.ok(account);
  assert.equal(account.stripe_account_id,BILLING_ACCOUNT);assert.equal(account.stripe_price_id,BILLING_PRICE);
  assert.equal(account.market,'LK');assert.equal(account.stripe_subscription_id,null);
  assert.equal(account.stripe_item_id,null);assert.equal(account.stripe_schedule_id,null);
  assert.equal(account.subscription_status,'pending');assert.equal(account.initial_payment_verified,false);
  assert.equal(account.quantity,0);assert.equal(account.paid_through,null);assert.equal(account.grace_started_at,null);
  assert.equal(account.comp_type,null);assert.equal(account.pending_quantity,null);assert.equal(entitlement(account).management,false);
  const audit=await store.read('SELECT * FROM dbo.management_billing_audit WHERE tenant_id=@operation ORDER BY id',{operation});
  const markers=audit.filter(row=>row.action===fixtureAction);
  assert.equal(markers.length,1);assert.equal(lower(markers[0].resource_id),operation);
  assert.equal(lower(markers[0].actor_id),lower(actor.id));assert.equal(markers[0].current_hash,hash(fixtureStamp(actor.id)));
  const properties=await store.read('SELECT * FROM dbo.properties WHERE tenant_id=@operation',{operation});
  const units=await store.read('SELECT * FROM dbo.property_units WHERE tenant_id=@operation',{operation});
  assert.deepEqual(properties,[]);assert.deepEqual(units,[]);
  const stock=await store.read('SELECT * FROM dbo.management_inventory_staging WHERE tenant_id=@operation ORDER BY id',{operation});
  assert.ok(stock.length<=1);
  if(stock.length){
    const item=stock[0],expected=stagedStock([stockRecord()])[0];
    assert.equal(lower(item.id),operation);assert.equal(item.kind,'property');assert.equal(item.status,'pending');
    assert.equal(lower(item.created_by),lower(actor.id));assert.deepEqual(JSON.parse(item.payload_json),expected.payload);
    assert.equal(item.payload_hash,hash(expected.payload));assert.equal(item.promoted_at,null);
    assert.equal(item.promotion_command_id,null);
  }
  const commands=await store.read('SELECT * FROM dbo.management_billing_commands WHERE tenant_id=@operation ORDER BY id',{operation});
  assert.ok(commands.length<=1);const command=commands[0]||null;
  const recovery=await store.read('SELECT * FROM dbo.management_billing_recovery WHERE command_id=@operation',{operation});
  const steps=await store.read('SELECT * FROM dbo.management_billing_steps WHERE command_id=@operation ORDER BY name',{operation});
  let intent=null;
  if(command){
    assert.equal(lower(command.id),operation);assert.equal(command.kind,'checkout');assert.equal(recovery.length,1);
    assert.equal(lower(recovery[0].actor_id),lower(actor.id));intent=JSON.parse(recovery[0].intent_json);
    assert.equal(intent.customerId,null);assert.equal(intent._subscriptionId,null);assert.equal(intent.priceId,BILLING_PRICE);
    assert.equal(intent.origin,origin);assert.equal(stock.length,1);assert.equal(intent.inventory.length,1);
    assert.deepEqual(intent.inventory,await store.inventory(operation,undefined,{includePending:true}));
    assert.equal(intent.inventoryHash,hash(intent.inventory));
    assert.equal(command.payload_hash,hash({inventoryHash:intent.inventoryHash}));
    assert.deepEqual(JSON.parse(command.payload_json),{inventoryHash:intent.inventoryHash,_subscriptionId:null});
    const key='quixo:'+command.tenant_id+':'+command.id;
    for(const step of steps){
      assert.ok(['create_customer','create_checkout'].includes(step.name));
      const input=JSON.parse(step.input_json);assert.equal(step.input_hash,hash(input));
      assert.equal(step.idempotency_key,key+(step.name==='create_customer'?':customer':':checkout'));
      assert.equal(input.metadata.quixo_operation,command.id);assert.equal(input.metadata.quixo_tenant,command.tenant_id);
      if(step.name==='create_checkout'){
        assert.equal(input.mode,'subscription');assert.equal(input.metadata.inventory_hash,intent.inventoryHash);
        assert.deepEqual(input.line_items,[{price:BILLING_PRICE,quantity:1}]);
        assert.equal(input.success_url,origin+'/dashboard/subscription?checkout=returned');
        assert.equal(input.cancel_url,origin+'/dashboard/subscription?checkout=cancelled');
      }
    }
  }else{assert.deepEqual(recovery,[]);assert.deepEqual(steps,[]);assert.equal(account.stripe_customer_id,null);}
  return {tenant,actor,memberships,account,audit,stock,command,recovery:recovery[0]||null,steps,intent};
}

async function customerEvents(fixture,step) {
  const created=Math.floor(new Date(fixture.command.created_at).getTime()/1000)-60;
  assert.ok(Number.isFinite(created));
  // An old incomplete customer step cannot establish absence from expired event retention.
  if(created*1000<Date.now()-29*86400000&&!step.completed_at){throw fail('CHECKOUT_CUSTOMER_EVIDENCE_TOO_OLD');}
  const events=await listAll('/v1/events',{type:'customer.created',created:{gte:created}});
  return events.filter(event=>event.type==='customer.created'&&event.livemode===false&&
    (!event.account||event.account===BILLING_ACCOUNT)&&event.request?.idempotency_key===step.idempotency_key&&
    event.data?.object?.livemode===false&&event.data.object.metadata?.quixo_operation===fixture.command.id&&
    event.data.object.metadata?.quixo_tenant===fixture.command.tenant_id);
}

async function providerState(fixture) {
  const customerStep=fixture.steps.find(step=>step.name==='create_customer');
  const checkoutStep=fixture.steps.find(step=>step.name==='create_checkout');
  if(!customerStep){
    assert.ok(!checkoutStep);assert.equal(fixture.account.stripe_customer_id,null);
    return {customer:null,session:null,sessions:[],subscriptions:[],invoices:[],paymentIntents:[],charges:[]};
  }
  let savedCustomer;
  if(customerStep.completed_at){savedCustomer=JSON.parse(customerStep.result_json);}
  else{
    const events=await customerEvents(fixture,customerStep);
    if(events.length!==1){throw fail('CHECKOUT_CUSTOMER_EFFECT_UNCONFIRMED');}
    savedCustomer={customerId:events[0].data.object.id,eventId:events[0].id};
  }
  assert.match(savedCustomer.customerId||'',/^cus_[A-Za-z0-9]+$/);
  const customer=await read('/v1/customers/'+savedCustomer.customerId);
  assert.equal(customer.id,savedCustomer.customerId);assert.equal(customer.livemode,false);assert.ok(!customer.deleted);
  assert.equal(customer.metadata?.quixo_operation,fixture.command.id);
  assert.equal(customer.metadata?.quixo_tenant,fixture.command.tenant_id);
  assert.equal(objectId(customer.test_clock)||null,null);assert.ok(!customer.email);
  assert.equal(objectId(customer.invoice_settings?.default_payment_method)||null,null);
  assert.equal(objectId(customer.default_source)||null,null);assert.equal(customer.balance,0);
  if(fixture.account.stripe_customer_id){assert.equal(fixture.account.stripe_customer_id,customer.id);}
  const sessions=await listAll('/v1/checkout/sessions',{customer:customer.id});
  let session=null;
  if(checkoutStep){
    // Even an exhausted empty listing does not license replay or deletion of
    // an ambiguous persisted provider intent. Retain it for later inspection.
    if(sessions.length!==1){throw fail('CHECKOUT_SESSION_EFFECT_UNCONFIRMED');}
    session=await read('/v1/checkout/sessions/'+sessions[0].id);
    assert.equal(session.id,sessions[0].id);assert.equal(session.livemode,false);assert.equal(session.mode,'subscription');
    assert.equal(objectId(session.customer),customer.id);
    assert.equal(session.metadata?.quixo_operation,fixture.command.id);
    assert.equal(session.metadata?.quixo_tenant,fixture.command.tenant_id);
    assert.equal(session.metadata?.inventory_hash,fixture.intent.inventoryHash);
    const input=JSON.parse(checkoutStep.input_json);assert.equal(input.customer,customer.id);
    assert.equal(session.success_url,input.success_url);assert.equal(session.cancel_url,input.cancel_url);
    assert.equal(session.currency,'usd');assert.equal(session.amount_total,500);
    assert.equal(session.payment_status,'unpaid');assert.ok(['open','expired'].includes(session.status));
    for(const field of ['subscription','invoice','payment_intent','setup_intent']){assert.equal(objectId(session[field])||null,null);}
    const lines=await listAll('/v1/checkout/sessions/'+session.id+'/line_items');
    assert.equal(lines.length,1);assert.equal(objectId(lines[0].price),BILLING_PRICE);assert.equal(lines[0].quantity,1);
    if(checkoutStep.completed_at){
      const result=JSON.parse(checkoutStep.result_json);assert.equal(result.sessionId,session.id);assert.equal(result.customerId,customer.id);
    }
  }else{assert.deepEqual(sessions,[]);}
  const subscriptions=await listAll('/v1/subscriptions',{customer:customer.id,status:'all'});
  const invoices=await listAll('/v1/invoices',{customer:customer.id});
  const paymentIntents=await listAll('/v1/payment_intents',{customer:customer.id});
  const charges=await listAll('/v1/charges',{customer:customer.id});
  for(const rows of [subscriptions,invoices,paymentIntents,charges]){assert.deepEqual(rows,[]);}
  return {customer,session,sessions,subscriptions,invoices,paymentIntents,charges};
}

async function waitForCustomerEvent(key,id,createdAt,metadata) {
  for(let attempt=0;attempt<24;attempt++){
    const proof=await requestObjectEvidence({stripe,type:'customer.created',key,since:createdAt,
      matches:value=>value.id===id&&value.metadata?.quixo_operation===metadata.quixo_operation&&value.metadata?.quixo_tenant===metadata.quixo_tenant});
    if(proof){customerEventId=proof.eventId;return;}
    await delay(5000);
  }
  throw fail('CHECKOUT_CUSTOMER_EVENT_UNCONFIRMED');
}

async function cleanupFixture() {
  cleanupAttempted=true;progress('cleanup_inspect_original_effect');
  let fixture=await loadFixture();
  if(fixture.recovery?.state==='running'||fixture.recovery?.lease_until){throw fail('CHECKOUT_RECOVERY_STILL_RUNNING');}
  const beforeRetained=hash({stock:fixture.stock,command:fixture.command,recovery:fixture.recovery,steps:fixture.steps,audit:fixture.audit});
  let provider=await providerState(fixture);
  if(provider.session?.status==='open'){
    progress('expire_exact_unpaid_session');cleanupPosts++;
    try{
      await stripe.request('POST','/v1/checkout/sessions/'+provider.session.id+'/expire',{},
        'quixo:'+fixture.command.tenant_id+':'+fixture.command.id+':acceptance-cleanup-expire');
    }catch{expiryResponseRecovered=true;}
    // Confirm even after an ambiguous expire response; never blindly repeat POST.
    provider=await providerState(fixture);assert.equal(provider.session?.status,'expired');
  }
  if(provider.session){assert.equal(provider.session.status,'expired');}
  fixture=await loadFixture();
  assert.equal(hash({stock:fixture.stock,command:fixture.command,recovery:fixture.recovery,steps:fixture.steps,audit:fixture.audit}),beforeRetained);
  await verifyProtected();
  progress('deactivate_owned_fixture_preserving_history');
  await store.locked(operation,async q=>{
    const current=await q('SELECT status FROM dbo.tenants WHERE id=@operation AND name=@name AND slug=@slug AND [plan]=\'development-testing\'',
      {operation,name:fixtureName,slug:'r5-checkout-recovery-'+operation});
    assert.equal(current.length,1);
    const running=await q("SELECT command_id FROM dbo.management_billing_recovery WHERE command_id=@operation AND (state='running' OR lease_until IS NOT NULL)",{operation});
    assert.deepEqual(running,[]);
    await q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@operation AND app_user_id=@actor AND status='active'",
      {operation,actor:fixture.actor.id});
    await q("UPDATE dbo.app_users SET status='inactive' WHERE id=@actor AND tenant_id=@operation AND auth_id IS NULL AND status='active'",
      {operation,actor:fixture.actor.id});
    await q("UPDATE dbo.tenants SET status='inactive' WHERE id=@operation AND status='active'",{operation});
    const receipts=await q('SELECT id FROM dbo.management_billing_audit WHERE tenant_id=@operation AND action=@action AND resource_id=@operation',
      {operation,action:cleanupAction});
    assert.ok(receipts.length<=1);
    if(!receipts.length){
      await store.audit(q,{tenantId:operation,actorId:fixture.actor.id,action:cleanupAction,resourceId:operation,
        current:{operation,customerId:provider.customer?.id||null,sessionId:provider.session?.id||null,
          sessionExpired:Boolean(provider.session),noSession:!provider.session,recordsRetained:true},
        reason:'Exact unpaid Checkout closed or no Checkout intent exists; private fixture deactivated with all journal and staging history retained.'});
    }
  });
  const after=await loadFixture();
  assert.equal(after.tenant.status,'inactive');assert.equal(after.actor.status,'inactive');
  assert.equal(hash({stock:after.stock,command:after.command,recovery:after.recovery,steps:after.steps,
    audit:after.audit.filter(row=>row.action!==cleanupAction)}),
  hash({stock:fixture.stock,command:fixture.command,recovery:fixture.recovery,steps:fixture.steps,
    audit:fixture.audit.filter(row=>row.action!==cleanupAction)}));
  assert.equal(after.audit.filter(row=>row.action===cleanupAction).length,1);
  provider=await providerState(after);if(provider.session){assert.equal(provider.session.status,'expired');}
  await verifyProtected();cleanupVerified=true;
  emit('CHECKOUT_RECOVERY_CLEANUP',{verified:true,fixtureInactive:true,sessionExpired:Boolean(provider.session),
    noSession:!provider.session,noSubscription:true,noInvoice:true,noPayment:true,recordsRetained:true,
    pendingStockRetained:after.stock.length,protectedBillingUnchanged:true,workerScopeUnchanged:true,
    cleanupPosts,expiryResponseRecovered});
}

async function verify() {
  progress('preflight');await preflight();check('preflight_and_protected_baseline');
  progress('create_fresh_fixture');const actorId=await createFixture();
  let fixture=await loadFixture();assert.equal(fixture.stock.length,1);
  const stockHash=hash(fixture.stock),accountBefore=fixture.account;
  const inventory=await store.inventory(operation,undefined,{includePending:true});assert.equal(inventory.length,1);
  assert.deepEqual(await store.inventory(operation),[]);
  const args={tenantId:operation,actorId,id:operation,inventoryHash:hash(inventory)};
  check('private_pending_stock_without_credentials');
  const interrupted={...stripe,request:async(method,path,body,key)=>{
    if(method==='GET'){return read(path,body);}
    assert.equal(method,'POST');
    if(path==='/v1/customers'){
      assert.equal(++customerPosts,1);customerKey=key;
      assert.equal(lower(body.metadata.quixo_operation),operation);assert.equal(lower(body.metadata.quixo_tenant),operation);
      assert.ok(!body.email&&!body.payment_method&&!body.test_clock);
      const customer=await stripe.request(method,path,body,key);customerId=customer.id;
      assert.match(customerId||'',/^cus_[A-Za-z0-9]+$/);assert.equal(customer.livemode,false);
      progress('customer_created_wait_for_normal_checkpoint');
      const command=(await store.read('SELECT created_at FROM dbo.management_billing_commands WHERE id=@operation',{operation}))[0];
      await waitForCustomerEvent(key,customerId,command.created_at,body.metadata);
      return customer;
    }
    if(path==='/v1/checkout/sessions'){
      assert.equal(customerPosts,1);assert.equal(++checkoutPosts,1);checkoutKey=key;
      assert.equal(body.customer,customerId);assert.deepEqual(body.line_items,[{price:BILLING_PRICE,quantity:1}]);
      const session=await stripe.request(method,path,body,key);sessionId=session.id;
      assert.match(sessionId||'',/^cs_test_[A-Za-z0-9]+$/);assert.equal(session.livemode,false);
      assert.equal(session.status,'open');assert.equal(objectId(session.customer),customerId);
      responseDiscarded=true;progress('checkout_response_discarded');
      throw fail('CHECKOUT_ACCEPTANCE_RESPONSE_LOST');
    }
    throw fail('CHECKOUT_UNEXPECTED_PROVIDER_WRITE');
  }};
  progress('create_checkout_with_controlled_response_loss');
  await assert.rejects(createBillingService({store,stripe:interrupted,env}).checkout(args),
    error=>error.code==='CHECKOUT_ACCEPTANCE_RESPONSE_LOST');
  fixture=await loadFixture();
  assert.equal(fixture.steps.length,2);
  const customerStep=fixture.steps.find(step=>step.name==='create_customer');
  const checkoutStep=fixture.steps.find(step=>step.name==='create_checkout');
  assert.ok(customerStep.completed_at);assert.equal(customerStep.idempotency_key,customerKey);
  assert.equal(JSON.parse(customerStep.result_json).customerId,customerId);
  assert.equal(JSON.parse(customerStep.result_json).eventId,customerEventId);
  const events=await customerEvents(fixture,customerStep);
  assert.equal(events.length,1);assert.equal(events[0].id,customerEventId);
  check('genuine_customer_checkpoint_without_duplicate');
  assert.equal(responseDiscarded,true);assert.equal(customerPosts,1);assert.equal(checkoutPosts,1);
  assert.equal(checkoutStep.completed_at,null);assert.equal(checkoutStep.result_json,null);
  assert.equal(checkoutStep.idempotency_key,checkoutKey);
  check('single_checkout_effect_response_discarded');
  assert.equal(fixture.command.status,'pending');assert.equal(fixture.recovery.state,'pending');
  assert.equal(fixture.recovery.attempts,1);assert.equal(fixture.recovery.last_error,'CHECKOUT_ACCEPTANCE_RESPONSE_LOST');
  assert.equal(fixture.recovery.lease_token,null);assert.equal(fixture.recovery.lease_until,null);
  assert.equal(fixture.audit.filter(row=>row.action==='sandbox.checkout.recovered').length,0);
  assert.deepEqual(fixture.account,accountBefore);assert.equal(hash(fixture.stock),stockHash);
  check('original_pending_journal_and_checkout_intent');
  progress('provider_readback');let provider=await providerState(fixture);
  assert.equal(provider.customer.id,customerId);assert.equal(provider.session.id,sessionId);
  assert.equal(provider.session.status,'open');assert.equal(provider.sessions.length,1);
  check('unique_bound_checkout_exhaustive_readback');
  progress('wait_for_natural_sql_retry_due');
  let due=false;
  for(let attempt=0;attempt<36;attempt++){
    const state=(await store.read(`SELECT state,attempts,CASE WHEN next_attempt_at<=SYSUTCDATETIME()
      AND lease_until IS NULL THEN 1 ELSE 0 END AS due FROM dbo.management_billing_recovery WHERE command_id=@operation`,{operation}))[0];
    assert.equal(state.state,'pending');assert.equal(state.attempts,1);
    if(state.due===1){due=true;break;}await delay(2500);
  }
  assert.ok(due);check('natural_sql_backoff_without_clock_edits');
  const readbackOnly={...stripe,request:async(method,path,body)=>{
    if(method!=='GET'){recoveryProviderWrites++;throw fail('CHECKOUT_RECOVERY_PROVIDER_WRITE_FORBIDDEN');}
    return read(path,body);
  }};
  const recoveredService=createBillingService({store,stripe:readbackOnly,env});
  progress('bounded_service_recovery');
  const result=await recoveredService.recoverOperation({tenantId:operation,id:operation});
  assert.equal(result.sessionId,sessionId);assert.equal(new URL(result.url).origin,'https://checkout.stripe.com');
  assert.ok(!result.requiresNewSession);assert.equal(recoveryProviderWrites,0);
  fixture=await loadFixture();assert.equal(fixture.command.status,'completed');
  assert.equal(fixture.recovery.state,'succeeded');assert.equal(fixture.recovery.attempts,2);
  assert.equal(fixture.steps.length,2);assert.ok(fixture.steps.every(step=>step.completed_at));
  assert.equal(fixture.steps.find(step=>step.name==='create_checkout').idempotency_key,checkoutKey);
  assert.equal(fixture.audit.filter(row=>row.action==='sandbox.checkout.recovered').length,1);
  assert.deepEqual(JSON.parse(fixture.command.result_json),result);
  assert.deepEqual(fixture.account,{...accountBefore,stripe_customer_id:customerId,inventory_json:JSON.stringify(inventory)});
  check('original_checkout_recovered_once');
  progress('completed_exact_retry');
  const completedHash=hash(fixture);
  const beforeProvider=await providerState(fixture);
  assert.deepEqual(await recoveredService.checkout(args),result);
  assert.deepEqual(await recoveredService.recoverOperation({tenantId:operation,id:operation}),result);
  fixture=await loadFixture();assert.equal(hash(fixture),completedHash);
  provider=await providerState(fixture);assert.deepEqual(provider,beforeProvider);
  assert.equal(recoveryProviderWrites,0);assert.equal(customerPosts,1);assert.equal(checkoutPosts,1);
  check('completed_exact_retry_without_provider_write');
  assert.equal(hash(fixture.stock),stockHash);assert.deepEqual(await store.inventory(operation),[]);
  assert.equal(fixture.stock[0].status,'pending');assert.equal(fixture.account.initial_payment_verified,false);
  for(const table of ['invoices','payments']){
    assert.equal((await store.read('SELECT id FROM dbo.'+table+' WHERE tenant_id=@operation',{operation})).length,0);
  }
  check('no_payment_subscription_invoice_or_stock_promotion');
  await verifyProtected();check('protected_accounts_clocks_and_worker_scope_unchanged');
  await cleanupFixture();check('cleanup_retains_all_journal_and_stock_history');
  emit('CHECKOUT_RECOVERY_PASS',{passed:true,sandbox:true,checks,scope:'genuine sandbox provider + deployed service/SQL',
    customerId,sessionId,customerEventId,originalCustomerKey:customerKey,originalCheckoutKey:checkoutKey,
    customerPosts,checkoutPosts,recoveryProviderWrites,cleanupPosts,responseDiscarded,
    originalIdempotencyKeyPreserved:true,exactRetryAccepted:true,checkoutSessions:1,
    subscriptionsCreated:0,invoicesCreated:0,paymentIntentsCreated:0,chargesCreated:0,
    stockUnchanged:true,pendingStockPreserved:true,actualProperties:0,actualUnits:0,
    fixtureInactive:true,sessionExpired:true,recordsRetained:true,protectedBillingUnchanged:true,workerScopeUnchanged:true,
    processLocalStagingReadiness:true,servingConfigurationChanged:false,automaticWorkerAccepted:false,
    httpAccepted:false,uiAccepted:false,credentialLoginAccepted:false,liveChargingEnabled:false});
}

async function inspect() {
  progress('read_only_preflight');await preflight();
  const fixture=await loadFixture();const before=hash(fixture);const provider=await providerState(fixture);
  assert.equal(hash(await loadFixture()),before);await verifyProtected();
  emit('CHECKOUT_RECOVERY_INSPECT',{readOnly:true,providerWrites:0,localWrites:0,
    fixtureInactive:fixture.tenant.status==='inactive',commandExists:Boolean(fixture.command),
    commandStatus:fixture.command?.status||null,recoveryState:fixture.recovery?.state||null,
    attempts:fixture.recovery?.attempts||0,stepCount:fixture.steps.length,
    completedSteps:fixture.steps.filter(step=>step.completed_at).length,
    recoveredAudits:fixture.audit.filter(row=>row.action==='sandbox.checkout.recovered').length,
    cleanupReceipts:fixture.audit.filter(row=>row.action===cleanupAction).length,
    customerId:provider.customer?.id||null,sessionId:provider.session?.id||null,sessionStatus:provider.session?.status||null,
    checkoutSessions:provider.sessions.length,subscriptions:provider.subscriptions.length,invoices:provider.invoices.length,
    paymentIntents:provider.paymentIntents.length,charges:provider.charges.length,pendingStock:fixture.stock.length,
    protectedBillingUnchanged:true,workerScopeUnchanged:true,recordsRetained:true,
    originalCustomerKey:fixture.steps.find(step=>step.name==='create_customer')?.idempotency_key||null,
    originalCheckoutKey:fixture.steps.find(step=>step.name==='create_checkout')?.idempotency_key||null});
}

try{
  if(mode==='verify'){await verify();}
  else if(mode==='inspect'){await inspect();}
  else{progress('cleanup_preflight');await preflight();await cleanupFixture();}
}catch(error){
  const failedStage=stage;
  // A controlled failure never becomes acceptance. Cleanup independently
  // resolves only proven owned effects and never invokes service recovery.
  if(mode==='verify'&&fixtureCreated&&!cleanupAttempted){
    try{await cleanupFixture();}
    catch(cleanupError){
      emit('CHECKOUT_RECOVERY_CLEANUP_FAILED',{stage,code:/^[A-Z0-9_]{3,80}$/.test(cleanupError.code||'')?cleanupError.code:'UNCONFIRMED',
        sqlNumber:Number.isInteger(cleanupError.number)?cleanupError.number:null,fixtureRetained:true});
    }
  }
  emit('CHECKOUT_RECOVERY_FAILED',{stage:failedStage,code:/^[A-Z0-9_]{3,80}$/.test(error.code||'')?error.code:'UNCONFIRMED',
    sqlNumber:Number.isInteger(error.number)?error.number:null,fixtureCreated,cleanupVerified,
    fixtureRetained:(fixtureCreated||fixtureObserved)&&!cleanupVerified,customerId,sessionId,customerPosts,checkoutPosts,recoveryProviderWrites,cleanupPosts,
    replayAllowed:false,acceptance:false});
  process.exitCode=1;
}finally{await closeMssqlPool();}
