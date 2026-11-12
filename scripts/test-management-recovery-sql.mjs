import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {inspectManagementRecovery} from './inspect-management-billing-schema.mjs';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createBillingService} from '../src/api/managementBilling/service.js';
import {createRecoveryJournal} from '../src/api/managementBilling/recoveryJournal.js';
import {createRecoveryWorker} from '../src/api/managementBilling/recoveryWorker.js';
import {createBillingInvariantInspector,readOnlyStripe} from '../src/api/managementBilling/invariants.js';
import {verifyRestoration} from './test-management-restoration-sql.mjs';
import {verifyCessationCleanup} from './test-management-cessation-cleanup-sql.mjs';
import {verifyQuantityRecovery} from './test-management-quantity-recovery-sql.mjs';

// Called only by the disposable SQL Server harness. Provider transport is synthetic.
export const verifyManagementRecovery=async(pool,{tenantId,otherTenant,actorId,stripe,remote,calls})=>{
  const migration=fs.readFileSync('migrations/20261112_01_management_recovery.sql','utf8');
  await pool.request().batch(migration);await pool.request().batch(migration);
  const inspection=await inspectManagementRecovery(pool);assert.equal(inspection.satisfied,true,inspection.detail);
  await pool.request().query('ALTER TABLE dbo.management_billing_recovery NOCHECK CONSTRAINT ALL');
  assert.equal((await inspectManagementRecovery(pool)).satisfied,false);
  await pool.request().query('ALTER TABLE dbo.management_billing_recovery WITH CHECK CHECK CONSTRAINT ALL');
  const env={MANAGEMENT_RECOVERY_SCHEMA_READY:'true'};
  const store=createBillingStore({getPool:async()=>pool,env});
  const account=await store.account(tenantId),sub=remote.get(`/v1/subscriptions/${account.stripe_subscription_id}`);
  sub.cancel_at_period_end=false;sub.schedule=null;
  await store.locked(tenantId,q=>q('UPDATE dbo.management_billing_accounts SET stripe_schedule_id=NULL WHERE tenant_id=@tenantId',{tenantId}));
  const id=crypto.randomUUID(),args={tenantId,id,actorId,cancelAtPeriodEnd:true};
  let lost=true;
  const synthetic={...stripe,request:async(...args)=>{
    const result=await stripe.request(...args);
    if(args[0]==='POST'&&args[1]===`/v1/subscriptions/${sub.id}`&&lost){
      lost=false;
      assert.equal((await store.read('SELECT command_id FROM dbo.management_billing_steps WHERE command_id=@id',{id})).length,1,'Step intent committed before provider write');
      throw Object.assign(new Error('Synthetic lost response'),{status:503,code:'STRIPE_UNAVAILABLE'});
    }
    return result;
  }};
  const service=createBillingService({store,stripe:synthetic,env});
  await assert.rejects(service.cancel(args),{code:'STRIPE_UNAVAILABLE'});
  await assert.rejects(service.cancel({...args,id:crypto.randomUUID()}),{code:'BILLING_COMMAND_PENDING'});
  await assert.rejects(service.recoverOperation({tenantId:otherTenant,id}),{code:'BILLING_COMMAND_NOT_FOUND'});
  const posts=calls.filter(c=>c.method==='POST').length;
  await store.locked(tenantId,async q=>{
    await q('UPDATE dbo.management_billing_steps SET created_at=DATEADD(hour,-48,SYSUTCDATETIME()) WHERE command_id=@id',{id});
    await q('UPDATE dbo.management_billing_recovery SET next_attempt_at=SYSUTCDATETIME() WHERE command_id=@id',{id});
  });
  const result=await service.reconcileCancellation(args);
  assert.equal(result.cancelAtPeriodEnd,true);assert.deepEqual(await service.cancel(args),result);
  assert.equal(calls.filter(c=>c.method==='POST').length,posts,'Aged recovery proves the effect without a second provider write');
  assert.equal((await store.read('SELECT state FROM dbo.management_billing_recovery WHERE command_id=@id',{id}))[0].state,'succeeded');
  assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE resource_id=@id AND action='sandbox.cancellation.recovered'",{id})).length,1);

  const leaseId=crypto.randomUUID();
  await store.beginCommand({tenantId,id:leaseId,actorId,kind:'cancellation',payload:{cancelAtPeriodEnd:true},recovery:true});
  const journal=createRecoveryJournal({store,complete:async()=>({confirmed:true})}),claimArgs={tenantId,id:leaseId};
  const claims=await Promise.allSettled([journal.claim(claimArgs),journal.claim(claimArgs)]);
  assert.equal(claims.filter(c=>c.status==='fulfilled').length,1,'Only one worker can claim a tenant operation');
  assert.equal(claims.find(c=>c.status==='rejected').reason.code,'BILLING_RECOVERY_BUSY');
  const old=claims.find(c=>c.status==='fulfilled').value;
  await store.locked(tenantId,q=>q('UPDATE dbo.management_billing_recovery SET lease_until=DATEADD(second,-1,SYSUTCDATETIME()) WHERE command_id=@id',{id:leaseId}));
  const next=await journal.claim(claimArgs);assert.notEqual(next.token,old.token);
  await assert.rejects(journal.renew({...claimArgs,token:old.token}),{code:'BILLING_RECOVERY_FENCED'});
  await assert.rejects(journal.finish({...claimArgs,token:old.token,result:{}}),{code:'BILLING_RECOVERY_FENCED'});
  assert.deepEqual(await journal.fail({...claimArgs,token:old.token,review:true,code:'STALE',delaySeconds:30}),{review:false});
  const beforeVersion=(await store.account(tenantId)).version;
  const failingJournal=createRecoveryJournal({store:{...store,audit:async()=>{throw new Error('Synthetic audit failure');}},
    complete:async q=>{
      await q('UPDATE dbo.management_billing_accounts SET version=version+1 WHERE tenant_id=@tenantId',{tenantId});
      return {confirmed:true};
    }});
  await assert.rejects(failingJournal.finish({...claimArgs,token:next.token,result:{}}),/Synthetic audit failure/);
  assert.equal((await store.account(tenantId)).version,beforeVersion,'Projection rolls back when audit fails');
  assert.equal((await store.read('SELECT status FROM dbo.management_billing_commands WHERE id=@id',{id:leaseId}))[0].status,'pending');
  assert.equal((await store.read('SELECT state FROM dbo.management_billing_recovery WHERE command_id=@id',{id:leaseId}))[0].state,'running');
  await store.locked(tenantId,q=>q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId,actorId}));
  await assert.rejects(journal.finish({...claimArgs,token:next.token,result:{}}),{code:'BILLING_ADMIN_REQUIRED'});
  await store.locked(tenantId,async q=>{
    await q("UPDATE dbo.tenant_memberships SET status='active' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId,actorId});
    await q('UPDATE dbo.management_billing_recovery SET attempts=8,lease_until=NULL WHERE command_id=@id',{id:leaseId});
  });
  assert.deepEqual(await journal.claim(claimArgs),{review:true});
  await assert.rejects(journal.claim(claimArgs),{code:'BILLING_RECOVERY_REVIEW'});
  const savedBefore=await store.read('SELECT * FROM dbo.management_billing_recovery WHERE command_id=@id',{id:leaseId});
  const dryRun=await createRecoveryWorker({store,service:null,env:{...env,MANAGEMENT_RECOVERY_TENANT_IDS:tenantId}}).run();
  assert.equal(dryRun.dryRun,true);assert.equal(dryRun.candidates.length,1);assert.equal(dryRun.candidates[0].due,0);
  assert.deepEqual(await store.read('SELECT * FROM dbo.management_billing_recovery WHERE command_id=@id',{id:leaseId}),savedBefore,'Dry-run changes no recovery metadata');
  const observed=await createBillingInvariantInspector({store,stripe:readOnlyStripe(stripe)}).inspect(tenantId);
  assert.equal(observed.status,'operation_pending',JSON.stringify(observed));
  assert.equal(observed.nextRenewalQuantity,0);assert.equal(observed.currentPaidQuantity,account.quantity);
  assert.deepEqual(await store.read('SELECT * FROM dbo.management_billing_recovery WHERE command_id=@id',{id:leaseId}),savedBefore,'Invariant inspection changes no recovery metadata');
  console.log('PASS: recovery schema replay/drift, durable intent, aged provider readback, tenant isolation, atomic result/audit, exclusive leases, fencing, revoked actor and attempt cap');
  await verifyQuantityRecovery(pool,{tenantId,actorId,stripe,remote,calls,retiredFixtureId:leaseId});
  await verifyProviderRecovery(pool,{tenantId,otherTenant,actorId,stripe,remote,calls});
  await verifyCessationCleanup(pool,actorId);
  await verifyRestoration(pool,actorId);
};

