// BL08.11: one period-end cancellation response lost after the sandbox effect.
// Normal hosted Checkout prepares the paid fixture under a separate command.
// Inspection and cleanup never replay either original operation.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createBillingService} from '/app/src/api/managementBilling/service.js';
import {createStripeClient,invoiceSubscription,objectId} from '/app/src/api/managementBilling/stripe.js';
import {requestObjectEvidence} from '/app/src/api/managementBilling/recoveryEvidence.js';
import {BILLING_ACCOUNT,BILLING_PRICE,entitlement,hash,stagedStock} from '/app/src/api/managementBilling/contract.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const operation=process.env.CANCELLATION_RECOVERY_OPERATION;
const mode=process.env.CANCELLATION_RECOVERY_MODE;
const scenario=process.env.CANCELLATION_RECOVERY_SCENARIO;
const confirmations={verify:'VERIFY-CANCELLATION-RECOVERY',inspect:'INSPECT-CANCELLATION-RECOVERY',cleanup:'CLEANUP-CANCELLATION-RECOVERY'};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const protectedIds=['80a4b392-13f8-484d-81fa-a110a6ef75f0','2383f4fc-e107-4ac7-9e13-39db501f40ec'];
const originalScope=process.env.MANAGEMENT_RECOVERY_TENANT_IDS,originalEnvironment=hash(process.env);
// This private copy permits the separately proven staging/refresh setup only.
// It never changes the serving environment or automatic worker selection.
const env={...process.env,MANAGEMENT_INVENTORY_SCHEMA_READY:'true'};
const store=createBillingStore({env}),stripe=createStripeClient();
const fixtureName='R5 private cancellation response-loss acceptance';
const fixtureAction='sandbox.cancellation_recovery.fixture',cleanupAction='sandbox.cancellation_recovery.cleaned';
const checks=[];
let stage='input',fixtureCreated=false,fixtureObserved=false,cleanupVerified=false,cleanupAttempted=false;
let baseline=null,origin=null,setupCommandId=null,customerId=null,sessionId=null,customerEventId=null;
let customerKey=null,checkoutKey=null,cancellationKey=null;
let customerPosts=0,checkoutPosts=0,cancellationPosts=0,recoveryProviderWrites=0,retryProviderWrites=0,refreshProviderWrites=0;
let cleanupPosts=0,cleanupCancellationRequests=0,responseDiscarded=false,hostedWaitStarted=false;
let expiryResponseRecovered=false,cancellationResponseRecovered=false;
const lower=value=>String(value).toLowerCase();
const iso=value=>new Date(value).toISOString();
const emit=(name,value)=>console.log(name+'='+JSON.stringify({operation,mode,scenario,...value}));
const progress=name=>{
  stage=name;
  emit('CANCELLATION_RECOVERY_PROGRESS',{stage,fixtureCreated,setupCommandId,customerId,sessionId,
    customerPosts,checkoutPosts,cancellationPosts,recoveryProviderWrites,retryProviderWrites,refreshProviderWrites,cleanupPosts,cleanupCancellationRequests});
};
const check=name=>{checks.push(name);emit('CANCELLATION_RECOVERY_CHECK',{name});};
const fail=code=>Object.assign(new Error(code),{code,status:503});
const read=(path,params)=>stripe.request('GET',path,params);
const fixtureStamp=actorId=>({version:1,scenario,operation,setupCommandId,actorId:lower(actorId),stockId:operation});
const stockRecord=()=>({kind:'property',payload:{id:operation,name:'Private cancellation recovery stock',
  propertytype:'house',country_code:'LK',availability:'inactive',rentalvalues:{listingCategory:'residential'}}});
const operationAudits=(fixture,kind,id)=>fixture.audit.filter(row=>row.action==='sandbox.'+kind+'.recovered'&&lower(row.resource_id)===id);

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
    if(!cursor||cursors.has(cursor)){throw fail('CANCELLATION_LISTING_UNCONFIRMED');}
    cursors.add(cursor);
  }
  throw fail('CANCELLATION_LISTING_UNEXHAUSTED');
}

async function protectedState() {
  const result=[];
  for(const id of protectedIds){
    const account=await store.account(id);assert.ok(account?.stripe_subscription_id);
    const subscription=await read('/v1/subscriptions/'+account.stripe_subscription_id);
    assert.equal(subscription.livemode,false);assert.equal(objectId(subscription.customer),account.stripe_customer_id);
    const clockId=objectId(subscription.test_clock),clock=clockId?await read('/v1/test_helpers/test_clocks/'+clockId):null;
    if(clock){assert.equal(clock.id,clockId);assert.equal(clock.livemode,false);}
    result.push({tenant:id,account:hash(account),subscription:hash(subscription),
      clock:clock?hash({id:clock.id,status:clock.status,frozen_time:clock.frozen_time}):null});
  }
  return result;
}

async function verifyProtected() {
  assert.equal(hash(process.env),originalEnvironment);
  assert.equal(process.env.MANAGEMENT_RECOVERY_TENANT_IDS,originalScope);assert.equal(env.MANAGEMENT_RECOVERY_TENANT_IDS,originalScope);
  assert.deepEqual(await protectedState(),baseline);
}

async function preflight() {
  assert.match(operation||'',uuid);assert.ok(Object.hasOwn(confirmations,mode));
  assert.equal(scenario,'period-end-no-schedule');assert.equal(process.env.CANCELLATION_RECOVERY_CONFIRMATION,confirmations[mode]);
  assert.ok(!protectedIds.includes(operation));
  for(const flag of ['MANAGEMENT_BILLING_SANDBOX_ENABLED','MANAGEMENT_BILLING_SCHEMA_READY','MANAGEMENT_RECOVERY_SCHEMA_READY','MANAGEMENT_RECOVERY_WORKER_ENABLED']){
    assert.equal(process.env[flag],'true');
  }
  assert.notEqual(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED,'true');
  assert.notEqual(process.env.MANAGEMENT_INVENTORY_SCHEMA_READY,'true');
  assert.match(process.env.STRIPE_SANDBOX_SECRET_KEY||'',/^(sk|rk)_test_/);assert.equal(process.env.STRIPE_SANDBOX_ACCOUNT_ID,BILLING_ACCOUNT);
  assert.deepEqual(String(originalScope||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean),[protectedIds[0]]);
  const configuredOrigin=new URL(env.PUBLIC_APP_URL||env.PASSWORD_RESET_BASE_URL);
  assert.equal(configuredOrigin.href,'https://app.quixo.homes/');origin=configuredOrigin.origin;
  for(const table of ['management_billing_accounts','management_billing_commands','management_billing_recovery',
    'management_billing_steps','management_billing_audit','management_billing_events','management_inventory_staging']){
    assert.ok((await store.read('SELECT OBJECT_ID(@name) AS id',{name:'dbo.'+table}))[0]?.id);
  }
  await stripe.assertAccount();assert.equal((await createBillingService({store,stripe,env}).price(BILLING_PRICE)).unit_amount,500);
  baseline=await protectedState();
}

async function createFixture() {
  const actorId=randomUUID();setupCommandId=randomUUID();
  assert.notEqual(setupCommandId,operation);assert.notEqual(actorId,operation);assert.notEqual(actorId,setupCommandId);
  await store.locked('r5-cancellation-recovery-fixtures',async q=>{
    assert.equal((await q('SELECT id FROM dbo.tenants WHERE id=@operation',{operation})).length,0,'Never reuse a fixture UUID');
    assert.equal((await q('SELECT id FROM dbo.management_billing_commands WHERE id IN (@operation,@setup)',{operation,setup:setupCommandId})).length,0);
    const unresolved=await q(`SELECT t.id FROM dbo.tenants t WHERE t.slug LIKE 'r5-cancellation-recovery-%'
      AND (t.status='active' OR NOT EXISTS(SELECT 1 FROM dbo.management_billing_audit a WHERE a.tenant_id=t.id
        AND a.action=@action AND LOWER(a.resource_id)=LOWER(CONVERT(VARCHAR(36),t.id))))`,{action:cleanupAction});
    assert.equal(unresolved.length,0,'Inspect and clean the earlier fixture before creating another');
    await q("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@operation,@name,@slug,'active','development-testing')",
      {operation,name:fixtureName,slug:'r5-cancellation-recovery-'+operation});
    await q("INSERT dbo.app_users(id,tenant_id,name,email,role,user_type,status) VALUES(@actorId,@operation,'Synthetic non-login cancellation actor',@email,'admin','admin','active')",
      {actorId,operation,email:'r5-cancellation-recovery-'+operation+'@example.invalid'});
    await q("INSERT dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@operation,@actorId,'admin','active',1)",{operation,actorId});
    await q("INSERT dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,market,inventory_json,subscription_status) VALUES(@operation,@account,@price,'LK','[]','pending')",
      {operation,account:BILLING_ACCOUNT,price:BILLING_PRICE});
    // resource_id makes the random setup ID recoverable even before Checkout
    // or staging exists. The hash binds both command identities and ownership.
    await store.audit(q,{tenantId:operation,actorId,action:fixtureAction,resourceId:setupCommandId,current:fixtureStamp(actorId),
      reason:'Isolated cancellation recovery fixture with distinct normal Checkout setup; no credentials or consent created.'});
  });
  fixtureCreated=true;progress('prepare_private_stock');
  await store.stageStock({tenantId:operation,actorId,records:[stockRecord()],reason:'Prepare one private dwelling for the bounded paid cancellation recovery proof.'});
  return actorId;
}

