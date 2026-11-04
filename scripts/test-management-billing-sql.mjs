import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {inspectManagementBilling} from './inspect-management-billing-schema.mjs';
import {inspectManagementBillingApplicationAccess} from './inspect-management-billing-access.mjs';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createBillingService} from '../src/api/managementBilling/service.js';
import {BILLING_PRICE,BILLING_PRODUCT,hash,problem} from '../src/api/managementBilling/contract.js';

export const verifyManagementBilling=async pool=>{
  const sql=fs.readFileSync('migrations/20261103_01_management_billing.sql','utf8');
  await pool.request().batch(sql);await pool.request().batch(sql);
  let result=await inspectManagementBilling(pool);assert.equal(result.satisfied,true,result.detail);
  await pool.request().query('ALTER TABLE dbo.management_billing_accounts NOCHECK CONSTRAINT CK_management_billing_sandbox');
  assert.equal((await inspectManagementBilling(pool)).satisfied,false);
  await pool.request().query('ALTER TABLE dbo.management_billing_accounts WITH CHECK CHECK CONSTRAINT CK_management_billing_sandbox');
  // Reproduce the production web identity: DML allowed, definitions hidden.
  await pool.request().batch(`CREATE USER billing_readiness_probe WITHOUT LOGIN;
    GRANT SELECT,INSERT,UPDATE ON dbo.management_pricing_versions TO billing_readiness_probe;
    GRANT SELECT,INSERT,UPDATE ON dbo.management_billing_accounts TO billing_readiness_probe;
    GRANT SELECT,INSERT,UPDATE ON dbo.management_billing_commands TO billing_readiness_probe;
    GRANT SELECT,INSERT ON dbo.management_billing_events TO billing_readiness_probe;
    GRANT SELECT,INSERT ON dbo.management_billing_audit TO billing_readiness_probe;
    DENY VIEW DEFINITION TO billing_readiness_probe;`);
  const restricted={request:()=>({query:statement=>pool.request().query(`
    EXECUTE AS USER='billing_readiness_probe'; BEGIN TRY
    ${statement}; REVERT; END TRY BEGIN CATCH REVERT; THROW; END CATCH;
  `)})};
  assert.equal((await inspectManagementBilling(restricted)).satisfied,false,'Hidden definitions cannot prove structural acceptance');
  assert.equal((await inspectManagementBillingApplicationAccess(restricted)).satisfied,true,'Runtime access does not require definition privileges');
  await pool.request().query('REVOKE INSERT ON dbo.management_billing_audit FROM billing_readiness_probe');
  assert.equal((await inspectManagementBillingApplicationAccess(restricted)).satisfied,false,'Missing audit write fails closed');
  await pool.request().query('GRANT INSERT ON dbo.management_billing_audit TO billing_readiness_probe');
  await pool.request().query('REVOKE SELECT ON dbo.management_billing_events FROM billing_readiness_probe');
  await assert.rejects(inspectManagementBillingApplicationAccess(restricted),'Missing read access fails closed');
  assert.equal((await pool.request().query('SELECT COUNT(*) AS n FROM dbo.management_billing_audit')).recordset[0].n,0,'Readiness creates no audit rows');
  await pool.request().query('DROP USER billing_readiness_probe');
  console.log('PASS: billing runtime restricted definitions, required DML, denied audit/read access and no writes');
  // Use the existing disposable migration proof actors, never production records.
  const actor=(await pool.request().query('SELECT TOP 1 id FROM dbo.app_users')).recordset[0];
  assert.ok(actor,'The migration proof must provide an actor fixture.');
  const store=createBillingStore({getPool:async()=>pool});
  const rules={market:'LK',billingCurrency:'USD',baseFeeMinor:500,rentCurrency:'LKR',includedRentMinor:null,
    excessPolicy:'pending',effectiveAt:null,reason:'Synthetic migration proof; no commercial policy approval.'};
  const attempts=await Promise.allSettled(Array.from({length:4},()=>store.savePricing({rules,expectedVersion:0,actorId:actor.id})));
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1,'Concurrent drafts cannot overwrite or reuse a market version.');
  assert.equal(attempts.filter(a=>a.status==='rejected'&&a.reason.code==='BILLING_STALE_VERSION').length,3);
  const versions=await store.listPricing();assert.equal(versions.length,1);assert.equal(versions[0].status,'draft');
  const audit=(await pool.request().query('SELECT COUNT(*) AS count FROM dbo.management_billing_audit')).recordset[0];
  assert.equal(audit.count,1,'One successful draft creates exactly one audit record.');
  await assert.rejects(store.locked('rollback-proof',async q=>{
    await q(`INSERT INTO dbo.management_pricing_versions(id,market,version,rules_json,created_by)
      VALUES(@id,'BN',1,@rules,@actor)`,{id:crypto.randomUUID(),rules:JSON.stringify({...rules,market:'BN'}),actor:actor.id});
    throw new Error('simulated failure');
  }),/simulated failure/);
  assert.equal((await store.listPricing()).length,1,'Failed transaction leaves no partial pricing version.');
  console.log('PASS: management billing double migration, constraint drift denial, concurrent version serialization and atomic audit/rollback');
  await verifyBillingTransactions(pool,store,actor.id);
};