// Extends the existing disposable fixture only; never called by production jobs.
const verifyProviderRecovery=async(pool,{tenantId,otherTenant,actorId,stripe,remote})=>{
  const env={MANAGEMENT_RECOVERY_SCHEMA_READY:'true',MANAGEMENT_INVENTORY_SCHEMA_READY:'true',MANAGEMENT_CESSATION_SCHEMA_READY:'true',PUBLIC_APP_URL:'https://app.example.test'};
  const store=createBillingStore({getPool:async()=>pool,env}),original=await store.account(tenantId);
  const propertyIds=[crypto.randomUUID(),crypto.randomUUID()];
  await store.locked(tenantId,async q=>{
    await q('UPDATE dbo.management_billing_accounts SET stripe_customer_id=NULL,stripe_subscription_id=NULL,stripe_schedule_id=NULL,inventory_json=\'[]\',subscription_status=\'pending\',initial_payment_verified=0,pending_quantity=NULL WHERE tenant_id=@tenantId',{tenantId});
    // Prior completed Checkout fixtures are for a different synthetic binding.
    await q("UPDATE dbo.management_billing_commands SET kind='retired_fixture_checkout' WHERE tenant_id=@tenantId AND kind='checkout'",{tenantId});
    for(const id of propertyIds){await q("INSERT dbo.properties(id,tenant_id,name,propertytype,country_code) VALUES(@id,@tenantId,'Provider recovery fixture','house','LK')",{id,tenantId});}
  });
  const events=[],sessions=[],customers=[],writes=[];let fault=null,unsafe=false;
  const transport={...stripe,request:async(method,path,body={},key)=>{
    if(method==='GET'){
      if(path==='/v1/events'){return {data:structuredClone(events.filter(e=>e.type===body.type)),has_more:false};}
      if(path==='/v1/checkout/sessions'){return {data:structuredClone(sessions.filter(s=>s.customer===body.customer)),has_more:false};}
      if(path.startsWith('/v1/customers/cus_recovery')){return structuredClone(customers.find(c=>path.endsWith(c.id)));}
      if(path.startsWith('/v1/checkout/sessions/cs_recovery')){
        const session=sessions.find(s=>path.includes(s.id));
        return structuredClone(path.endsWith('/line_items')?{data:session.lines,has_more:false}:session);
      }
      if(path.startsWith('/v1/billing_portal/configurations/')){return {active:true,features:{subscription_update:{enabled:unsafe}}};}
      return stripe.request(method,path,body,key);
    }
    assert.equal((await store.read('SELECT idempotency_key FROM dbo.management_billing_steps WHERE idempotency_key=@key',{key})).length,1,'Named intent is durable before every provider write');
    writes.push({path,key,body:structuredClone(body)});let result,type;
    if(path==='/v1/customers'){
      result={id:`cus_recovery_${customers.length}`,livemode:false,...body};customers.push(result);type='customer.created';
    }else if(path==='/v1/checkout/sessions'){
      result={id:`cs_recovery_${sessions.length}`,livemode:false,status:'open',expires_at:Math.floor(Date.now()/1000)+86400,
        url:'https://checkout.stripe.com/c/recovery',...body,lines:body.line_items};sessions.push(result);
    }else if(path==='/v1/billing_portal/sessions'){
      result={id:'bps_recovery',livemode:false,url:'https://billing.stripe.com/p/recovery',...body};type='billing_portal.session.created';
    }else{
      result=await stripe.request(method,path,body,key);
      if(path==='/v1/subscription_schedules'){type='subscription_schedule.created';result.livemode=false;remote.get(`/v1/subscription_schedules/${result.id}`).livemode=false;}
      else if(path.startsWith('/v1/subscription_schedules/')&&!path.endsWith('/release')){type='subscription_schedule.updated';}
      else if(path.startsWith('/v1/subscriptions/')){type='customer.subscription.updated';}
    }
    if(type){events.push({id:`evt_provider_${events.length}`,type,livemode:false,created:Math.floor(Date.now()/1000),request:{idempotency_key:key},data:{object:structuredClone(result)}});}
    if(fault===path){fault=null;throw Object.assign(new Error('Synthetic lost provider response'),{status:503,code:'STRIPE_UNAVAILABLE'});}
    return structuredClone(result);
  }};
  let failCompletion=false;
  const recoveryStore={...store,audit:async(q,args)=>{if(failCompletion&&args.action==='sandbox.cessation.recovered'){failCompletion=false;throw Error('Synthetic cessation audit rollback');}return store.audit(q,args);}};
  const service=createBillingService({store:recoveryStore,stripe:transport,env});
  const due=async id=>store.locked(tenantId,q=>q('UPDATE dbo.management_billing_recovery SET next_attempt_at=SYSUTCDATETIME() WHERE command_id=@id',{id}));
  const age=async id=>store.locked(tenantId,async q=>{
    await q('UPDATE dbo.management_billing_steps SET created_at=DATEADD(hour,-48,SYSUTCDATETIME()) WHERE command_id=@id',{id});
    await q('UPDATE dbo.management_billing_recovery SET next_attempt_at=SYSUTCDATETIME() WHERE command_id=@id',{id});
  });
  const checkoutId=crypto.randomUUID(),checkoutArgs={tenantId,actorId,id:checkoutId,inventoryHash:(await service.summary(tenantId)).inventoryHash};
  fault='/v1/customers';await assert.rejects(service.checkout(checkoutArgs),{code:'STRIPE_UNAVAILABLE'});
  assert.equal((await store.account(tenantId)).stripe_customer_id,null);
  await age(checkoutId);fault='/v1/checkout/sessions';await assert.rejects(service.checkout(checkoutArgs),{code:'STRIPE_UNAVAILABLE'});
  await age(checkoutId);
  const checkout=await service.checkout(checkoutArgs);assert.equal(checkout.sessionId,sessions[0].id);
  assert.deepEqual(await service.checkout(checkoutArgs),checkout);
  assert.equal(customers.length,1);assert.equal(sessions.length,1);
  assert.equal((await store.account(tenantId)).stripe_customer_id,customers[0].id);
  await assert.rejects(service.recoverOperation({tenantId:otherTenant,id:checkoutId}),{code:'BILLING_COMMAND_NOT_FOUND'});
  const reused=await service.checkout({...checkoutArgs,id:crypto.randomUUID()});assert.equal(reused.sessionId,checkout.sessionId);assert.equal(sessions.length,1);
  const portalId=crypto.randomUUID();fault='/v1/billing_portal/sessions';
  await assert.rejects(service.portal({tenantId,actorId,id:portalId}),{code:'STRIPE_UNAVAILABLE'});await due(portalId);
  assert.equal((await service.portal({tenantId,actorId,id:portalId})).url,'https://billing.stripe.com/p/recovery');
  assert.equal(writes.filter(w=>w.path==='/v1/billing_portal/sessions').length,1);
  const stalePortal=crypto.randomUUID();fault='/v1/billing_portal/sessions';
  await assert.rejects(service.portal({tenantId,actorId,id:stalePortal}),{code:'STRIPE_UNAVAILABLE'});
  await store.locked(tenantId,q=>q('UPDATE dbo.management_billing_commands SET created_at=DATEADD(minute,-10,SYSUTCDATETIME()) WHERE id=@id',{id:stalePortal}));await due(stalePortal);
  await assert.rejects(service.portal({tenantId,actorId,id:stalePortal}),{code:'BILLING_REVIEW_EXPIRED'});
  assert.equal((await store.read('SELECT status FROM dbo.management_billing_commands WHERE id=@id',{id:stalePortal}))[0].status,'completed','Expired link frees the command without another provider write');
  assert.equal(writes.filter(w=>w.path==='/v1/billing_portal/sessions').length,2);
  unsafe=true;const unsafeId=crypto.randomUUID();await assert.rejects(service.portal({tenantId,actorId,id:unsafeId}),{code:'BILLING_PORTAL_UNSAFE'});
  assert.equal(writes.filter(w=>w.path==='/v1/billing_portal/sessions').length,2);
  assert.equal((await store.read('SELECT id FROM dbo.management_billing_commands WHERE id=@id',{id:unsafeId})).length,0,'Initial unsafe portal configuration cannot strand a pending command');unsafe=false;
  const sub=remote.get(`/v1/subscriptions/${original.stripe_subscription_id}`);sub.cancel_at_period_end=false;sub.schedule=null;
  await store.locked(tenantId,q=>q('UPDATE dbo.management_billing_accounts SET stripe_customer_id=@customer,stripe_subscription_id=@subscription,stripe_schedule_id=NULL,initial_payment_verified=1 WHERE tenant_id=@tenantId',
    {tenantId,customer:original.stripe_customer_id,subscription:original.stripe_subscription_id}));
  await service.refresh(tenantId);
  // Current paid capacity is 3; add a private prepared dwelling so preview increases to 4.
  const prepared=crypto.randomUUID();
  await store.stageStock({tenantId,actorId,reason:'Synthetic provider preview proof.',records:[{kind:'property',payload:{id:prepared,name:'Preview recovery fixture',propertytype:'house',country_code:'LK',rentalvalues:{listingCategory:'residential'}}}]});
  const prepared2=crypto.randomUUID();
  await store.stageStock({tenantId,actorId,reason:'Synthetic provider preview proof.',records:[{kind:'property',payload:{id:prepared2,name:'Preview recovery fixture two',propertytype:'house',country_code:'LK',rentalvalues:{listingCategory:'residential'}}}]});
  const previewId=crypto.randomUUID();fault='/v1/invoices/create_preview';
  await assert.rejects(service.quantityPreview({tenantId,actorId,id:previewId}),{code:'STRIPE_UNAVAILABLE'});await due(previewId);
  const preview=await service.quantityPreview({tenantId,actorId,id:previewId});assert.equal(preview.to,4);assert.equal(preview.nextInvoiceTotalMinor,1250);
  const previewWrites=writes.filter(w=>w.path==='/v1/invoices/create_preview');
  assert.equal(previewWrites.length,2);assert.equal(previewWrites[0].key,previewWrites[1].key);assert.deepEqual(previewWrites[0].body,previewWrites[1].body);
  await store.withdrawStock({tenantId,actorId,ids:[prepared,prepared2],reason:'Retire disposable preview preparation.'});
  const ceaseId=crypto.randomUUID(),ceasePreview=await service.cessationPreview({tenantId,actorId,propertyId:propertyIds[0]});
  const ceaseArgs={tenantId,actorId,id:ceaseId,propertyId:propertyIds[0],unitId:null,inventoryHash:ceasePreview.inventoryHash,reason:'Disposable cessation recovery proof.'};
  fault='/v1/subscription_schedules';await assert.rejects(service.ceaseStock(ceaseArgs),{code:'STRIPE_UNAVAILABLE'});
  assert.equal((await store.inventory(tenantId)).length,2,'Stock is not ceased before provider confirmation');
  await age(ceaseId);failCompletion=true;await assert.rejects(service.ceaseStock(ceaseArgs),/Synthetic cessation audit rollback/);
  assert.equal((await store.inventory(tenantId)).length,2,'Final audit failure rolls back the local cessation');
  assert.equal((await store.read('SELECT id FROM dbo.management_inventory_controls WHERE id=@id',{id:ceaseId})).length,0);
  await due(ceaseId);const ceased=await service.ceaseStock(ceaseArgs);assert.equal(ceased.managementEnded,true);assert.equal(ceased.nextRenewalQuantity,1);
  assert.deepEqual(await service.ceaseStock(ceaseArgs),ceased);assert.equal((await store.inventory(tenantId)).length,1);
  const savedKey=(await store.read("SELECT idempotency_key FROM dbo.management_billing_steps WHERE command_id=@id AND name='create_schedule'",{id:ceaseId}))[0].idempotency_key;
  assert.equal(writes.filter(w=>w.key===savedKey).length,1,'Exactly one write uses the persisted schedule key, including SQL GUID casing');
  assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE resource_id=@id AND action='inventory.ceased'",{id:ceaseId})).length,1);
  // Each new state must cease atomically with no provider write, even on retry.
  for(const scenario of ['complimentary','complimentary_without_subscription','incomplete','incomplete_expired','unpaid','canceled','past_due']){
    const propertyId=crypto.randomUUID(),id=crypto.randomUUID();
    const complimentary=scenario.startsWith('complimentary');
    sub.status=complimentary?'active':scenario;sub.latest_invoice=null;sub.schedule=null;
    await store.locked(tenantId,async q=>{
      await q("INSERT dbo.properties(id,tenant_id,name,propertytype,country_code) VALUES(@id,@tenantId,'Local cessation fixture','house','LK')",{id:propertyId,tenantId});
      await q(`UPDATE dbo.management_billing_accounts SET subscription_status=@status,comp_type=@comp,
        comp_expires_at=NULL,stripe_subscription_id=@subscription,stripe_item_id=@item,quantity=@quantity,stripe_schedule_id=NULL,pending_quantity=NULL,
        initial_payment_verified=@paid,grace_started_at=DATEADD(day,-8,SYSUTCDATETIME()) WHERE tenant_id=@tenantId`,
      {tenantId,status:sub.status,comp:complimentary?'ongoing':null,subscription:scenario==='complimentary_without_subscription'?null:sub.id,
        item:scenario==='complimentary_without_subscription'?null:sub.items.data[0].id,quantity:scenario==='complimentary_without_subscription'?0:sub.items.data[0].quantity,
        paid:scenario==='incomplete'||scenario==='incomplete_expired'?0:1});
    });
    const before=await store.account(tenantId),writeCount=writes.length;
    const originalStatus=(await store.read('SELECT status FROM dbo.properties WHERE id=@id',{id:propertyId}))[0].status;
    const preview=await service.cessationPreview({tenantId,actorId,propertyId});
    assert.equal(preview.eligible,true,scenario);assert.equal(preview.timing,'unchanged');
    const args={tenantId,actorId,id,propertyId,inventoryHash:preview.inventoryHash,reason:'No-write cessation state matrix.'};
    failCompletion=true;await assert.rejects(service.ceaseStock(args),/Synthetic cessation audit rollback/);
    assert.equal((await store.read('SELECT id FROM dbo.management_inventory_controls WHERE id=@id',{id})).length,0,'Audit failure rolls back cessation');
    assert.equal((await store.read('SELECT status FROM dbo.properties WHERE id=@id',{id:propertyId}))[0].status,originalStatus);
    await due(id);const result=await service.ceaseStock(args);
    assert.equal(result.managementEnded,true);assert.equal(result.billingUnchanged,true);assert.equal(result.timing,'unchanged');
    assert.deepEqual(await service.ceaseStock(args),result);assert.equal(writes.length,writeCount,`${scenario} makes zero Stripe writes`);
    const after=await store.account(tenantId);
    for(const field of ['quantity','pending_quantity','comp_type','comp_expires_at','cancel_at_period_end']){
      assert.deepEqual(after[field],before[field],`${scenario} preserves ${field}`);
    }
    const invariants=await createBillingInvariantInspector({store,stripe:readOnlyStripe(transport)}).inspect(tenantId);
    assert.equal(invariants.status,'consistent',`${scenario}: ${invariants.issues.join(',')}`);
    assert.equal((await store.read('SELECT name FROM dbo.management_billing_steps WHERE command_id=@id',{id})).length,0);
    assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE resource_id=@id AND action='inventory.ceased'",{id})).length,1);
  }
  // A grant can expire after intent but before a resumed completion. Never
  // silently route that saved no-write operation into a provider mutation.
  const changedProperty=crypto.randomUUID(),changedId=crypto.randomUUID();
  sub.status='active';
  await store.locked(tenantId,async q=>{
    await q("INSERT dbo.properties(id,tenant_id,name,propertytype,country_code) VALUES(@id,@tenantId,'Changed entitlement fixture','house','LK')",{id:changedProperty,tenantId});
    await q("UPDATE dbo.management_billing_accounts SET comp_type='fixed',comp_expires_at=DATEADD(day,1,SYSUTCDATETIME()),subscription_status='active',paid_through=DATEADD(day,30,SYSUTCDATETIME()) WHERE tenant_id=@tenantId",{tenantId});
  });
  const changedPreview=await service.cessationPreview({tenantId,actorId,propertyId:changedProperty});
  const changedArgs={tenantId,actorId,id:changedId,propertyId:changedProperty,inventoryHash:changedPreview.inventoryHash,reason:'Changed entitlement recovery proof.'};
  failCompletion=true;await assert.rejects(service.ceaseStock(changedArgs),/Synthetic cessation audit rollback/);
  await store.locked(tenantId,q=>q('UPDATE dbo.management_billing_accounts SET comp_expires_at=DATEADD(second,-1,SYSUTCDATETIME()) WHERE tenant_id=@tenantId',{tenantId}));
  await due(changedId);const writesBeforeReview=writes.length;
  await assert.rejects(service.ceaseStock(changedArgs),{code:'BILLING_CESSATION_STATE_CHANGED'});
  assert.equal(writes.length,writesBeforeReview);
  assert.equal((await store.read('SELECT id FROM dbo.management_inventory_controls WHERE id=@id',{id:changedId})).length,0);
  assert.equal((await store.read('SELECT state FROM dbo.management_billing_recovery WHERE command_id=@id',{id:changedId}))[0].state,'failed_needs_review');
  console.log('PASS: seven no-write cessation states, rollback/retry, retained billing obligations and exactly one cessation audit');
  console.log('PASS: real SQL customer/Checkout response-loss recovery, open-session reuse, cross-tenant denial, portal evidence/expiry/configuration, exact preview retry and cessation completion; synthetic provider');
};