async function loadFixture() {
  const tenants=await store.read('SELECT id,name,slug,status,[plan] FROM dbo.tenants WHERE id=@operation',{operation});
  assert.equal(tenants.length,1,'Fixture does not exist; maintenance never creates it');
  const tenant=tenants[0];assert.equal(tenant.name,fixtureName);assert.equal(tenant.slug,'r5-cancellation-recovery-'+operation);
  assert.equal(tenant.plan,'development-testing');assert.ok(['active','inactive'].includes(tenant.status));fixtureObserved=true;
  const actors=await store.read('SELECT id,tenant_id,email,role,user_type,status,auth_id FROM dbo.app_users WHERE tenant_id=@operation',{operation});
  assert.equal(actors.length,1);const actor=actors[0];
  assert.equal(actor.email,'r5-cancellation-recovery-'+operation+'@example.invalid');
  assert.equal(actor.role,'admin');assert.equal(actor.user_type,'admin');assert.equal(actor.auth_id,null);assert.equal(lower(actor.tenant_id),operation);
  const memberships=await store.read('SELECT * FROM dbo.tenant_memberships WHERE tenant_id=@operation',{operation});
  assert.equal(memberships.length,1);assert.equal(lower(memberships[0].app_user_id),lower(actor.id));
  assert.equal(memberships[0].role,'admin');assert.equal(memberships[0].status,actor.status);assert.equal(actor.status,tenant.status);
  const audit=await store.read('SELECT * FROM dbo.management_billing_audit WHERE tenant_id=@operation ORDER BY id',{operation});
  const markers=audit.filter(row=>row.action===fixtureAction);assert.equal(markers.length,1);
  const savedSetupId=lower(markers[0].resource_id);assert.match(savedSetupId,uuid);assert.notEqual(savedSetupId,operation);
  if(setupCommandId){assert.equal(setupCommandId,savedSetupId);}else{setupCommandId=savedSetupId;}
  assert.equal(lower(markers[0].actor_id),lower(actor.id));assert.equal(markers[0].current_hash,hash(fixtureStamp(actor.id)));
  assert.notEqual(lower(actor.id),operation);assert.notEqual(lower(actor.id),setupCommandId);
  const account=await store.account(operation);assert.ok(account);assert.equal(lower(account.tenant_id),operation);
  assert.equal(account.stripe_account_id,BILLING_ACCOUNT);assert.equal(account.stripe_price_id,BILLING_PRICE);assert.equal(account.market,'LK');
  for(const field of ['stripe_schedule_id','grace_started_at','comp_type','comp_expires_at','pending_quantity']){assert.equal(account[field],null);}
  assert.equal(account.risk_hold,false);
  if(account.stripe_subscription_id){
    assert.match(account.stripe_subscription_id,/^sub_[A-Za-z0-9]+$/);assert.match(account.stripe_item_id||'',/^si_[A-Za-z0-9]+$/);
    assert.ok(['active','canceled'].includes(account.subscription_status));assert.equal(account.initial_payment_verified,true);
    assert.equal(account.quantity,1);assert.ok(Number.isFinite(Date.parse(account.paid_through)));
    assert.equal(entitlement(account).management,account.subscription_status==='active');
  }else{
    assert.equal(account.stripe_item_id,null);assert.equal(account.subscription_status,'pending');assert.equal(account.initial_payment_verified,false);
    assert.equal(account.quantity,0);assert.equal(account.paid_through,null);assert.equal(account.cancel_at_period_end,false);
  }
  const properties=await store.read('SELECT * FROM dbo.properties WHERE tenant_id=@operation',{operation});
  const units=await store.read('SELECT * FROM dbo.property_units WHERE tenant_id=@operation',{operation});assert.deepEqual(units,[]);
  const listings=await store.read('SELECT * FROM dbo.public_listing_preferences WHERE tenant_id=@operation ORDER BY property_id',{operation});
  const stock=await store.read('SELECT * FROM dbo.management_inventory_staging WHERE tenant_id=@operation ORDER BY id',{operation});
  assert.ok(stock.length<=1);assert.ok(properties.length<=1);
  if(stock.length){
    const item=stock[0],expected=stagedStock([stockRecord()])[0];
    assert.equal(lower(item.id),operation);assert.equal(item.kind,'property');assert.ok(['pending','promoted'].includes(item.status));
    assert.equal(lower(item.created_by),lower(actor.id));assert.deepEqual(JSON.parse(item.payload_json),expected.payload);assert.equal(item.payload_hash,hash(expected.payload));
    if(item.status==='promoted'){
      assert.ok(item.promoted_at);assert.equal(lower(item.promotion_command_id),setupCommandId);assert.equal(properties.length,1);
      const property=properties[0];assert.equal(lower(property.id),operation);assert.equal(property.status,'inactive');
      assert.equal(property.name,expected.payload.name);assert.equal(property.propertytype,expected.payload.propertytype);
      assert.equal(property.country_code,expected.payload.country_code);assert.deepEqual(JSON.parse(property.rentalvalues),expected.payload.rentalvalues);
      assert.equal(listings.length,1);assert.equal(lower(listings[0].property_id),operation);assert.equal(typeof listings[0].opted_out,'boolean');
    }else{
      assert.equal(item.promoted_at,null);assert.equal(item.promotion_command_id,null);assert.deepEqual(properties,[]);assert.deepEqual(listings,[]);
    }
  }else{assert.deepEqual(properties,[]);assert.deepEqual(listings,[]);}
  const commands=await store.read('SELECT * FROM dbo.management_billing_commands WHERE tenant_id=@operation ORDER BY id',{operation});
  assert.ok(commands.length<=2);assert.ok(commands.every(row=>[setupCommandId,operation].includes(lower(row.id))));
  const loadOperation=async(id,kind)=>{
    const command=commands.find(row=>lower(row.id)===id)||null;
    const recoveries=await store.read('SELECT * FROM dbo.management_billing_recovery WHERE command_id=@id',{id});
    const steps=await store.read('SELECT * FROM dbo.management_billing_steps WHERE command_id=@id ORDER BY name',{id});
    if(!command){assert.deepEqual(recoveries,[]);assert.deepEqual(steps,[]);return {command:null,recovery:null,steps,intent:null};}
    assert.equal(command.kind,kind);assert.equal(lower(command.tenant_id),operation);assert.equal(recoveries.length,1);
    const recovery=recoveries[0];assert.equal(lower(recovery.actor_id),lower(actor.id));const intent=JSON.parse(recovery.intent_json);
    for(const step of steps){assert.equal(lower(step.command_id),id);assert.equal(step.input_hash,hash(JSON.parse(step.input_json)));}
    return {command,recovery,steps,intent};
  };
  const setup=await loadOperation(setupCommandId,'checkout'),target=await loadOperation(operation,'cancellation');
  if(setup.command){
    const {command,intent,steps}=setup;assert.equal(stock.length,1);
    const inventory=[{key:'property:'+operation,propertyId:operation,unitId:null,label:stockRecord().payload.name,
      stagedRecords:[{id:operation,hash:stock[0].payload_hash}]}];
    assert.deepEqual(intent,{inventoryHash:hash(inventory),_subscriptionId:null,customerId:null,scheduleId:null,
      origin,priceId:BILLING_PRICE,inventory,existingSessionId:null});
    assert.equal(command.payload_hash,hash({inventoryHash:intent.inventoryHash}));
    assert.deepEqual(JSON.parse(command.payload_json),{inventoryHash:intent.inventoryHash,_subscriptionId:null});
    assert.ok(steps.length<=2);const key='quixo:'+command.tenant_id+':'+command.id;
    for(const step of steps){
      assert.ok(['create_customer','create_checkout'].includes(step.name));
      assert.equal(step.idempotency_key,key+(step.name==='create_customer'?':customer':':checkout'));
      const input=JSON.parse(step.input_json);
      assert.equal(input.metadata.quixo_operation,command.id);assert.equal(input.metadata.quixo_tenant,command.tenant_id);
      if(step.name==='create_checkout'){
        assert.equal(input.mode,'subscription');assert.equal(input.metadata.inventory_hash,intent.inventoryHash);
        assert.deepEqual(input.line_items,[{price:BILLING_PRICE,quantity:1}]);
        assert.equal(input.success_url,origin+'/dashboard/subscription?checkout=returned');assert.equal(input.cancel_url,origin+'/dashboard/subscription?checkout=cancelled');
      }
    }
    if(stock[0].status==='promoted'){
      assert.equal(command.status,'completed');assert.ok(account.stripe_subscription_id);
      assert.deepEqual(JSON.parse(account.inventory_json),await store.inventory(operation));
    }
    if(command.status==='completed'){
      assert.equal(setup.recovery.state,'succeeded');
      assert.equal(steps.length,2);assert.ok(steps.every(step=>step.completed_at));
      const saved=JSON.parse(command.result_json),checkoutResult=JSON.parse(steps.find(step=>step.name==='create_checkout').result_json);
      assert.equal(saved.sessionId,checkoutResult.sessionId);assert.equal(account.stripe_customer_id,checkoutResult.customerId);
      if(Object.hasOwn(saved,'url')){
        assert.equal(new URL(saved.url).origin,'https://checkout.stripe.com');assert.deepEqual(Object.keys(saved).sort(),['sessionId','url']);
      }else{
        assert.equal(saved.requiresNewSession,true);
        assert.ok(['Checkout completed. Refresh subscription status.','Checkout expired. Open sandbox checkout again.'].includes(saved.message));
      }
    }else{assert.equal(command.status,'pending');assert.equal(command.result_json,null);assert.equal(account.stripe_customer_id,null);}
  }else{
    assert.equal(account.stripe_customer_id,null);assert.equal(account.stripe_subscription_id,null);
    assert.ok(!stock.length||stock[0].status==='pending');
  }
  if(target.command){
    assert.equal(setup.command?.status,'completed');assert.equal(stock[0]?.status,'promoted');assert.ok(account.stripe_subscription_id);
    const {command,intent,steps}=target;
    assert.equal(command.payload_hash,hash({cancelAtPeriodEnd:true}));
    assert.deepEqual(JSON.parse(command.payload_json),{cancelAtPeriodEnd:true,_subscriptionId:account.stripe_subscription_id});
    assert.deepEqual(intent,{cancelAtPeriodEnd:true,_subscriptionId:account.stripe_subscription_id,customerId:account.stripe_customer_id,scheduleId:null});
    assert.ok(steps.length<=1);
    for(const step of steps){
      assert.equal(step.name,'set_cancellation');assert.equal(step.idempotency_key,'quixo:'+command.tenant_id+':'+command.id);
      assert.deepEqual(JSON.parse(step.input_json),{subscriptionId:intent._subscriptionId,cancelAtPeriodEnd:true});
    }
    if(command.status==='completed'){
      assert.equal(target.recovery.state,'succeeded');
      assert.equal(steps.length,1);assert.ok(steps[0].completed_at);
      assert.deepEqual(JSON.parse(steps[0].result_json),{subscriptionId:intent._subscriptionId,cancelAtPeriodEnd:true});
      const saved=JSON.parse(command.result_json);assert.equal(saved.cancelAtPeriodEnd,true);assert.equal(saved.paidThrough,iso(saved.paidThrough));
      assert.deepEqual(Object.keys(saved).sort(),['cancelAtPeriodEnd','paidThrough']);
    }else{assert.equal(command.status,'pending');assert.equal(command.result_json,null);}
  }
  return {tenant,actor,memberships,account,audit,stock,properties,units,listings,setup,target};
}