// Real SQL transaction/uniqueness/locking proof. Stripe transport is explicitly a synthetic provider;
// this does not claim a real Checkout payment, webhook delivery, or merchant acceptance.
const verifyBillingTransactions=async(pool,store,actorId)=>{
  const tenantA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',tenantB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await pool.request().batch(`
    IF COL_LENGTH('dbo.tenants','plan') IS NULL ALTER TABLE dbo.tenants ADD [plan] NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.tenants','status') IS NULL ALTER TABLE dbo.tenants ADD status NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.properties','name') IS NULL ALTER TABLE dbo.properties ADD name NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.properties','propertytype') IS NULL ALTER TABLE dbo.properties ADD propertytype NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.property_units','unitnumber') IS NULL ALTER TABLE dbo.property_units ADD unitnumber NVARCHAR(100) NULL;
  `);
  const propA=crypto.randomUUID(),propB=crypto.randomUUID();
  await store.locked('fixture',async q=>{
    await q(`UPDATE dbo.tenants SET [plan]='development-testing',status='active' WHERE id IN(@a,@b)`,{a:tenantA,b:tenantB});
    for(const tenantId of [tenantA,tenantB])await q(`INSERT INTO dbo.tenant_memberships(id,tenant_id,app_user_id,status,role)
      VALUES(@id,@tenantId,@actorId,'active','admin')`,{id:crypto.randomUUID(),tenantId,actorId});
    for(const [id,tenantId] of [[propA,tenantA],[propB,tenantB]])await q(`INSERT INTO dbo.properties(id,tenant_id,name,propertytype,country_code)
      VALUES(@id,@tenantId,'Synthetic billing proof home','house','LK')`,{id,tenantId});
  });
  for(const tenantId of [tenantA,tenantB]) await store.enroll({tenantId,actorId,market:'LK',useApprovedSandboxBaseline:true,reason:'Synthetic SQL transaction acceptance only.'});
  const accounts=await store.read('SELECT tenant_id FROM dbo.management_billing_accounts');assert.equal(accounts.length,2);
  const remote=new Map(),idempotency=new Map(),calls=[];
  let customerCount=0,sessionCount=0,timeoutOnce=true,quantityTimeoutOnce=true;
  const price={id:BILLING_PRICE,product:BILLING_PRODUCT,active:true,livemode:false,type:'recurring',billing_scheme:'per_unit',currency:'usd',unit_amount:500,
    recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  const stripe={configured:()=>true,assertAccount:async()=>{},request:async(method,path,body={},key)=>{
    calls.push({method,path,body,key});
    if(method==='GET'){
      if(path===`/v1/prices/${BILLING_PRICE}`)return structuredClone(price);
      const value=remote.get(path);assert.ok(value,`Unhandled synthetic GET ${path}`);return structuredClone(value);
    }
    assert.ok(key,'All synthetic provider writes need idempotency keys.');
    const prior=idempotency.get(key);
    if(prior){assert.equal(prior.hash,hash({path,body}),'Retries must preserve the original provider operation');return structuredClone(prior.value);}
    let result;
    if(path==='/v1/customers')result={id:`cus_fixture${++customerCount}`,livemode:false};
    else if(path==='/v1/checkout/sessions'){
      result={id:`cs_fixture${++sessionCount}`,object:'checkout.session',customer:body.customer,mode:'subscription',livemode:false,status:'open',url:'https://checkout.stripe.com/c/pay/cs_fixture'};
      remote.set(`/v1/checkout/sessions/${result.id}`,result);
    }else if(path==='/v1/invoices/create_preview')result={total:1250,currency:'usd'};
    else if(path==='/v1/subscription_schedules'){
      const sub=remote.get(`/v1/subscriptions/${body.from_subscription}`);
      result={id:'sub_sched_fixture',customer:sub.customer,subscription:sub.id,status:'active',current_phase:{start_date:sub.items.data[0].current_period_start}};
      sub.schedule=result.id;remote.set(`/v1/subscription_schedules/${result.id}`,result);
    }else if(path==='/v1/subscription_schedules/sub_sched_fixture'){
      const schedule=remote.get(path);schedule.phases=body.phases;remote.get(`/v1/subscriptions/${schedule.subscription}`).items.data[0].quantity=body.phases[0].items[0].quantity;
      result=schedule;
    }else if(path==='/v1/subscription_schedules/sub_sched_fixture/release'){
      const schedule=remote.get('/v1/subscription_schedules/sub_sched_fixture');schedule.status='released';
      remote.get(`/v1/subscriptions/${schedule.subscription}`).schedule=null;result=schedule;
    }else if(path.startsWith('/v1/subscriptions/')){
      const sub=remote.get(path);assert.ok(sub);
      if(body.items)sub.items.data[0].quantity=body.items[0].quantity;
      if('cancel_at_period_end' in body)sub.cancel_at_period_end=body.cancel_at_period_end;
      result=sub;
    }else throw new Error(`Unhandled synthetic POST ${path}`);
    idempotency.set(key,{hash:hash({path,body}),value:structuredClone(result)});
    if(path==='/v1/checkout/sessions'&&timeoutOnce){timeoutOnce=false;throw problem(503,'STRIPE_UNAVAILABLE','Synthetic response loss after provider success.');}
    if(path.startsWith('/v1/subscriptions/')&&body.items&&quantityTimeoutOnce){quantityTimeoutOnce=false;throw problem(503,'STRIPE_UNAVAILABLE','Synthetic quantity response loss.');}
    return structuredClone(result);
  }};
  const service=createBillingService({store,stripe,env:{PUBLIC_APP_URL:'https://app.quixo.homes'}});
  const requestId=crypto.randomUUID();const inventoryHash=hash(await store.inventory(tenantA));
  await assert.rejects(service.checkout({tenantId:tenantA,actorId,id:requestId,inventoryHash}),{code:'STRIPE_UNAVAILABLE'});
  assert.equal((await store.account(tenantA)).stripe_customer_id,null,'A rolled-back SQL transaction must not claim a remote binding.');
  await assert.rejects(service.checkout({tenantId:tenantA,actorId,id:crypto.randomUUID(),inventoryHash}),{code:'BILLING_COMMAND_PENDING'});
  const session=await service.checkout({tenantId:tenantA,actorId,id:requestId,inventoryHash});
  assert.equal(sessionCount,1);assert.equal(customerCount,1,'Retry after ambiguous success must not create another customer.');
  assert.equal((await service.summary(tenantA)).entitlement.management,false,'Checkout redirect is not initial payment proof.');
  const repeated=await service.checkout({tenantId:tenantA,actorId,id:requestId,inventoryHash});assert.equal(repeated.sessionId,session.sessionId);
  await assert.rejects(service.checkout({tenantId:tenantB,actorId,id:requestId,inventoryHash:hash(await store.inventory(tenantB))}),{code:'BILLING_REQUEST_CONFLICT'});
  const checkout=remote.get(`/v1/checkout/sessions/${session.sessionId}`);
  const time=Math.floor(Date.now()/1000),sub={id:'sub_fixtureA',object:'subscription',customer:checkout.customer,livemode:false,status:'active',latest_invoice:'in_fixtureA',cancel_at_period_end:false,
    items:{data:[{id:'si_fixtureA',price,quantity:1,current_period_start:time-1000,current_period_end:time+2592000}]}};
  const invoice={id:'in_fixtureA',object:'invoice',livemode:false,customer:checkout.customer,parent:{subscription_details:{subscription:sub.id}},currency:'usd',status:'paid',amount_due:500,amount_paid:500,amount_remaining:0,
    lines:{data:[{id:'il_fixture',parent:{subscription_item_details:{subscription_item:'si_fixtureA',proration:false}},period:{end:time+2592000}}],has_more:false}};
  checkout.status='complete';checkout.subscription=sub.id;remote.set(`/v1/subscriptions/${sub.id}`,sub);remote.set('/v1/invoices/in_fixtureA',invoice);
  const event={id:'evt_fixturePaid',type:'invoice.paid',livemode:false,data:{object:invoice}};remote.set(`/v1/events/${event.id}`,event);
  const deliveries=await Promise.all([service.webhook(event),service.webhook(event)]);
  assert.equal(deliveries.filter(x=>x.duplicate).length,1);
  assert.equal((await service.summary(tenantA)).entitlement.management,true);
  assert.equal((await service.summary(tenantB)).entitlement.management,false);
  const crossEvent={id:'evt_fixtureCross',type:'invoice.paid',livemode:false,data:{object:{...invoice,parent:{subscription_details:{subscription:'sub_foreign'}}}}};remote.set(`/v1/events/${crossEvent.id}`,crossEvent);
  await assert.rejects(service.webhook(crossEvent),{code:'BILLING_EVENT_SUBSCRIPTION_MISMATCH'});
  const unit1=crypto.randomUUID(),unit2=crypto.randomUUID();
  await store.locked(tenantA,async q=>{
    for(const id of [unit1,unit2])await q('INSERT INTO dbo.property_units(id,tenant_id,propertyid,unitnumber) VALUES(@id,@tenantId,@propertyId,@number)',
      {id,tenantId:tenantA,propertyId:propA,number:id.slice(0,8)});
  });
  const increase=await service.quantityPreview({tenantId:tenantA,id:crypto.randomUUID(),actorId});assert.equal(increase.to,2);
  const increaseCommand=crypto.randomUUID();
  await assert.rejects(service.quantityApply({tenantId:tenantA,id:increaseCommand,actorId,previewId:increase.previewId}),{code:'STRIPE_UNAVAILABLE'});
  await service.quantityApply({tenantId:tenantA,id:increaseCommand,actorId,previewId:increase.previewId});
  assert.equal((await store.account(tenantA)).quantity,2);
  const change=calls.find(c=>c.path===`/v1/subscriptions/${sub.id}`&&c.body.items);
  assert.equal(change.body.proration_behavior,'create_prorations');assert.equal(change.body.proration_date,increase.prorationDate);
  assert.equal(calls.some(c=>c.path==='/v1/invoices'||c.body.proration_behavior==='always_invoice'),false,'Routine quantity addition must not collect immediately.');
  await store.locked(tenantA,q=>q('DELETE dbo.property_units WHERE id=@id',{id:unit2}));
  const reduction=await service.quantityPreview({tenantId:tenantA,id:crypto.randomUUID(),actorId});
  await service.quantityApply({tenantId:tenantA,id:crypto.randomUUID(),actorId,previewId:reduction.previewId});
  assert.equal((await store.account(tenantA)).quantity,2);assert.equal((await store.account(tenantA)).pending_quantity,1);
  const schedule=remote.get('/v1/subscription_schedules/sub_sched_fixture');assert.equal(schedule.phases[1].items[0].quantity,1);
  await service.cancel({tenantId:tenantA,id:crypto.randomUUID(),actorId,cancelAtPeriodEnd:true});
  assert.equal(schedule.status,'released');assert.equal(sub.cancel_at_period_end,true);assert.equal((await store.account(tenantA)).pending_quantity,null);
  await assert.rejects(service.quantityPreview({tenantId:tenantB,id:crypto.randomUUID(),actorId}),{code:'BILLING_GOOD_STANDING_REQUIRED'});
  assert.equal((await service.summary(tenantB)).pendingOperation,null,'A validation rejection cannot strand the workspace behind a pending command.');
  await store.locked(tenantB,q=>q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId:tenantB,actorId}));
  await assert.rejects(service.checkout({tenantId:tenantB,id:crypto.randomUUID(),actorId,inventoryHash:hash(await store.inventory(tenantB))}),{code:'BILLING_ADMIN_REQUIRED'});
  console.log('PASS: real SQL two-organization billing isolation, ambiguous checkout recovery, first payment, duplicate/out-of-order binding, quantity proration, deferred decrease and schedule cancellation; synthetic Stripe transport');
};
