import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {inspectManagementBilling,inspectManagementInventoryStaging,inspectManagementCessation} from './inspect-management-billing-schema.mjs';
import {inspectManagementBillingApplicationAccess} from './inspect-management-billing-access.mjs';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createBillingService} from '../src/api/managementBilling/service.js';
import {BILLING_PRICE,BILLING_PRODUCT,hash,problem} from '../src/api/managementBilling/contract.js';

export const verifyManagementBilling=async pool=>{
  const sql=fs.readFileSync('migrations/20261103_01_management_billing.sql','utf8');
  await pool.request().batch(sql);await pool.request().batch(sql);
  const stagedSql=fs.readFileSync('migrations/20261110_01_management_inventory_staging.sql','utf8');
  await pool.request().batch(stagedSql);await pool.request().batch(stagedSql);
  const stagedSchema=await inspectManagementInventoryStaging(pool);assert.equal(stagedSchema.satisfied,true,stagedSchema.detail);
  await pool.request().query('ALTER TABLE dbo.management_inventory_staging NOCHECK CONSTRAINT CK_management_inventory_promotion');
  assert.equal((await inspectManagementInventoryStaging(pool)).satisfied,false,'An untrusted/disabled promotion constraint fails inspection');
  await pool.request().query('ALTER TABLE dbo.management_inventory_staging WITH CHECK CHECK CONSTRAINT CK_management_inventory_promotion');
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
    for(const tenantId of [tenantA,tenantB]){await q(`INSERT INTO dbo.tenant_memberships(id,tenant_id,app_user_id,status,role)
      VALUES(@id,@tenantId,@actorId,'active','admin')`,{id:crypto.randomUUID(),tenantId,actorId});}
    for(const [id,tenantId] of [[propA,tenantA],[propB,tenantB]]){await q(`INSERT INTO dbo.properties(id,tenant_id,name,propertytype,country_code)
      VALUES(@id,@tenantId,'Synthetic billing proof home','house','LK')`,{id,tenantId});}
  });
  for(const tenantId of [tenantA,tenantB]) {await store.enroll({tenantId,actorId,market:'LK',useApprovedSandboxBaseline:true,reason:'Synthetic SQL transaction acceptance only.'});}
  const accounts=await store.read('SELECT tenant_id FROM dbo.management_billing_accounts');assert.equal(accounts.length,2);
  const compChange={tenantId:tenantB,actorId,mode:'fixed',expiresAt:new Date(Date.now()+3600000).toISOString(),
    expectedVersion:1,reason:'Synthetic complimentary-access acceptance only.'};
  const comp=await store.setComplimentary(compChange);
  assert.equal(comp.entitlement.management,true);assert.equal(comp.version,2);
  await assert.rejects(store.setComplimentary(compChange),{code:'BILLING_STALE_VERSION'});
  await store.locked(tenantB,q=>q('UPDATE dbo.management_billing_accounts SET comp_expires_at=DATEADD(SECOND,-1,SYSUTCDATETIME()) WHERE tenant_id=@tenantId',{tenantId:tenantB}));
  assert.equal((await store.complimentaryStatus(tenantB)).entitlement.management,false,'Expiry applies without a scheduled job');
  const ongoing=await store.setComplimentary({...compChange,mode:'ongoing',expiresAt:null,expectedVersion:2});
  assert.equal(ongoing.entitlement.state,'complimentary');
  const revoked=await store.setComplimentary({...compChange,mode:'revoke',expiresAt:null,expectedVersion:ongoing.version});
  assert.equal(revoked.entitlement.management,false);assert.equal(revoked.mode,null);
  const compAudit=await store.read("SELECT action FROM dbo.management_billing_audit WHERE tenant_id=@tenantId AND action LIKE 'sandbox.complimentary.%'",{tenantId:tenantB});
  assert.equal(compAudit.length,3,'Stale writes produce no duplicate grant or audit');
  console.log('PASS: complimentary fixed-term expiry, ongoing grant, revoke, stale-write rejection and durable audit');
  const remote=new Map(),idempotency=new Map(),calls=[];
  let customerCount=0,sessionCount=0,timeoutOnce=true,quantityTimeoutOnce=true,scheduleMismatchOnce=true;
  const price={id:BILLING_PRICE,product:BILLING_PRODUCT,active:true,livemode:false,type:'recurring',billing_scheme:'per_unit',currency:'usd',unit_amount:500,
    recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  const stripe={configured:()=>true,assertAccount:async()=>{},request:async(method,path,body={},key)=>{
    calls.push({method,path,body,key});
    if(method==='GET'){
      if(path===`/v1/prices/${BILLING_PRICE}`){return structuredClone(price);}
      if(path==='/v1/events') {return {data:[...remote.values()].filter(value=>value.type===body.type && value.created>=body.created.gte),has_more:false};}
      const value=remote.get(path);assert.ok(value,`Unhandled synthetic GET ${path}`);return structuredClone(value);
    }
    assert.ok(key,'All synthetic provider writes need idempotency keys.');
    const prior=idempotency.get(key);
    if(prior){assert.equal(prior.hash,hash({path,body}),'Retries must preserve the original provider operation');return structuredClone(prior.value);}
    let result;
    if(path==='/v1/customers'){result={id:`cus_fixture${++customerCount}`,livemode:false};}
    else if(path==='/v1/checkout/sessions'){
      result={id:`cs_fixture${++sessionCount}`,object:'checkout.session',customer:body.customer,mode:'subscription',livemode:false,status:'open',url:'https://checkout.stripe.com/c/pay/cs_fixture'};
      remote.set(`/v1/checkout/sessions/${result.id}`,result);
    }else if(path==='/v1/invoices/create_preview'){result={total:1250,currency:'usd'};}
    else if(path==='/v1/subscription_schedules'){
      const sub=remote.get(`/v1/subscriptions/${body.from_subscription}`);
      result={id:sub.id==='sub_fixtureA'?'sub_sched_fixture':'sub_sched_staged',customer:sub.customer,subscription:sub.id,status:'active',current_phase:{start_date:sub.items.data[0].current_period_start}};
      sub.schedule=result.id;remote.set(`/v1/subscription_schedules/${result.id}`,result);
    }else if(path.startsWith('/v1/subscription_schedules/')&&!path.endsWith('/release')){
      const schedule=remote.get(path);schedule.phases=body.phases;schedule.end_behavior=body.end_behavior;remote.get(`/v1/subscriptions/${schedule.subscription}`).items.data[0].quantity=body.phases[0].items[0].quantity;
      result=schedule;
    }else if(path.startsWith('/v1/subscription_schedules/')&&path.endsWith('/release')){
      const schedule=remote.get(path.slice(0,-8));schedule.status='released';
      remote.get(`/v1/subscriptions/${schedule.subscription}`).schedule=null;result=schedule;
    }else if(path.startsWith('/v1/subscriptions/')){
      const sub=remote.get(path);assert.ok(sub);
      if(body.items){sub.items.data[0].quantity=body.items[0].quantity;}
      if('cancel_at_period_end' in body){sub.cancel_at_period_end=body.cancel_at_period_end;}
      result=sub;
    }else {throw new Error(`Unhandled synthetic POST ${path}`);}
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
  // Persisted receiver proof with synthetic provider state, never a genuine renewal.
  const firstFailedAt=time-2*86400;
  invoice.status='open';invoice.amount_paid=0;invoice.amount_remaining=500;
  invoice.attempted=true;invoice.created=firstFailedAt-3600;invoice.period_end=time+28*86400;
  sub.status='past_due';
  const failedEvent=(id,created)=>({id,type:'invoice.payment_failed',livemode:false,created,data:{object:structuredClone(invoice)}});
  const firstFailed=failedEvent('evt_fixtureFirstFailure',firstFailedAt);
  const retriedFailure=failedEvent('evt_fixtureRetryFailure',time-86400);
  remote.set(`/v1/events/${firstFailed.id}`,firstFailed);
  remote.set(`/v1/events/${retriedFailure.id}`,retriedFailure);
  // Newest notification arrives first; lookup must still pin the earliest attempt.
  const normalRequest=stripe.request;
  let failLookup=true;
  stripe.request=async(...args)=>{
    if(args[1]==='/v1/events'&&failLookup){failLookup=false;throw problem(503,'STRIPE_UNAVAILABLE','Synthetic history lookup interruption.');}
    return normalRequest(...args);
  };
  const beforeFailure=await store.account(tenantA);
  await assert.rejects(service.webhook(retriedFailure),{code:'STRIPE_UNAVAILABLE'});
  assert.equal((await store.account(tenantA)).subscription_status,beforeFailure.subscription_status,'Failed reconciliation rolls back account changes');
  assert.equal((await store.read('SELECT stripe_event_id FROM dbo.management_billing_events WHERE stripe_event_id=@id',{id:retriedFailure.id})).length,0,'Failed event remains retryable');
  await service.webhook(retriedFailure);
  const graceAccount=await store.account(tenantA);
  assert.equal(new Date(graceAccount.grace_started_at).getTime(),firstFailedAt*1000);
  assert.equal((await service.summary(tenantA)).entitlement.state,'grace');
  await service.webhook(firstFailed);
  assert.equal((await service.webhook(retriedFailure)).duplicate,true);
  assert.equal(new Date((await store.account(tenantA)).grace_started_at).getTime(),firstFailedAt*1000,'Delayed and duplicate events do not extend grace');
  const failureLedger=await store.read("SELECT stripe_event_id FROM dbo.management_billing_events WHERE tenant_id=@tenantId AND event_type='invoice.payment_failed'",{tenantId:tenantA});
  assert.equal(failureLedger.length,2);
  assert.equal((await service.summary(tenantB)).entitlement.management,false,'Failure does not cross organization scope');
  invoice.status='paid';invoice.amount_paid=500;invoice.amount_remaining=0;sub.status='active';
  const recovery={id:'evt_fixtureRecovery',type:'invoice.paid',livemode:false,data:{object:structuredClone(invoice)}};
  remote.set(`/v1/events/${recovery.id}`,recovery);
  // Fail after projection writes but before event/audit completion: all must roll back.
  await pool.request().batch(`CREATE TRIGGER dbo.billing_fixture_receiver_rollback ON dbo.management_billing_events
    AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE stripe_event_id='evt_fixtureRecovery')
    THROW 51001, 'Synthetic receiver rollback proof', 1; END`);
  const auditBefore=(await store.read('SELECT COUNT(*) AS n FROM dbo.management_billing_audit WHERE tenant_id=@tenantId',{tenantId:tenantA}))[0].n;
  try {
    await assert.rejects(service.webhook(recovery),/Synthetic receiver rollback proof/);
    assert.equal((await store.account(tenantA)).subscription_status,'past_due');
    assert.equal((await store.read('SELECT stripe_event_id FROM dbo.management_billing_events WHERE stripe_event_id=@id',{id:recovery.id})).length,0);
    assert.equal((await store.read('SELECT COUNT(*) AS n FROM dbo.management_billing_audit WHERE tenant_id=@tenantId',{tenantId:tenantA}))[0].n,auditBefore);
  } finally {
    await pool.request().query('DROP TRIGGER dbo.billing_fixture_receiver_rollback');
  }
  await service.webhook(recovery);
  assert.equal((await store.account(tenantA)).grace_started_at,null);
  assert.equal((await service.summary(tenantA)).entitlement.management,true);
  const lateFailure={...firstFailed,id:'evt_fixtureLateFailure'};
  remote.set(`/v1/events/${lateFailure.id}`,lateFailure);
  await service.webhook(lateFailure);
  assert.equal((await service.summary(tenantA)).entitlement.state,'active','Old failure cannot overwrite recovered provider state');
  stripe.request=normalRequest;
  console.log('PASS: synthetic delayed first failure, durable receiver retry/rollback, duplicate and out-of-order events, grace pinning, recovery and two-organization isolation');
  const unit1=crypto.randomUUID(),unit2=crypto.randomUUID();
  await store.locked(tenantA,async q=>{
    for(const id of [unit1,unit2]){await q('INSERT INTO dbo.property_units(id,tenant_id,propertyid,unitnumber) VALUES(@id,@tenantId,@propertyId,@number)',
      {id,tenantId:tenantA,propertyId:propA,number:id.slice(0,8)});}
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
  const reductionCommand=crypto.randomUUID();
  const regularRequest=stripe.request;
  stripe.request=async(...args)=>{
    const result=await regularRequest(...args);
    if(args[0]==='GET'&&args[1]==='/v1/subscription_schedules/sub_sched_fixture'&&result.phases&&scheduleMismatchOnce){
      scheduleMismatchOnce=false;result.phases[1].items[0].quantity=99;
    }
    return result;
  };
  await assert.rejects(service.quantityApply({tenantId:tenantA,id:reductionCommand,actorId,previewId:reduction.previewId}),{code:'BILLING_SCHEDULE_UNCONFIRMED'});
  assert.equal((await service.summary(tenantA)).pendingOperation.id.toLowerCase(),reductionCommand,'Unconfirmed future quantity remains recoverable');
  await service.quantityApply({tenantId:tenantA,id:reductionCommand,actorId,previewId:reduction.previewId});
  assert.equal((await store.account(tenantA)).quantity,2);assert.equal((await store.account(tenantA)).pending_quantity,1);
  const schedule=remote.get('/v1/subscription_schedules/sub_sched_fixture');assert.equal(schedule.phases[1].items[0].quantity,1);
  await service.cancel({tenantId:tenantA,id:crypto.randomUUID(),actorId,cancelAtPeriodEnd:true});
  assert.equal(schedule.status,'released');assert.equal(sub.cancel_at_period_end,true);assert.equal((await store.account(tenantA)).pending_quantity,null);
  await service.cancel({tenantId:tenantA,id:crypto.randomUUID(),actorId,cancelAtPeriodEnd:false});
  // A disposable fixture with no obligations can remove its final dwelling.
  // This proves billing behavior only, not the separate management-cessation control.
  await store.locked(tenantA,async q=>{
    await q('DELETE dbo.property_units WHERE propertyid=@id',{id:propA});
    // Property insertion creates a private listing preference. Remove this
    // disposable child before its parent; retain the production FK protection.
    await q('DELETE dbo.public_listing_preferences WHERE property_id=@id AND tenant_id=@tenantId',{id:propA,tenantId:tenantA});
    await q('DELETE dbo.properties WHERE id=@id',{id:propA});
  });
  const zeroPreview=await service.quantityPreview({tenantId:tenantA,id:crypto.randomUUID(),actorId});
  assert.equal(zeroPreview.to,0);assert.equal(zeroPreview.timing,'cancel_at_renewal');
  const zeroCommand=crypto.randomUUID();let zeroResponseLost=true;
  stripe.request=async(...args)=>{
    const result=await regularRequest(...args);
    if(args[0]==='POST'&&args[1]===`/v1/subscriptions/${sub.id}`&&args[2]?.cancel_at_period_end&&zeroResponseLost){
      zeroResponseLost=false;throw problem(503,'STRIPE_UNAVAILABLE','Synthetic cancellation response loss after success.');
    }
    return result;
  };
  await assert.rejects(service.quantityApply({tenantId:tenantA,id:zeroCommand,actorId,previewId:zeroPreview.previewId}),{code:'STRIPE_UNAVAILABLE'});
  assert.equal((await service.summary(tenantA)).pendingOperation.id.toLowerCase(),zeroCommand);
  // A separate readback can observe ending before the interrupted command resumes.
  await service.refresh(tenantA);
  assert.equal((await service.summary(tenantA)).entitlement.state,'ending');
  await store.locked(tenantA,q=>q(`UPDATE dbo.management_billing_commands SET created_at=DATEADD(HOUR,-48,SYSUTCDATETIME()) WHERE id=@id`,{id:zeroCommand}));
  await assert.rejects(service.quantityApply({tenantId:tenantA,id:zeroCommand,actorId,previewId:zeroPreview.previewId}),{code:'BILLING_RECONCILIATION_REQUIRED'});
  const postsBeforeRecovery=calls.filter(call=>call.method==='POST').length;
  await assert.rejects(service.reconcileCancellation({tenantId:tenantB,id:zeroCommand,actorId}),{code:'BILLING_COMMAND_NOT_FOUND'});
  const zeroResult=await service.reconcileCancellation({tenantId:tenantA,id:zeroCommand,actorId});
  assert.equal(zeroResult.cancelAtPeriodEnd,true);assert.equal(zeroResult.currentQuantity,2);
  assert.equal((await store.account(tenantA)).pending_quantity,0);
  assert.deepEqual(await service.quantityApply({tenantId:tenantA,id:zeroCommand,actorId,previewId:zeroPreview.previewId}),zeroResult);
  assert.deepEqual(await service.reconcileCancellation({tenantId:tenantA,id:zeroCommand,actorId}),zeroResult);
  assert.equal(calls.filter(call=>call.method==='POST').length,postsBeforeRecovery,'Aged cancellation recovery never replays provider writes');
  assert.equal((await store.read(`SELECT id FROM dbo.management_billing_audit WHERE resource_id=@id AND action='sandbox.quantity_apply.reconciled'`,{id:zeroCommand})).length,1,'Recovery completion and audit are durable exactly once');
  assert.equal(calls.some(c=>c.body.items?.some(i=>i.quantity===0)||c.body.phases?.some(p=>p.items.some(i=>i.quantity===0))),false);
  await assert.rejects(service.cancel({tenantId:tenantA,id:crypto.randomUUID(),actorId,cancelAtPeriodEnd:false}),{code:'BILLING_INVENTORY_EMPTY'});
  assert.equal((await service.summary(tenantA)).pendingOperation,null);
  console.log('PASS: zero-stock cancellation at renewal, retained current quantity, ambiguous-success retry, durable result and empty-stock renewal denial; synthetic Stripe transport');
  await assert.rejects(service.quantityPreview({tenantId:tenantB,id:crypto.randomUUID(),actorId}),{code:'BILLING_GOOD_STANDING_REQUIRED'});
  assert.equal((await service.summary(tenantB)).pendingOperation,null,'A validation rejection cannot strand the workspace behind a pending command.');
  await store.locked(tenantB,q=>q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId:tenantB,actorId}));
  await assert.rejects(service.checkout({tenantId:tenantB,id:crypto.randomUUID(),actorId,inventoryHash:hash(await store.inventory(tenantB))}),{code:'BILLING_ADMIN_REQUIRED'});
  console.log('PASS: real SQL two-organization billing isolation, ambiguous checkout recovery, first payment, duplicate/out-of-order binding, quantity proration, deferred decrease and schedule cancellation; synthetic Stripe transport');
  await verifyStagedStock(pool,actorId,stripe,remote,price,invoice,calls);
};

const verifyStagedStock=async(pool,actorId,stripe,remote,price,invoice,calls)=>{
  const tenantId=crypto.randomUUID(),parent=crypto.randomUUID(),unit1=crypto.randomUUID(),unit2=crypto.randomUUID(),unit3=crypto.randomUUID();
  const store=createBillingStore({getPool:async()=>pool,env:{MANAGEMENT_INVENTORY_SCHEMA_READY:'true'}});
  const service=createBillingService({store,stripe,env:{PUBLIC_APP_URL:'https://app.quixo.homes'}});
  await pool.request().batch(`
    IF COL_LENGTH('dbo.properties','rentalvalues') IS NULL ALTER TABLE dbo.properties ADD rentalvalues NVARCHAR(MAX) NULL;
    IF COL_LENGTH('dbo.property_units','status') IS NULL ALTER TABLE dbo.property_units ADD status NVARCHAR(50) NULL;
  `);
  await store.locked(tenantId,async q=>{
    await q(`INSERT INTO dbo.tenants(id,slug,status,[plan]) VALUES(@tenantId,@slug,'active','development-testing')`,{tenantId,slug:`staged-${tenantId}`});
    await q(`INSERT INTO dbo.tenant_memberships(id,tenant_id,app_user_id,status,role) VALUES(@id,@tenantId,@actorId,'active','admin')`,{id:crypto.randomUUID(),tenantId,actorId});
  });
  const metadata={address:'Fixture address',description:'Retained prepared description',unitconfiguration:'Two units',
    bank_name:'Fixture Bank',bank_branch:'Fixture Branch',bank_account_number:'000123',
    checklistitems:['Keys'],terms:{notice:'One month'},images:[{image_url:`/storage/images/tenants/${tenantId}/properties/front.gif`,image_type:'exterior',order:0}],
    availablefrom:'2026-12-01T00:00:00.000Z',squarefeet:950.5,yearbuilt:2020,amenities:['Parking'],
    electricity_rate:32.5,water_rate:15,latitude:6.9271,longitude:79.8612};
  const columnTypes={address:'NVARCHAR(MAX)',description:'NVARCHAR(MAX)',unitconfiguration:'NVARCHAR(255)',
    bank_name:'NVARCHAR(255)',bank_branch:'NVARCHAR(255)',bank_account_number:'NVARCHAR(255)',
    checklistitems:'NVARCHAR(MAX)',terms:'NVARCHAR(MAX)',images:'NVARCHAR(MAX)',availablefrom:'DATETIMEOFFSET',
    squarefeet:'DECIMAL(18,2)',yearbuilt:'INT',amenities:'NVARCHAR(MAX)',electricity_rate:'DECIMAL(18,4)',water_rate:'DECIMAL(18,4)',
    latitude:'DECIMAL(10,7)',longitude:'DECIMAL(10,7)'};
  for(const [column,type] of Object.entries(columnTypes)){
    await pool.request().batch(`IF COL_LENGTH('dbo.properties','${column}') IS NULL ALTER TABLE dbo.properties ADD [${column}] ${type} NULL;`);
  }
  const property={kind:'property',payload:{id:parent,name:'Prepared building',propertytype:'apartment',country_code:'LK',rentalvalues:{listingCategory:'residential',rent:80000,deposit:160000},availability:'maintenance',...metadata}};
  const unitMetadata={bank_name:'Unit bank',bank_branch:'Unit branch',bank_account_number:'000456',terms:{notice:'One month'},rentalvalues:{rent:30000,deposit:60000},floor:'Ground',bedrooms:2,bathrooms:1,squarefeet:500.5,description:'Prepared unit'};
  for(const [column,type] of Object.entries({...columnTypes,rentalvalues:'NVARCHAR(MAX)',floor:'NVARCHAR(100)',bedrooms:'INT',bathrooms:'INT'}).filter(([column])=>Object.hasOwn(unitMetadata,column))){
    await pool.request().batch(`IF COL_LENGTH('dbo.property_units','${column}') IS NULL ALTER TABLE dbo.property_units ADD [${column}] ${type} NULL;`);
  }
  const unit=id=>({kind:'unit',payload:{id,propertyid:parent,unitnumber:id.slice(0,8),availability:'reserved',...unitMetadata}});
  const stage={tenantId,actorId,records:[unit(unit1),property,unit(unit2)],reason:'Disposable staged stock acceptance only.'};
  for(const image_url of [`/storage/images/tenants/${actorId}/properties/foreign.png`,'https://untrusted.invalid/photo.png']){
    assert.throws(()=>store.stageStock({...stage,records:[{...property,payload:{...property.payload,images:[{image_url}]}}]}),{code:'BILLING_STOCK_IMAGE'});
  }
  const receipts=await Promise.all([store.stageStock(stage),store.stageStock(stage)]);
  assert.deepEqual(receipts[0],receipts[1]);
  assert.equal(await store.account(tenantId),null,'Preparing stock needs no billing account or paid entitlement');
  assert.equal((await store.inventory(tenantId)).length,0,'Pending records cannot become operational/public property rows');
  assert.equal((await store.inventory(tenantId,undefined,{includePending:true})).length,2,'Prepared building counts its units without double counting the parent');
  assert.equal((await store.pendingStock(tenantId)).length,3);
  const withdrawnProperty={...property,payload:{...property.payload,id:crypto.randomUUID(),name:'Withdrawn prepared home'}};
  await store.stageStock({...stage,records:[withdrawnProperty]});
  const withdrawal={tenantId,actorId,ids:[withdrawnProperty.payload.id],reason:stage.reason};
  await store.withdrawStock(withdrawal);await store.withdrawStock(withdrawal);
  await assert.rejects(store.stageStock({...stage,records:[withdrawnProperty]}),{code:'BILLING_STOCK_WITHDRAWN'});
  await assert.rejects(store.withdrawStock({...withdrawal,ids:[parent]}),{code:'BILLING_STOCK_PARENT'});
  assert.equal((await store.pendingStock(tenantId)).length,3,'Withdrawing a building alone cannot orphan its prepared units');
  await assert.rejects(store.withdrawStock({...withdrawal,ids:[crypto.randomUUID()]}),{code:'BILLING_STOCK_NOT_FOUND'});
  await assert.rejects(store.stageStock({...stage,actorId:crypto.randomUUID()}),{code:'BILLING_ADMIN_REQUIRED'});
  await assert.rejects(store.stageStock({...stage,records:[{...property,payload:{...property.payload,id:crypto.randomUUID()}},{...property,payload:{...property.payload,name:'Conflicting identity'}}]}),{code:'BILLING_STOCK_CONFLICT'});
  assert.equal((await store.pendingStock(tenantId)).length,3,'A failed import rolls back earlier prepared records');
  await assert.rejects(store.stageStock({...stage,records:[{kind:'unit',payload:{id:crypto.randomUUID(),propertyid:crypto.randomUUID(),unitnumber:'Foreign parent'}}]}),{code:'BILLING_STOCK_PARENT'});
  assert.equal((await store.pendingStock(tenantId)).length,3);
  await store.enroll({tenantId,actorId,market:'LK',useApprovedSandboxBaseline:true,reason:stage.reason});
  const snapshot=await store.inventory(tenantId,undefined,{includePending:true});
  const session=await service.checkout({tenantId,id:crypto.randomUUID(),actorId,inventoryHash:hash(snapshot)});
  await assert.rejects(store.withdrawStock({...withdrawal,ids:[parent,unit1,unit2]}),{code:'BILLING_STOCK_CHECKOUT_PENDING'});
  assert.equal((await store.inventory(tenantId)).length,0,'Open/unpaid Checkout cannot promote stock');
  await store.stageStock({...stage,records:[unit(unit3)]});
  const checkout=remote.get(`/v1/checkout/sessions/${session.sessionId}`),time=Math.floor(Date.now()/1000);
  const sub={id:'sub_staged_fixture',object:'subscription',customer:checkout.customer,livemode:false,status:'active',latest_invoice:'in_staged_fixture',cancel_at_period_end:false,
    items:{data:[{id:'si_staged_fixture',price,quantity:2,current_period_start:time-1000,current_period_end:time+2592000}]}};
  const paid={...structuredClone(invoice),id:'in_staged_fixture',customer:checkout.customer,status:'paid',amount_due:1000,amount_paid:1000,amount_remaining:0,
    parent:{subscription_details:{subscription:sub.id}},lines:{data:[{id:'il_staged_fixture',parent:{subscription_item_details:{subscription_item:'si_staged_fixture',proration:false}},period:{end:time+2592000}}],has_more:false}};
  Object.assign(checkout,{status:'complete',subscription:sub.id});
  remote.set(`/v1/subscriptions/${sub.id}`,sub);remote.set(`/v1/invoices/${paid.id}`,paid);
  await service.refresh(tenantId);
  await assert.rejects(store.withdrawStock({...withdrawal,ids:[parent]}),{code:'BILLING_CESSATION_REQUIRED'});
  assert.equal((await store.inventory(tenantId)).length,2,'Verified initial payment promotes exactly the reviewed checkout version');
  assert.equal((await store.pendingStock(tenantId)).length,1,'Later prepared stock stays pending');
  const promoted=(await store.read('SELECT * FROM dbo.properties WHERE id=@parent AND tenant_id=@tenantId',{parent,tenantId}))[0];
  assert.equal(promoted.status,'maintenance','Preparation preserves availability without asserting occupancy');
  for(const [key,value] of Object.entries(metadata)){
    const actual=promoted[key] instanceof Date?promoted[key].toISOString():typeof value==='object'?JSON.parse(promoted[key]):promoted[key];
    assert.deepEqual(actual,value,`Promoted metadata: ${key}`);
  }
  assert.deepEqual(JSON.parse(promoted.rentalvalues),property.payload.rentalvalues);
  const promotedUnit=(await store.read('SELECT * FROM dbo.property_units WHERE id=@id AND tenant_id=@tenantId',{id:unit1,tenantId}))[0];
  assert.equal(promotedUnit.status,'reserved');
  for(const [key,value] of Object.entries(unitMetadata)){assert.deepEqual(typeof value==='object'?JSON.parse(promotedUnit[key]):promotedUnit[key],value,`Promoted unit metadata: ${key}`);}
  const preview=await service.quantityPreview({tenantId,id:crypto.randomUUID(),actorId});assert.equal(preview.to,3);
  const request={tenantId,id:crypto.randomUUID(),actorId,previewId:preview.previewId};
  const normal=stripe.request;let lost=true;
  stripe.request=async(...args)=>{
    const result=await normal(...args);
    if(args[0]==='POST'&&args[1]===`/v1/subscriptions/${sub.id}`&&args[2]?.items&&lost){lost=false;throw problem(503,'STRIPE_UNAVAILABLE','Synthetic staged promotion response loss.');}
    return result;
  };
  try{
    await assert.rejects(service.quantityApply(request),{code:'STRIPE_UNAVAILABLE'});
    assert.equal((await store.inventory(tenantId)).length,2);assert.equal(sub.items.data[0].quantity,3);
    await assert.rejects(store.stageStock({...stage,records:[unit(crypto.randomUUID())]}),{code:'BILLING_COMMAND_PENDING'});
    await pool.request().batch(`CREATE TRIGGER dbo.staged_promotion_rollback ON dbo.management_billing_audit AFTER INSERT AS
      BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='inventory.promoted') THROW 51000,'Synthetic staged promotion rollback',1; END`);
    try{await assert.rejects(service.quantityApply(request),/Synthetic staged promotion rollback/);}
    finally{await pool.request().query('DROP TRIGGER dbo.staged_promotion_rollback');}
    assert.equal((await store.inventory(tenantId)).length,2);assert.equal((await store.pendingStock(tenantId)).length,1);
    const result=await service.quantityApply(request);assert.equal(result.currentQuantity,3);
    assert.equal((await store.inventory(tenantId)).length,3);assert.equal((await store.pendingStock(tenantId)).length,0);
    assert.deepEqual(await service.quantityApply(request),result);
    assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE tenant_id=@tenantId AND action='inventory.promoted'",{tenantId})).length,2,'Initial and addition promotion each audit once');
  }finally{stripe.request=normal;}
  console.log('PASS: durable pre-enrollment stock, parent/unit identity, atomic and concurrent imports, paid-only exact Checkout promotion, later-stock isolation, provider response loss and promotion audit rollback; synthetic provider');
  await verifyCessation(pool,{tenantId,actorId,parent,unit1,stripe,sub,calls});
};

const verifyCessation=async(pool,{tenantId,actorId,parent,unit1,stripe,sub,calls})=>{
  // Complete production-typed domain prerequisites in this intentionally
  // smaller disposable migration database; never change a production fixture.
  await pool.request().batch(`
    IF COL_LENGTH('dbo.invoices','propertyid') IS NULL ALTER TABLE dbo.invoices ADD propertyid UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH('dbo.invoices','agreementid') IS NULL ALTER TABLE dbo.invoices ADD agreementid UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH('dbo.invoices','totalamount') IS NULL ALTER TABLE dbo.invoices ADD totalamount DECIMAL(18,2) NULL;
    IF COL_LENGTH('dbo.invoices','status') IS NULL ALTER TABLE dbo.invoices ADD status NVARCHAR(50) NULL;
    IF OBJECT_ID('dbo.payments','U') IS NULL CREATE TABLE dbo.payments(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,invoiceid UNIQUEIDENTIFIER,propertyid UNIQUEIDENTIFIER,amount DECIMAL(18,2),status NVARCHAR(50));
    IF OBJECT_ID('dbo.tenancy_settlements','U') IS NULL CREATE TABLE dbo.tenancy_settlements(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,agreement_id UNIQUEIDENTIFIER,status NVARCHAR(50));
    IF OBJECT_ID('dbo.maintenance_requests','U') IS NULL CREATE TABLE dbo.maintenance_requests(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,propertyid UNIQUEIDENTIFIER,unitid UNIQUEIDENTIFIER,title NVARCHAR(255) NOT NULL,description NVARCHAR(MAX) NOT NULL,status NVARCHAR(50));
  `);
  const migration=fs.readFileSync('migrations/20261110_02_management_cessation.sql','utf8');
  await pool.request().batch(migration);await pool.request().batch(migration);
  let inspection=await inspectManagementCessation(pool);assert.equal(inspection.satisfied,true,inspection.detail);
  await pool.request().query('DISABLE TRIGGER dbo.TR_agreements_management_cessation ON dbo.agreements');
  assert.equal((await inspectManagementCessation(pool)).satisfied,false);
  await pool.request().query('ENABLE TRIGGER dbo.TR_agreements_management_cessation ON dbo.agreements');
  const store=createBillingStore({getPool:async()=>pool,env:{MANAGEMENT_INVENTORY_SCHEMA_READY:'true',MANAGEMENT_CESSATION_SCHEMA_READY:'true'}});
  const service=createBillingService({store,stripe,env:{PUBLIC_APP_URL:'https://app.quixo.homes'}});
  const agreementId=crypto.randomUUID(),invoiceId=crypto.randomUUID(),paymentId=crypto.randomUUID(),maintenanceId=crypto.randomUUID();
  await store.locked(tenantId,async q=>{
    await q("INSERT INTO dbo.agreements(id,tenant_id,propertyid,unitid,status) VALUES(@id,@tenantId,@parent,@unit,'draft')",{id:agreementId,tenantId,parent,unit:unit1});
    await q("INSERT INTO dbo.invoices(id,tenant_id,propertyid,agreementid,totalamount,status) VALUES(@id,@tenantId,@parent,@agreementId,100,'draft')",{id:invoiceId,tenantId,parent,agreementId});
    await q("INSERT INTO dbo.payments(id,tenant_id,invoiceid,propertyid,amount,status) VALUES(@id,@tenantId,@invoiceId,@parent,100,'pending')",{id:paymentId,tenantId,invoiceId,parent});
    await q("INSERT INTO dbo.tenancy_settlements(id,tenant_id,agreement_id,status) VALUES(@id,@tenantId,@agreementId,'draft')",{id:crypto.randomUUID(),tenantId,agreementId});
    await q("INSERT INTO dbo.tenancy_deposit_transactions(id,tenant_id,agreement_id,transaction_type,status,amount) VALUES(@id,@tenantId,@agreementId,'security_deposit','received',100)",{id:crypto.randomUUID(),tenantId,agreementId});
    await q("INSERT INTO dbo.maintenance_requests(id,tenant_id,propertyid,unitid,title,description,status) VALUES(@id,@tenantId,@parent,@unit,'Fixture maintenance','Disposable cessation proof','pending')",{id:maintenanceId,tenantId,parent,unit:unit1});
  });
  const scope={tenantId,actorId,propertyId:parent,unitId:unit1};
  let preview=await service.cessationPreview(scope);
  for(const code of ['TENANCY_OPEN','FINANCIAL_OPEN','PAYMENT_OPEN','SETTLEMENT_OPEN','DEPOSIT_OPEN','MAINTENANCE_OPEN']){assert.ok(preview.blockers.some(b=>b.code===code),code);}
  const posts=calls.filter(c=>c.method==='POST').length;
  await assert.rejects(service.ceaseStock({...scope,id:crypto.randomUUID(),inventoryHash:preview.inventoryHash,reason:'Disposable blocked cessation proof.'}),{code:'BILLING_CESSATION_BLOCKED'});
  assert.equal(calls.filter(c=>c.method==='POST').length,posts,'Ineligible cessation cannot change the provider');
  assert.equal((await store.read('SELECT id FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId',{tenantId})).length,0);
  await store.locked(tenantId,async q=>{
    await q("UPDATE dbo.agreements SET status='closed' WHERE id=@agreementId; UPDATE dbo.invoices SET status='paid' WHERE id=@invoiceId; UPDATE dbo.payments SET status='verified' WHERE id=@paymentId; UPDATE dbo.tenancy_settlements SET status='settled' WHERE agreement_id=@agreementId; UPDATE dbo.maintenance_requests SET status='completed' WHERE id=@maintenanceId",{agreementId,invoiceId,paymentId,maintenanceId});
  });
  await assert.rejects(service.cessationPreview({...scope,propertyId:crypto.randomUUID()}),{code:'BILLING_STOCK_NOT_FOUND'});
  const enquiryId=crypto.randomUUID();
  await store.locked(tenantId,async q=>{
    const pref=(await q('SELECT public_id FROM dbo.public_listing_preferences WHERE property_id=@parent AND tenant_id=@tenantId',{parent,tenantId}))[0];
    await q(`INSERT INTO dbo.property_enquiries(id,listing_public_id,tenant_id,property_id,seeker_id,seeker_name,seeker_email,country_code,listing_title,message,consent_version,request_id,payload_hash)
      VALUES(@id,@publicId,@tenantId,@parent,@actorId,'Fixture renter','fixture-renter@example.test','LK','Prepared building','Disposable cessation hold proof.','fixture-v1',@requestId,@digest)`,
    {id:enquiryId,publicId:pref.public_id,tenantId,parent,actorId,requestId:crypto.randomUUID(),digest:'a'.repeat(64)});
    await q(`INSERT INTO dbo.property_rental_offers(enquiry_id,tenant_id,property_id,unit_id,application_version,status,version,currency,rent,deposit,fees,start_date,end_date,terms,offer_until,hold_until)
      VALUES(@id,@tenantId,@parent,@unit,1,'offered',1,'LKR',100,0,0,'2027-01-01','2027-12-31','Fixture terms',DATEADD(DAY,1,SYSUTCDATETIME()),DATEADD(DAY,2,SYSUTCDATETIME()))`,{id:enquiryId,tenantId,parent,unit:unit1});
  });
  assert.ok((await service.cessationPreview(scope)).blockers.some(b=>b.code==='RESERVATION_OPEN'));
  await store.locked(tenantId,q=>q("UPDATE dbo.property_rental_offers SET status='withdrawn' WHERE enquiry_id=@id",{id:enquiryId}));
  preview=await service.cessationPreview(scope);assert.equal(preview.eligible,true);
  const request={...scope,id:crypto.randomUUID(),inventoryHash:preview.inventoryHash,reason:'End management after all fixture obligations close.'};
  let enteredResolve,releaseResolve;
  const entered=new Promise(resolve=>{enteredResolve=resolve;}),release=new Promise(resolve=>{releaseResolve=resolve;});
  const normal=stripe.request;
  stripe.request=async(...args)=>{
    if(args[0]==='POST'&&args[1]==='/v1/subscription_schedules'&&args[2].from_subscription===sub.id){enteredResolve();await release;}
    return normal(...args);
  };
  const ending=service.ceaseStock(request);
  try{
    await Promise.race([entered,ending.then(()=>{throw new Error('Cessation did not reach the held provider call');})]);
    await assert.rejects(pool.request().query(`SET LOCK_TIMEOUT 250; BEGIN TRY
      INSERT INTO dbo.agreements(id,tenant_id,propertyid,unitid,status) VALUES(NEWID(),'${tenantId}','${parent}','${unit1}','draft');
      SET LOCK_TIMEOUT -1; END TRY BEGIN CATCH SET LOCK_TIMEOUT -1; THROW; END CATCH;`),error=>error.number===1222);
  }finally{releaseResolve();stripe.request=normal;}
  const result=await ending;
  assert.equal(result.managementEnded,true);assert.equal(result.nextRenewalQuantity,2);assert.equal(sub.items.data[0].quantity,3);
  assert.equal((await store.inventory(tenantId)).length,2,'Ceased unit is excluded without falling back to a phantom whole building');
  const writes=calls.filter(c=>c.method==='POST').length;
  assert.deepEqual(await service.ceaseStock(request),result);assert.equal(calls.filter(c=>c.method==='POST').length,writes);
  for(const [statement,number] of [
    ["INSERT INTO dbo.agreements(id,tenant_id,propertyid,unitid,status) VALUES(NEWID(),@tenantId,@parent,@unit,'draft')",51070],
    ["INSERT INTO dbo.maintenance_requests(id,tenant_id,propertyid,unitid,title,description,status) VALUES(NEWID(),@tenantId,@parent,@unit,'Fixture','Fixture','pending')",51071],
    ["INSERT INTO dbo.invoices(id,tenant_id,propertyid,agreementid,totalamount,status) VALUES(NEWID(),@tenantId,@parent,@agreementId,100,'draft')",51072],
    ["UPDATE dbo.property_units SET status='available' WHERE id=@unit",51073]
  ]){await assert.rejects(store.locked(tenantId,q=>q(statement,{tenantId,parent,unit:unit1,agreementId})),error=>error.number===number);}
  const parentScope={tenantId,actorId,propertyId:parent,unitId:null};
  const finalPreview=await service.cessationPreview(parentScope);assert.equal(finalPreview.eligible,true);
  const finalRequest={...parentScope,id:crypto.randomUUID(),inventoryHash:finalPreview.inventoryHash,reason:'End the final fixture property after obligations close.'};
  let lost=true;
  stripe.request=async(...args)=>{
    const value=await normal(...args);
    if(args[0]==='POST'&&args[1]===`/v1/subscriptions/${sub.id}`&&args[2].cancel_at_period_end&&lost){lost=false;throw problem(503,'STRIPE_UNAVAILABLE','Synthetic cessation response loss.');}
    return value;
  };
  try{
    await assert.rejects(service.ceaseStock(finalRequest),{code:'STRIPE_UNAVAILABLE'});
    assert.equal((await store.inventory(tenantId)).length,2,'Lost response rolls back local cessation and preserves existing stock');
    assert.equal(sub.cancel_at_period_end,true);
    const afterLoss=calls.filter(c=>c.method==='POST').length;
    const final=await service.ceaseStock(finalRequest);assert.equal(final.managementEnded,true);assert.equal(final.cancelAtPeriodEnd,true);
    assert.equal(calls.filter(c=>c.method==='POST').length,afterLoss,'Confirmed cancellation retry needs no additional provider write');
    assert.equal((await store.inventory(tenantId)).length,0);assert.equal((await store.account(tenantId)).pending_quantity,0);
    assert.equal((await store.read("SELECT id FROM dbo.agreements WHERE id=@agreementId AND status='closed'",{agreementId})).length,1);
    assert.equal((await store.read("SELECT id FROM dbo.invoices WHERE id=@invoiceId AND status='paid'",{invoiceId})).length,1);
    assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE tenant_id=@tenantId AND action='inventory.ceased'",{tenantId})).length,2);
  }finally{stripe.request=normal;}
  console.log('PASS: atomic audited cessation, real domain obligation denials, competing obligation lock, future quantity reduction, zero-stock cancellation, immutable history, database bypass denial and response-loss retry; synthetic provider');
};