async function customerEvents(fixture,step) {
  const created=Math.floor(new Date(fixture.setup.command.created_at).getTime()/1000)-60;
  assert.ok(Number.isFinite(created));
  // An old incomplete customer step cannot establish absence from expired event retention.
  if(created*1000<Date.now()-29*86400000&&!step.completed_at){throw fail('CANCELLATION_CUSTOMER_EVIDENCE_TOO_OLD');}
  const events=await listAll('/v1/events',{type:'customer.created',created:{gte:created}});
  return events.filter(event=>event.type==='customer.created'&&event.livemode===false&&
    (!event.account||event.account===BILLING_ACCOUNT)&&event.request?.idempotency_key===step.idempotency_key&&
    event.data?.object?.livemode===false&&event.data.object.metadata?.quixo_operation===fixture.setup.command.id&&
    event.data.object.metadata?.quixo_tenant===fixture.setup.command.tenant_id);
}

async function providerState(fixture) {
  const customerStep=fixture.setup.steps.find(step=>step.name==='create_customer');
  const checkoutStep=fixture.setup.steps.find(step=>step.name==='create_checkout');
  if(!customerStep){
    assert.ok(!checkoutStep);assert.equal(fixture.account.stripe_customer_id,null);
    return {customer:null,session:null,sessions:[],subscriptions:[],invoices:[],paymentIntents:[],charges:[]};
  }
  let savedCustomer;
  if(customerStep.completed_at){savedCustomer=JSON.parse(customerStep.result_json);}
  else{
    const events=await customerEvents(fixture,customerStep);
    if(events.length!==1){throw fail('CANCELLATION_CUSTOMER_EFFECT_UNCONFIRMED');}
    savedCustomer={customerId:events[0].data.object.id,eventId:events[0].id};
  }
  assert.match(savedCustomer.customerId||'',/^cus_[A-Za-z0-9]+$/);
  const customer=await read('/v1/customers/'+savedCustomer.customerId);
  assert.equal(customer.id,savedCustomer.customerId);assert.equal(customer.livemode,false);assert.ok(!customer.deleted);
  assert.equal(customer.metadata?.quixo_operation,fixture.setup.command.id);
  assert.equal(customer.metadata?.quixo_tenant,fixture.setup.command.tenant_id);
  assert.equal(objectId(customer.test_clock)||null,null);assert.equal(customer.balance,0);
  // Hosted Checkout may populate contact/payment details. Their contents never
  // leave this process; readiness still requires an untouched unpaid customer.
  if(mode==='verify'&&!hostedWaitStarted&&!cleanupAttempted){
    assert.ok(!customer.email);assert.equal(objectId(customer.invoice_settings?.default_payment_method)||null,null);
    assert.equal(objectId(customer.default_source)||null,null);
  }
  if(fixture.account.stripe_customer_id){assert.equal(fixture.account.stripe_customer_id,customer.id);}
  const sessions=await listAll('/v1/checkout/sessions',{customer:customer.id});
  let session=null;
  if(checkoutStep){
    // Even an exhausted empty listing does not license replay or deletion of
    // an ambiguous persisted provider intent. Retain it for later inspection.
    if(sessions.length!==1){throw fail('CANCELLATION_SESSION_EFFECT_UNCONFIRMED');}
    session=await read('/v1/checkout/sessions/'+sessions[0].id);
    assert.equal(session.id,sessions[0].id);assert.equal(session.livemode,false);assert.equal(session.mode,'subscription');
    assert.equal(objectId(session.customer),customer.id);
    assert.equal(session.metadata?.quixo_operation,fixture.setup.command.id);
    assert.equal(session.metadata?.quixo_tenant,fixture.setup.command.tenant_id);
    assert.equal(session.metadata?.inventory_hash,fixture.setup.intent.inventoryHash);
    const input=JSON.parse(checkoutStep.input_json);assert.equal(input.customer,customer.id);
    assert.equal(session.success_url,input.success_url);assert.equal(session.cancel_url,input.cancel_url);
    assert.equal(session.currency,'usd');assert.equal(session.amount_total,500);
    assert.ok(['open','expired','complete'].includes(session.status));
    if(session.status==='complete'){
      assert.equal(session.payment_status,'paid');assert.match(objectId(session.subscription)||'',/^sub_[A-Za-z0-9]+$/);
      assert.equal(objectId(session.setup_intent)||null,null);
    }else{
      assert.equal(session.payment_status,'unpaid');
      for(const field of ['subscription','invoice','payment_intent','setup_intent']){assert.equal(objectId(session[field])||null,null);}
    }
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
  if(session?.status!=='complete'){
    for(const rows of [subscriptions,invoices,paymentIntents,charges]){assert.deepEqual(rows,[]);}
    return {customer,session,sessions,subscriptions,invoices,paymentIntents,charges};
  }
  for(const rows of [subscriptions,invoices,paymentIntents,charges]){assert.equal(rows.length,1);}
  const subscription=await read('/v1/subscriptions/'+objectId(session.subscription));
  assert.equal(subscription.id,subscriptions[0].id);assert.equal(subscription.livemode,false);
  assert.equal(objectId(subscription.customer),customer.id);assert.ok(['active','canceled'].includes(subscription.status));
  assert.equal(subscription.collection_method,'charge_automatically');assert.equal(subscription.currency,'usd');
  assert.ok(!subscription.trial_start&&!subscription.trial_end);assert.equal(objectId(subscription.test_clock)||null,null);
  assert.equal(objectId(subscription.schedule)||null,null);assert.equal(typeof subscription.cancel_at_period_end,'boolean');
  if(!fixture.target.command&&subscription.status==='active'){assert.equal(subscription.cancel_at_period_end,false);}
  assert.equal(subscription.items?.data?.length,1);assert.equal(subscription.items.has_more,false);
  const item=subscription.items.data[0];assert.equal(objectId(item.price),BILLING_PRICE);assert.equal(item.quantity,1);
  assert.equal(item.price.currency,'usd');assert.equal(item.price.unit_amount,500);assert.equal(item.price.recurring?.interval,'month');
  if(fixture.account.stripe_subscription_id){
    assert.equal(fixture.account.stripe_subscription_id,subscription.id);assert.equal(fixture.account.stripe_item_id,item.id);
  }
  const invoice=await read('/v1/invoices/'+objectId(subscription.latest_invoice));
  assert.equal(invoice.id,invoices[0].id);assert.equal(invoice.livemode,false);assert.equal(invoice.status,'paid');
  assert.equal(objectId(invoice.customer),customer.id);assert.equal(invoiceSubscription(invoice),subscription.id);
  assert.equal(invoice.currency,'usd');assert.equal(invoice.billing_reason,'subscription_create');
  for(const field of ['subtotal','total','amount_due','amount_paid']){assert.equal(invoice[field],500);}
  for(const field of ['amount_remaining','pre_payment_credit_notes_amount','post_payment_credit_notes_amount']){assert.equal(invoice[field],0);}
  const invoiceLines=await listAll('/v1/invoices/'+invoice.id+'/lines');assert.equal(invoiceLines.length,1);
  const line=invoiceLines[0];assert.equal(line.livemode,false);assert.equal(objectId(line.invoice),invoice.id);
  assert.equal(objectId(line.parent?.subscription_item_details?.subscription||line.subscription),subscription.id);
  assert.equal(line.quantity,1);assert.equal(line.amount,500);assert.equal(line.currency,'usd');
  assert.equal(objectId(line.pricing?.price_details?.price||line.price),BILLING_PRICE);
  assert.equal(objectId(line.parent?.subscription_item_details?.subscription_item||line.subscription_item),item.id);
  assert.equal(line.parent?.subscription_item_details?.proration??line.proration,false);
  assert.ok(Number.isSafeInteger(line.period?.start)&&Number.isSafeInteger(line.period?.end)&&line.period.end>line.period.start);
  if(subscription.status==='active'){assert.equal(line.period.end,item.current_period_end||subscription.current_period_end);}
  const invoicePayments=await listAll('/v1/invoice_payments',{invoice:invoice.id});assert.equal(invoicePayments.length,1);
  const paid=invoicePayments[0];assert.equal(paid.livemode,false);assert.equal(objectId(paid.invoice),invoice.id);
  assert.equal(paid.status,'paid');assert.equal(paid.currency,'usd');assert.equal(paid.amount_paid,500);assert.equal(paid.amount_requested,500);
  assert.equal(paid.payment?.type,'payment_intent');
  const paymentIntent=paymentIntents[0],charge=charges[0];
  assert.equal(objectId(paid.payment.payment_intent),paymentIntent.id);assert.equal(paymentIntent.livemode,false);
  assert.equal(objectId(paymentIntent.customer),customer.id);assert.equal(paymentIntent.status,'succeeded');
  assert.equal(paymentIntent.amount,500);assert.equal(paymentIntent.amount_received,500);assert.equal(paymentIntent.currency,'usd');
  assert.equal(objectId(paymentIntent.latest_charge),charge.id);assert.equal(charge.livemode,false);
  assert.equal(objectId(charge.customer),customer.id);assert.equal(objectId(charge.payment_intent),paymentIntent.id);
  assert.equal(charge.status,'succeeded');assert.equal(charge.paid,true);assert.equal(charge.captured,true);
  assert.equal(charge.amount,500);assert.equal(charge.amount_captured,500);assert.equal(charge.currency,'usd');
  assert.equal(charge.amount_refunded,0);assert.equal(charge.refunded,false);assert.equal(charge.disputed,false);
  const method=objectId(paymentIntent.payment_method);assert.match(method||'',/^pm_[A-Za-z0-9]+$/);
  assert.equal(objectId(charge.payment_method),method);
  assert.equal(objectId(subscription.default_payment_method)||objectId(customer.invoice_settings?.default_payment_method),method);
  if(objectId(session.invoice)){assert.equal(objectId(session.invoice),invoice.id);}
  if(objectId(session.payment_intent)){assert.equal(objectId(session.payment_intent),paymentIntent.id);}
  const refunds=await listAll('/v1/refunds',{charge:charge.id});assert.deepEqual(refunds,[]);
  const creditNotes=await listAll('/v1/credit_notes',{invoice:invoice.id});assert.deepEqual(creditNotes,[]);
  const pendingInvoiceItems=await listAll('/v1/invoiceitems',{customer:customer.id,pending:true});assert.deepEqual(pendingInvoiceItems,[]);
  return {customer,session,sessions,subscriptions,invoices,paymentIntents,charges,subscription,invoice,invoiceLines,
    invoicePayments,paymentIntent,charge,refunds,creditNotes,pendingInvoiceItems};
}

async function confirmedProvider(fixture) {
  // A browser payment may finish between individual GETs. Retry readback only,
  // boundedly, until one coherent ownership/financial snapshot is established.
  for(let attempt=0;attempt<6;attempt++){
    try{return await providerState(fixture);}
    catch(error){if(attempt===5){throw error;}await delay(2000);}
  }
  throw fail('CANCELLATION_PROVIDER_STATE_UNCONFIRMED');
}

function paidFinancialSnapshot(provider) {
  const {customer,session,subscription,invoice,invoiceLines,invoicePayments,paymentIntent,charge}=provider;
  return {customerId:customer.id,customerBalance:customer.balance,sessionId:session.id,sessionStatus:session.status,
    paymentStatus:session.payment_status,subscriptionId:subscription.id,
    items:subscription.items.data.map(item=>({id:item.id,price:objectId(item.price),quantity:item.quantity})),
    invoice:{id:invoice.id,customer:objectId(invoice.customer),subscription:invoiceSubscription(invoice),status:invoice.status,
      currency:invoice.currency,reason:invoice.billing_reason,subtotal:invoice.subtotal,total:invoice.total,
      due:invoice.amount_due,paid:invoice.amount_paid,remaining:invoice.amount_remaining,
      preCredit:invoice.pre_payment_credit_notes_amount,postCredit:invoice.post_payment_credit_notes_amount},
    lines:invoiceLines.map(line=>({id:line.id,amount:line.amount,quantity:line.quantity,currency:line.currency,period:line.period})),
    invoicePayments:invoicePayments.map(value=>({id:value.id,invoice:objectId(value.invoice),status:value.status,
      requested:value.amount_requested,paid:value.amount_paid,currency:value.currency,payment:objectId(value.payment?.payment_intent)})),
    payment:{id:paymentIntent.id,status:paymentIntent.status,amount:paymentIntent.amount,received:paymentIntent.amount_received,
      currency:paymentIntent.currency,charge:objectId(paymentIntent.latest_charge)},
    charge:{id:charge.id,status:charge.status,amount:charge.amount,captured:charge.amount_captured,refunded:charge.amount_refunded,
      currency:charge.currency,paid:charge.paid,disputed:charge.disputed},
    sessions:provider.sessions.map(value=>value.id),subscriptions:provider.subscriptions.map(value=>value.id),
    invoices:provider.invoices.map(value=>value.id),paymentIntents:provider.paymentIntents.map(value=>value.id),charges:provider.charges.map(value=>value.id),
    refunds:provider.refunds,creditNotes:provider.creditNotes,pendingInvoiceItems:provider.pendingInvoiceItems};
}

const historyCore=fixture=>({stock:fixture.stock,properties:fixture.properties,units:fixture.units,setup:fixture.setup,target:fixture.target});
const stableAccount=account=>{const value={...account};delete value.version;delete value.updated_at;return value;};
const accountBusiness=account=>{const value=stableAccount(account);delete value.cancel_at_period_end;return value;};
const immutableCommand=command=>{const value={...command};for(const field of ['status','result_json','completed_at']){delete value[field];}return value;};

async function assertAuditRetained(before,after,{promotion=false,cancellation=false,cleanup=false}={}) {
  const existing=new Map(before.map(row=>[String(row.id),row]));
  for(const row of before){assert.deepEqual(after.find(value=>String(value.id)===String(row.id)),row);}
  for(const row of after.filter(value=>!existing.has(String(value.id)))){
    if(row.action==='stripe.event_reconciled'){
      // Webhook appends are legitimate on this already-bound paid customer.
      // Verify their exact provider event and local event ledger independently.
      assert.match(row.resource_id,/^evt_[A-Za-z0-9]+$/);
      const event=await read('/v1/events/'+row.resource_id),account=await store.account(operation);
      assert.equal(event.id,row.resource_id);assert.equal(event.livemode,false);assert.equal(event.data?.object?.livemode,false);
      assert.ok(!event.account||event.account===BILLING_ACCOUNT);
      assert.match(event.type,/^(checkout\.session\.(completed|async_payment_succeeded)|customer\.subscription\.(created|updated|deleted)|invoice\.paid)$/);
      assert.equal(row.reason,event.type);assert.equal(objectId(event.data?.object?.customer),account.stripe_customer_id);
      const object=event.data.object;
      const subscription=object.object==='subscription'?object.id:object.object==='invoice'?invoiceSubscription(object):objectId(object.subscription);
      assert.equal(subscription,account.stripe_subscription_id);
      assert.ok(['active','canceled'].some(status=>row.current_hash===hash({status,risk:false})));
      const events=await store.read('SELECT tenant_id,event_type FROM dbo.management_billing_events WHERE stripe_event_id=@id',{id:event.id});
      assert.equal(events.length,1);assert.equal(lower(events[0].tenant_id),operation);assert.equal(events[0].event_type,event.type);
    }else{
      assert.ok((promotion&&row.action==='inventory.promoted'&&lower(row.resource_id)===setupCommandId)||
        (cancellation&&row.action==='sandbox.cancellation.recovered'&&lower(row.resource_id)===operation)||
        (cleanup&&row.action===cleanupAction&&lower(row.resource_id)===operation));
    }
  }
}

async function ensurePrivateStock(fixture) {
  if(!fixture.properties.length){return;}
  assert.equal(fixture.properties.length,1);assert.equal(fixture.properties[0].status,'inactive');
  await store.locked(operation,q=>q(`UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME()
    WHERE tenant_id=@operation AND property_id=@operation AND opted_out=0`,{operation}));
  const rows=await store.read('SELECT property_id,opted_out FROM dbo.public_listing_preferences WHERE tenant_id=@operation',{operation});
  assert.equal(rows.length,1);assert.equal(lower(rows[0].property_id),operation);assert.equal(rows[0].opted_out,true);
}

function readbackClient(phase) {
  return {...stripe,request:async(method,path,body)=>{
    if(method!=='GET'){
      if(phase==='recovery'){recoveryProviderWrites++;}else if(phase==='retry'){retryProviderWrites++;}else{refreshProviderWrites++;}
      throw fail('CANCELLATION_PROVIDER_WRITE_FORBIDDEN');
    }
    return read(path,body);
  }};
}

async function waitForCustomerEvent(key,id,createdAt,metadata) {
  for(let attempt=0;attempt<24;attempt++){
    const proof=await requestObjectEvidence({stripe,type:'customer.created',key,since:createdAt,
      matches:value=>value.id===id&&value.metadata?.quixo_operation===metadata.quixo_operation&&value.metadata?.quixo_tenant===metadata.quixo_tenant});
    if(proof){customerEventId=proof.eventId;return;}
    await delay(5000);
  }
  throw fail('CANCELLATION_CUSTOMER_EVENT_UNCONFIRMED');
}

async function waitForHostedPayment(fixture) {
  // Serving staging readiness remains OFF. A pre-promotion webhook attempts
  // promotion and rolls its binding/projection transaction back. After this
  // process explicitly promotes, legitimate webhook projections are allowed.
  assert.notEqual(process.env.MANAGEMENT_INVENTORY_SCHEMA_READY,'true');
  const originalCore=hash(historyCore(fixture)),beforeAudit=fixture.audit,started=Date.now(),deadline=started+600000;
  let session=null,nextHeartbeat=0;hostedWaitStarted=true;progress('await_same_hosted_sandbox_payment');
  const ids={targetCommandId:operation,setupCommandId,customerId,sessionId};
  emit('CANCELLATION_RECOVERY_READY',{...ids,waitSeconds:600});
  while(Date.now()<deadline){
    session=await read('/v1/checkout/sessions/'+sessionId);
    assert.equal(session.id,sessionId);assert.equal(session.livemode,false);assert.equal(objectId(session.customer),customerId);
    assert.equal(session.metadata?.quixo_operation,fixture.setup.command.id);assert.equal(session.metadata?.quixo_tenant,fixture.setup.command.tenant_id);
    if(session.status==='complete'){break;}
    assert.equal(session.status,'open');const elapsedSeconds=Math.min(600,Math.floor((Date.now()-started)/1000));
    if(elapsedSeconds>=nextHeartbeat){emit('CANCELLATION_RECOVERY_WAITING',{...ids,elapsedSeconds});nextHeartbeat=elapsedSeconds+30;}
    await delay(Math.max(0,Math.min(5000,deadline-Date.now())));
  }
  if(session?.status!=='complete'){throw fail('CANCELLATION_HOSTED_PAYMENT_TIMEOUT');}
  assert.equal(session.payment_status,'paid');fixture=await loadFixture();assert.equal(hash(historyCore(fixture)),originalCore);
  await assertAuditRetained(beforeAudit,fixture.audit);
  assert.equal(fixture.account.stripe_customer_id,customerId);assert.equal(fixture.account.stripe_subscription_id,null);
  assert.equal(fixture.account.initial_payment_verified,false);assert.equal(fixture.stock[0].status,'pending');
  const provider=await confirmedProvider(fixture);assert.equal(provider.session.id,sessionId);assert.equal(provider.subscription.status,'active');
  return {fixture,provider};
}

function paidBoundary(provider) {
  const item=provider.subscription.items.data[0],providerPeriodEnd=item.current_period_end||provider.subscription.current_period_end;
  const invoicePeriodEnd=provider.invoiceLines[0].period.end;
  assert.ok(Number.isSafeInteger(providerPeriodEnd));assert.equal(invoicePeriodEnd,providerPeriodEnd);
  const paidThrough=new Date(Math.min(invoicePeriodEnd,providerPeriodEnd)*1000).toISOString();assert.ok(Date.parse(paidThrough)>Date.now());
  return {providerPeriodEnd,paidThrough,periodStart:item.current_period_start||provider.subscription.current_period_start};
}

function assertPaidAccess(fixture,provider,boundary,{ending=null}={}) {
  assert.equal(provider.session.status,'complete');assert.equal(provider.subscription.status,'active');
  assert.deepEqual(paidBoundary(provider),boundary);assert.equal(fixture.account.stripe_subscription_id,provider.subscription.id);
  assert.equal(fixture.account.stripe_customer_id,provider.customer.id);assert.equal(fixture.account.quantity,1);
  assert.equal(fixture.account.subscription_status,'active');assert.equal(fixture.account.initial_payment_verified,true);
  assert.equal(iso(fixture.account.paid_through),boundary.paidThrough);assert.equal(entitlement(fixture.account).management,true);
  assert.equal(fixture.stock.length,1);assert.equal(fixture.stock[0].status,'promoted');
  assert.equal(fixture.properties.length,1);assert.equal(fixture.listings[0].opted_out,true);
  assert.equal(fixture.audit.filter(row=>row.action==='inventory.promoted').length,1);
  if(ending!==null){
    assert.equal(provider.subscription.cancel_at_period_end,ending);assert.equal(fixture.account.cancel_at_period_end,ending);
    assert.equal(entitlement(fixture.account).state,ending?'ending':'active');
  }
}

async function promotePaidSetup(fixture,provider) {
  const setupBefore=hash(fixture.setup),beforeAudit=fixture.audit,financialBefore=paidFinancialSnapshot(provider);
  const stagedBefore={...fixture.stock[0]};for(const key of ['status','promoted_at','promotion_command_id']){delete stagedBefore[key];}
  progress('refresh_paid_setup_and_promote_private_stock');
  const result=await createBillingService({store,stripe:readbackClient('refresh'),env}).refresh(operation);
  assert.equal(result.entitlement.state,'active');assert.equal(result.billedQuantity,1);assert.equal(result.inventoryQuantity,1);assert.deepEqual(result.pendingStock,[]);
  fixture=await loadFixture();await ensurePrivateStock(fixture);fixture=await loadFixture();
  assert.equal(hash(fixture.setup),setupBefore);assert.equal(fixture.target.command,null);
  const stagedAfter={...fixture.stock[0]};for(const key of ['status','promoted_at','promotion_command_id']){delete stagedAfter[key];}
  assert.deepEqual(stagedAfter,stagedBefore);await assertAuditRetained(beforeAudit,fixture.audit,{promotion:true});
  provider=await confirmedProvider(fixture);assert.deepEqual(paidFinancialSnapshot(provider),financialBefore);
  assertPaidAccess(fixture,provider,paidBoundary(provider),{ending:false});assert.equal(refreshProviderWrites,0);
  return {fixture,provider};
}

async function cleanupFixture() {
  cleanupAttempted=true;progress('cleanup_inspect_owned_effects');
  let fixture=await loadFixture();
  for(const value of [fixture.setup,fixture.target]){
    if(value.recovery?.state==='running'||value.recovery?.lease_until){throw fail('CANCELLATION_OPERATION_STILL_RUNNING');}
  }
  const beforeRetained=hash(historyCore(fixture)),beforeAudit=fixture.audit;
  let provider=await confirmedProvider(fixture),paidBefore=null;
  if(provider.session?.status==='open'){
    progress('expire_exact_unpaid_setup_session');cleanupPosts++;
    try{
      await stripe.request('POST','/v1/checkout/sessions/'+provider.session.id+'/expire',{},
        'quixo:'+fixture.setup.command.tenant_id+':'+fixture.setup.command.id+':acceptance-cleanup-expire');
    }catch{expiryResponseRecovered=true;}
    // If payment wins the expiry race, prove the same paid ownership chain and
    // cancel that subscription. Never repeat an ambiguous expire request.
    provider=await confirmedProvider(fixture);assert.ok(['expired','complete'].includes(provider.session?.status));
  }
  if(provider.session?.status==='complete'){
    paidBefore=paidFinancialSnapshot(provider);
    if(provider.subscription.status!=='canceled'){
      progress('cancel_exact_owned_subscription');cleanupCancellationRequests++;
      try{
        await stripe.request('DELETE','/v1/subscriptions/'+provider.subscription.id,{invoice_now:false,prorate:false},
          'quixo:'+fixture.setup.command.tenant_id+':'+fixture.setup.command.id+':acceptance-cleanup-subscription');
      }catch{cancellationResponseRecovered=true;}
      provider=await confirmedProvider(fixture);
    }
    assert.equal(provider.subscription.status,'canceled');assert.deepEqual(paidFinancialSnapshot(provider),paidBefore);
    // A paid setup effect can precede its local completion. In that case keep
    // its original unbound/pending history. Never recover either command here.
    // Completed setup may project cancellation via GET-only refresh, including
    // when the target is still pending; refresh cannot complete that target.
    if(fixture.setup.command.status==='completed'){
      await createBillingService({store,stripe:readbackClient('refresh'),env}).refresh(operation);
      fixture=await loadFixture();assert.equal(fixture.account.stripe_subscription_id,provider.subscription.id);
      assert.equal(fixture.account.subscription_status,'canceled');assert.equal(entitlement(fixture.account).management,false);
    }
    await ensurePrivateStock(fixture);
  }else if(provider.session){assert.equal(provider.session.status,'expired');}
  fixture=await loadFixture();assert.equal(hash(historyCore(fixture)),beforeRetained);await assertAuditRetained(beforeAudit,fixture.audit);
  if(fixture.properties.length){assert.equal(fixture.listings[0].opted_out,true);}
  if(paidBefore){
    provider=await confirmedProvider(fixture);assert.equal(provider.subscription.status,'canceled');assert.deepEqual(paidFinancialSnapshot(provider),paidBefore);
  }
  await verifyProtected();progress('deactivate_owned_fixture_preserving_history');
  await store.locked(operation,async q=>{
    const current=await q("SELECT status FROM dbo.tenants WHERE id=@operation AND name=@name AND slug=@slug AND [plan]='development-testing'",
      {operation,name:fixtureName,slug:'r5-cancellation-recovery-'+operation});assert.equal(current.length,1);
    const running=await q(`SELECT r.command_id FROM dbo.management_billing_recovery r JOIN dbo.management_billing_commands c ON c.id=r.command_id
      WHERE c.tenant_id=@operation AND (r.state='running' OR r.lease_until IS NOT NULL)`,{operation});assert.deepEqual(running,[]);
    await q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@operation AND app_user_id=@actor AND status='active'",
      {operation,actor:fixture.actor.id});
    await q("UPDATE dbo.app_users SET status='inactive' WHERE id=@actor AND tenant_id=@operation AND auth_id IS NULL AND status='active'",
      {operation,actor:fixture.actor.id});
    await q("UPDATE dbo.tenants SET status='inactive' WHERE id=@operation AND status='active'",{operation});
    const receipts=await q('SELECT id FROM dbo.management_billing_audit WHERE tenant_id=@operation AND action=@action AND resource_id=@operation',
      {operation,action:cleanupAction});assert.ok(receipts.length<=1);
    if(!receipts.length){
      await store.audit(q,{tenantId:operation,actorId:fixture.actor.id,action:cleanupAction,resourceId:operation,
        current:{operation,setupCommandId,scenario,customerId:provider.customer?.id||null,sessionId:provider.session?.id||null,
          sessionExpired:provider.session?.status==='expired',sessionCompleted:provider.session?.status==='complete',
          subscriptionId:provider.subscription?.id||null,subscriptionCanceled:provider.subscription?.status==='canceled',
          noSession:!provider.session,recordsRetained:true},
        reason:'Exact owned setup session closed or subscription canceled without invoice/proration; both operation histories and private fixture retained.'});
    }
  });
  const after=await loadFixture();assert.equal(after.tenant.status,'inactive');assert.equal(after.actor.status,'inactive');
  assert.equal(hash(historyCore(after)),beforeRetained);await assertAuditRetained(fixture.audit,after.audit,{cleanup:true});
  assert.equal(after.audit.filter(row=>row.action===cleanupAction).length,1);provider=await confirmedProvider(after);
  if(paidBefore){assert.equal(provider.subscription.status,'canceled');assert.deepEqual(paidFinancialSnapshot(provider),paidBefore);}
  else if(provider.session){assert.equal(provider.session.status,'expired');}
  if(after.properties.length){assert.equal(after.listings[0].opted_out,true);}
  assert.equal(refreshProviderWrites,0);await verifyProtected();cleanupVerified=true;
  emit('CANCELLATION_RECOVERY_CLEANUP',{targetCommandId:operation,setupCommandId,verified:true,fixtureInactive:true,
    sessionExpired:provider.session?.status==='expired',sessionCompleted:provider.session?.status==='complete',
    subscriptionCanceled:provider.subscription?.status==='canceled',
    cleanupKind:paidBefore?'paid-subscription-canceled':provider.session?'unpaid-session-expired':'no-checkout-effect',
    noSession:!provider.session,noSubscription:provider.subscriptions.length===0,noInvoice:provider.invoices.length===0,
    noPayment:provider.paymentIntents.length===0&&provider.charges.length===0,recordsRetained:true,targetJournalRetained:true,setupJournalRetained:true,
    pendingStockRetained:after.stock.filter(row=>row.status==='pending').length,promotedStockRetained:after.stock.filter(row=>row.status==='promoted').length,
    initialInvoicePreserved:Boolean(paidBefore),noAdditionalFinancialObjects:true,protectedBillingUnchanged:true,workerScopeUnchanged:true,
    cleanupPosts,cleanupCancellationRequests,expiryResponseRecovered,cancellationResponseRecovered});
  return {fixture:after,provider};
}

async function verify() {
  progress('preflight');await preflight();check('protected-baseline');
  progress('create_fresh_fixture');const actorId=await createFixture();
  let fixture=await loadFixture();assert.equal(fixture.stock.length,1);assert.equal(fixture.stock[0].status,'pending');
  assert.equal(fixture.setup.command,null);assert.equal(fixture.target.command,null);assert.deepEqual(await store.inventory(operation),[]);
  const inventory=await store.inventory(operation,undefined,{includePending:true});assert.equal(inventory.length,1);
  const setupArgs={tenantId:operation,actorId,id:setupCommandId,inventoryHash:hash(inventory)};
  check('fresh-isolated-fixture');
  // Setup returns both successful provider responses normally. Only the later
  // cancellation POST is interrupted; accepted Checkout loss cases stay closed.
  const setupClient={...stripe,request:async(method,path,body,key)=>{
    if(method==='GET'){return read(path,body);}
    assert.equal(method,'POST');
    if(path==='/v1/customers'){
      assert.equal(++customerPosts,1);customerKey=key;
      assert.equal(lower(body.metadata.quixo_operation),setupCommandId);assert.equal(lower(body.metadata.quixo_tenant),operation);
      assert.ok(!body.email&&!body.payment_method&&!body.test_clock);
      const customer=await stripe.request(method,path,body,key);customerId=customer.id;
      assert.match(customerId||'',/^cus_[A-Za-z0-9]+$/);assert.equal(customer.livemode,false);
      progress('customer_created_wait_for_normal_checkpoint');
      const command=(await store.read('SELECT created_at FROM dbo.management_billing_commands WHERE id=@id',{id:setupCommandId}))[0];
      await waitForCustomerEvent(key,customerId,command.created_at,body.metadata);return customer;
    }
    if(path==='/v1/checkout/sessions'){
      assert.equal(customerPosts,1);assert.equal(++checkoutPosts,1);checkoutKey=key;
      assert.equal(body.customer,customerId);assert.deepEqual(body.line_items,[{price:BILLING_PRICE,quantity:1}]);
      assert.equal(lower(body.metadata.quixo_operation),setupCommandId);assert.equal(lower(body.metadata.quixo_tenant),operation);
      const session=await stripe.request(method,path,body,key);sessionId=session.id;
      assert.match(sessionId||'',/^cs_test_[A-Za-z0-9]+$/);assert.equal(session.livemode,false);assert.equal(session.status,'open');
      assert.equal(objectId(session.customer),customerId);return session;
    }
    throw fail('CANCELLATION_SETUP_UNEXPECTED_WRITE');
  }};
  progress('normal_checkout_setup');const checkout=await createBillingService({store,stripe:setupClient,env}).checkout(setupArgs);
  assert.equal(checkout.sessionId,sessionId);assert.equal(new URL(checkout.url).origin,'https://checkout.stripe.com');
  fixture=await loadFixture();assert.equal(fixture.setup.command.status,'completed');assert.equal(fixture.setup.recovery.state,'succeeded');
  assert.equal(fixture.setup.recovery.attempts,1);assert.equal(fixture.setup.steps.length,2);assert.ok(fixture.setup.steps.every(step=>step.completed_at));
  assert.deepEqual(JSON.parse(fixture.setup.command.result_json),checkout);
  const customerStep=fixture.setup.steps.find(step=>step.name==='create_customer'),checkoutStep=fixture.setup.steps.find(step=>step.name==='create_checkout');
  assert.equal(customerStep.idempotency_key,customerKey);assert.equal(checkoutStep.idempotency_key,checkoutKey);
  assert.deepEqual(JSON.parse(customerStep.result_json),{customerId,eventId:customerEventId});
  assert.deepEqual(JSON.parse(checkoutStep.result_json),{sessionId,customerId});
  const events=await customerEvents(fixture,customerStep);assert.equal(events.length,1);assert.equal(events[0].id,customerEventId);
  assert.equal(operationAudits(fixture,'checkout',setupCommandId).length,1);assert.equal(fixture.target.command,null);
  assert.equal(customerPosts,1);assert.equal(checkoutPosts,1);assert.equal(responseDiscarded,false);check('normal-checkout-setup');
  let provider=await providerState(fixture);assert.equal(provider.customer.id,customerId);assert.equal(provider.session.id,sessionId);
  assert.equal(provider.session.status,'open');assert.equal(provider.sessions.length,1);check('unique-bound-checkout');
  ({fixture,provider}=await waitForHostedPayment(fixture));check('hosted-payment-completed');
  ({fixture,provider}=await promotePaidSetup(fixture,provider));check('paid-stock-promoted');
  const boundary=paidBoundary(provider),originalFinancials=paidFinancialSnapshot(provider),setupHistory=hash(fixture.setup);
  const originalStock=hash({stock:fixture.stock,properties:fixture.properties,units:fixture.units,listings:fixture.listings});
  const originalAccount=accountBusiness(fixture.account),beforeTargetAudit=fixture.audit;
  assertPaidAccess(fixture,provider,boundary,{ending:false});
  for(const field of ['cancel_at','canceled_at','ended_at']){assert.equal(provider.subscription[field]??null,null);}
  assert.equal(fixture.target.command,null);assert.equal(provider.subscription.schedule,null);assert.equal(fixture.account.stripe_schedule_id,null);
  check('paid-no-schedule-baseline');

  const args={tenantId:operation,actorId,id:operation,cancelAtPeriodEnd:true};
  const interrupted={...stripe,request:async(method,path,body,key)=>{
    if(method==='GET'){return read(path,body);}
    assert.equal(method,'POST');assert.equal(path,'/v1/subscriptions/'+provider.subscription.id);
    assert.deepEqual(body,{cancel_at_period_end:true});assert.equal(++cancellationPosts,1);cancellationKey=key;
    const result=await stripe.request(method,path,body,key);
    assert.equal(result.id,provider.subscription.id);assert.equal(result.livemode,false);assert.equal(objectId(result.customer),customerId);
    assert.equal(result.status,'active');assert.equal(result.cancel_at_period_end,true);assert.equal(objectId(result.schedule)||null,null);
    responseDiscarded=true;progress('cancellation_response_discarded');throw fail('CANCELLATION_ACCEPTANCE_RESPONSE_LOST');
  }};
  progress('cancel_at_period_end_with_response_loss');
  await assert.rejects(createBillingService({store,stripe:interrupted,env}).cancel(args),error=>error.code==='CANCELLATION_ACCEPTANCE_RESPONSE_LOST');
  assert.equal(responseDiscarded,true);assert.equal(cancellationPosts,1);fixture=await loadFixture();
  assert.equal(fixture.target.command.status,'pending');assert.equal(fixture.target.command.result_json,null);assert.equal(fixture.target.command.completed_at,null);
  assert.equal(fixture.target.recovery.state,'pending');assert.equal(fixture.target.recovery.attempts,1);
  assert.equal(fixture.target.recovery.last_error,'CANCELLATION_ACCEPTANCE_RESPONSE_LOST');
  assert.equal(fixture.target.recovery.lease_token,null);assert.equal(fixture.target.recovery.lease_until,null);
  assert.equal(fixture.target.steps.length,1);assert.equal(fixture.target.steps[0].name,'set_cancellation');
  assert.equal(fixture.target.steps[0].completed_at,null);assert.equal(fixture.target.steps[0].result_json,null);
  assert.equal(operationAudits(fixture,'cancellation',operation).length,0);check('cancellation-response-lost');
  assert.equal(cancellationKey,'quixo:'+fixture.target.command.tenant_id+':'+fixture.target.command.id);
  assert.equal(fixture.target.steps[0].idempotency_key,cancellationKey);
  assert.deepEqual(JSON.parse(fixture.target.steps[0].input_json),{subscriptionId:provider.subscription.id,cancelAtPeriodEnd:true});
  assert.equal(fixture.target.intent.scheduleId,null);assert.equal(hash(fixture.setup),setupHistory);
  await assertAuditRetained(beforeTargetAudit,fixture.audit);
  const pendingTarget=fixture.target,pendingAudit=fixture.audit;
  provider=await confirmedProvider(fixture);assert.equal(provider.subscription.cancel_at_period_end,true);
  assertPaidAccess(fixture,provider,boundary);assert.deepEqual(paidFinancialSnapshot(provider),originalFinancials);
  assert.deepEqual(accountBusiness(fixture.account),originalAccount);
  assert.equal(hash({stock:fixture.stock,properties:fixture.properties,units:fixture.units,listings:fixture.listings}),originalStock);
  check('original-cancellation-intent-preserved');
  progress('wait_for_natural_sql_retry_due');let due=false;
  for(let attempt=0;attempt<36;attempt++){
    const state=(await store.read(`SELECT state,attempts,CASE WHEN next_attempt_at<=SYSUTCDATETIME()
      AND lease_until IS NULL THEN 1 ELSE 0 END AS due FROM dbo.management_billing_recovery WHERE command_id=@operation`,{operation}))[0];
    assert.equal(state.state,'pending');assert.equal(state.attempts,1);
    if(state.due===1){due=true;break;}await delay(2500);
  }
  assert.ok(due);fixture=await loadFixture();assert.deepEqual(fixture.target,pendingTarget);assert.equal(hash(fixture.setup),setupHistory);
  await assertAuditRetained(pendingAudit,fixture.audit);check('naturally-due');
  const beforeRecoveryAudit=fixture.audit;progress('recover_original_cancellation_using_get_only');
  const result=await createBillingService({store,stripe:readbackClient('recovery'),env}).recoverOperation({tenantId:operation,id:operation});
  assert.deepEqual(result,{cancelAtPeriodEnd:true,paidThrough:boundary.paidThrough});assert.equal(recoveryProviderWrites,0);
  fixture=await loadFixture();assert.equal(fixture.target.command.status,'completed');assert.ok(fixture.target.command.completed_at);
  assert.deepEqual(immutableCommand(fixture.target.command),immutableCommand(pendingTarget.command));
  assert.deepEqual(JSON.parse(fixture.target.command.result_json),result);
  assert.equal(fixture.target.recovery.state,'succeeded');assert.equal(fixture.target.recovery.attempts,2);
  assert.equal(fixture.target.recovery.last_error,null);assert.equal(fixture.target.recovery.lease_token,null);assert.equal(fixture.target.recovery.lease_until,null);
  for(const field of ['command_id','actor_id','intent_json','created_at']){assert.deepEqual(fixture.target.recovery[field],pendingTarget.recovery[field]);}
  assert.equal(fixture.target.steps.length,1);const completedStep=fixture.target.steps[0];assert.ok(completedStep.completed_at);
  assert.deepEqual({...completedStep,result_json:null,completed_at:null},pendingTarget.steps[0]);
  assert.deepEqual(JSON.parse(completedStep.result_json),{subscriptionId:provider.subscription.id,cancelAtPeriodEnd:true});
  const recoveredAudits=operationAudits(fixture,'cancellation',operation);assert.equal(recoveredAudits.length,1);assert.equal(recoveredAudits[0].current_hash,hash(result));
  assert.equal(hash(fixture.setup),setupHistory);await assertAuditRetained(beforeRecoveryAudit,fixture.audit,{cancellation:true});
  provider=await confirmedProvider(fixture);assertPaidAccess(fixture,provider,boundary,{ending:true});check('original-cancellation-recovered');

  const completedHistory=hash(historyCore(fixture)),completedAudit=fixture.audit;
  const retryService=createBillingService({store,stripe:readbackClient('retry'),env});progress('exact_completed_cancellation_retries');
  assert.deepEqual(await retryService.cancel(args),result);
  assert.deepEqual(await retryService.reconcileCancellation({tenantId:operation,id:operation,actorId}),result);
  assert.deepEqual(await retryService.recoverOperation({tenantId:operation,id:operation}),result);
  fixture=await loadFixture();assert.equal(hash(historyCore(fixture)),completedHistory);await assertAuditRetained(completedAudit,fixture.audit);
  provider=await confirmedProvider(fixture);assertPaidAccess(fixture,provider,boundary,{ending:true});
  assert.deepEqual(paidFinancialSnapshot(provider),originalFinancials);assert.equal(retryProviderWrites,0);assert.equal(cancellationPosts,1);
  check('exact-operation-retries-stable');
  const beforeRefresh={account:stableAccount(fixture.account),audit:fixture.audit};
  const refreshService=createBillingService({store,stripe:readbackClient('refresh'),env});progress('refresh_and_retry_confirmed_ending_subscription');
  const refreshed=await refreshService.refresh(operation),refreshRetry=await refreshService.refresh(operation);
  assert.deepEqual(refreshRetry,refreshed);assert.equal(refreshed.entitlement.state,'ending');assert.equal(refreshed.entitlement.management,true);
  assert.equal(refreshed.cancelAtPeriodEnd,true);assert.equal(iso(refreshed.paidThrough),boundary.paidThrough);
  assert.equal(refreshed.billedQuantity,1);assert.equal(refreshed.inventoryQuantity,1);assert.deepEqual(refreshed.pendingStock,[]);assert.equal(refreshed.pendingOperation,null);
  fixture=await loadFixture();assert.equal(hash(historyCore(fixture)),completedHistory);assert.deepEqual(stableAccount(fixture.account),beforeRefresh.account);
  await assertAuditRetained(beforeRefresh.audit,fixture.audit);provider=await confirmedProvider(fixture);
  assertPaidAccess(fixture,provider,boundary,{ending:true});assert.equal(refreshProviderWrites,0);check('refresh-retry-stable');
  assert.deepEqual(paidFinancialSnapshot(provider),originalFinancials);assert.deepEqual(accountBusiness(fixture.account),originalAccount);
  assert.equal(hash({stock:fixture.stock,properties:fixture.properties,units:fixture.units,listings:fixture.listings}),originalStock);
  assert.equal(hash(fixture.setup),setupHistory);assert.equal(operationAudits(fixture,'checkout',setupCommandId).length,1);
  assert.equal(operationAudits(fixture,'cancellation',operation).length,1);
  for(const table of ['invoices','payments']){assert.equal((await store.read('SELECT id FROM dbo.'+table+' WHERE tenant_id=@operation',{operation})).length,0);}
  check('original-financials-stock-preserved');await verifyProtected();check('protected-scope-unchanged');
  const cleaned=await cleanupFixture();assert.equal(cleanupPosts,0);assert.equal(cleanupCancellationRequests,1);
  assert.deepEqual(paidFinancialSnapshot(cleaned.provider),originalFinancials);assert.equal(hash(historyCore(cleaned.fixture)),completedHistory);
  assert.equal(recoveryProviderWrites,0);assert.equal(retryProviderWrites,0);assert.equal(refreshProviderWrites,0);check('cleanup-retained');
  emit('CANCELLATION_RECOVERY_PASS',{passed:true,sandbox:true,checks,scope:'genuine sandbox provider + deployed service/SQL',
    targetCommandId:operation,setupCommandId,customerId,sessionId,customerEventId,
    originalCustomerKey:customerKey,originalCheckoutKey:checkoutKey,originalCancellationKey:cancellationKey,
    customerPosts,checkoutPosts,cancellationPosts,recoveryProviderWrites,retryProviderWrites,refreshProviderWrites,cleanupPosts,cleanupCancellationRequests,
    normalCheckoutSetup:true,hostedCheckoutCompleted:true,responseDiscarded,originalIdempotencyKeyPreserved:true,originalIntentPreserved:true,
    setupAttempts:1,setupCompletedSteps:2,targetAttempts:2,targetCompletedSteps:1,targetRecoveredAudits:1,releaseScheduleSteps:0,
    cancellationResult:result,paidThrough:boundary.paidThrough,providerPeriodEnd:boundary.providerPeriodEnd,cancelAtPeriodEnd:true,paidAccessRetained:true,
    exactCancelRetryStable:true,exactReconcileRetryStable:true,originalRecoveryRetryStable:true,refreshRetryStable:true,
    checkoutSessions:1,subscriptionsCreated:1,invoicesCreated:1,paymentIntentsCreated:1,chargesCreated:1,
    subscriptionId:provider.subscription.id,initialInvoiceId:provider.invoice.id,paymentIntentId:provider.paymentIntent.id,chargeId:provider.charge.id,
    initialInvoiceAmountMinor:500,currency:'usd',billedQuantity:1,actualProperties:1,actualUnits:0,promotionAuditCount:1,
    stockUnchanged:true,stockPrivate:true,promotedStockRetained:true,initialInvoicePreserved:true,noAdditionalFinancialObjects:true,
    subscriptionCanceled:true,sessionCompleted:true,sessionExpired:false,fixtureInactive:true,recordsRetained:true,
    protectedBillingUnchanged:true,workerScopeUnchanged:true,processLocalStagingReadiness:true,servingConfigurationChanged:false,
    automaticWorkerAccepted:false,httpAccepted:false,uiAccepted:false,credentialLoginAccepted:false,liveChargingEnabled:false,
    wholeProcessCrashAccepted:false,naturalPaidBoundaryAccepted:false,scheduleReleaseAccepted:false,cancellationReversalAccepted:false});
}

async function inspect() {
  progress('read_only_preflight');await preflight();
  let fixture=await loadFixture(),provider=await confirmedProvider(fixture);const after=await loadFixture();
  assert.deepEqual(historyCore(after),historyCore(fixture));await assertAuditRetained(fixture.audit,after.audit);
  assert.deepEqual(after.tenant,fixture.tenant);assert.deepEqual(after.actor,fixture.actor);assert.deepEqual(after.memberships,fixture.memberships);assert.deepEqual(after.listings,fixture.listings);
  fixture=after;provider=await confirmedProvider(fixture);
  if(fixture.account.stripe_subscription_id){
    assert.equal(fixture.account.stripe_subscription_id,provider.subscription.id);assert.equal(fixture.account.subscription_status,provider.subscription.status);
  }
  await verifyProtected();
  emit('CANCELLATION_RECOVERY_INSPECT',{readOnly:true,providerWrites:0,localWrites:0,targetCommandId:operation,setupCommandId,
    fixtureInactive:fixture.tenant.status==='inactive',setupCommandStatus:fixture.setup.command?.status||null,setupRecoveryState:fixture.setup.recovery?.state||null,
    setupAttempts:fixture.setup.recovery?.attempts||0,setupStepCount:fixture.setup.steps.length,setupCompletedSteps:fixture.setup.steps.filter(step=>step.completed_at).length,
    targetCommandStatus:fixture.target.command?.status||null,targetRecoveryState:fixture.target.recovery?.state||null,
    targetAttempts:fixture.target.recovery?.attempts||0,targetStepCount:fixture.target.steps.length,targetCompletedSteps:fixture.target.steps.filter(step=>step.completed_at).length,
    targetRecoveredAudits:operationAudits(fixture,'cancellation',operation).length,cleanupReceipts:fixture.audit.filter(row=>row.action===cleanupAction).length,
    customerId:provider.customer?.id||null,sessionId:provider.session?.id||null,sessionStatus:provider.session?.status||null,
    subscriptionId:provider.subscription?.id||null,subscriptionStatus:provider.subscription?.status||null,initialInvoiceId:provider.invoice?.id||null,
    checkoutSessions:provider.sessions.length,subscriptions:provider.subscriptions.length,invoices:provider.invoices.length,
    paymentIntents:provider.paymentIntents.length,charges:provider.charges.length,pendingStock:fixture.stock.filter(row=>row.status==='pending').length,
    promotedStock:fixture.stock.filter(row=>row.status==='promoted').length,actualProperties:fixture.properties.length,actualUnits:fixture.units.length,
    recordsRetained:true,protectedBillingUnchanged:true,workerScopeUnchanged:true,
    originalCustomerKey:fixture.setup.steps.find(step=>step.name==='create_customer')?.idempotency_key||null,
    originalCheckoutKey:fixture.setup.steps.find(step=>step.name==='create_checkout')?.idempotency_key||null,
    originalCancellationKey:fixture.target.steps[0]?.idempotency_key||null});
}

try{
  if(mode==='verify'){await verify();}
  else if(mode==='inspect'){await inspect();}
  else{progress('cleanup_preflight');await preflight();await cleanupFixture();}
}catch(error){
  const failedStage=stage;
  if(mode==='verify'&&fixtureCreated&&!cleanupAttempted){
    try{await cleanupFixture();}
    catch(cleanupError){
      emit('CANCELLATION_RECOVERY_CLEANUP_FAILED',{stage,code:/^[A-Z0-9_]{3,80}$/.test(cleanupError.code||'')?cleanupError.code:'UNCONFIRMED',
        sqlNumber:Number.isInteger(cleanupError.number)?cleanupError.number:null,fixtureRetained:true});
    }
  }
  // Assertion messages may contain a private normal-Checkout URL or payload.
  // Emit only the bounded error code and numeric SQL diagnostic, never either.
  emit('CANCELLATION_RECOVERY_FAILED',{stage:failedStage,code:/^[A-Z0-9_]{3,80}$/.test(error.code||'')?error.code:'UNCONFIRMED',
    sqlNumber:Number.isInteger(error.number)?error.number:null,fixtureCreated,cleanupVerified,
    fixtureRetained:(fixtureCreated||fixtureObserved)&&!cleanupVerified,setupCommandId,customerId,sessionId,
    customerPosts,checkoutPosts,cancellationPosts,recoveryProviderWrites,retryProviderWrites,refreshProviderWrites,cleanupPosts,cleanupCancellationRequests,
    expiryResponseRecovered,cancellationResponseRecovered,replayAllowed:false,acceptance:false});
  process.exitCode=1;
}finally{await closeMssqlPool();}

