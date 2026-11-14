// Genuine sandbox provider + deployed service/SQL proof. No HTTP/UI or login claim.
// Local dependency flags enable this isolated process only; serving flags stay unchanged.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createBillingService} from '/app/src/api/managementBilling/service.js';
import {createStripeClient,objectId} from '/app/src/api/managementBilling/stripe.js';
import {BILLING_ACCOUNT,BILLING_PRICE,hash} from '/app/src/api/managementBilling/contract.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const tenantId=process.env.PAID_INVENTORY_OPERATION,actorId=randomUUID(),propertyId=randomUUID(),second=randomUUID();
const scenario=process.env.PAID_INVENTORY_SCENARIO||'transitions';
const env={...process.env,MANAGEMENT_INVENTORY_SCHEMA_READY:'true',MANAGEMENT_CESSATION_SCHEMA_READY:'true',
  MANAGEMENT_RESTORATION_SCHEMA_READY:'true',MANAGEMENT_SPLIT_SCHEMA_READY:'true'};
const store=createBillingStore({env}),stripe=createStripeClient(),service=createBillingService({store,stripe,env});
const protectedIds=['80a4b392-13f8-484d-81fa-a110a6ef75f0','2383f4fc-e107-4ac7-9e13-39db501f40ec'];
const proof={operation:tenantId,scenario,checks:[],scope:'genuine sandbox provider + deployed service/SQL',httpAccepted:false,uiAccepted:false};
let created=false,passed=false,cleanup=false,providerClean=false,stage='preflight',providerAttempted=false,customer,subscription,baseline;
const check=name=>{proof.checks.push(name);console.log('PAID_INVENTORY_CHECK='+name);};
const progress=()=>console.log('PAID_INVENTORY_PROGRESS='+JSON.stringify(proof));
const read=(path,body)=>stripe.request('GET',path,body);
const write=(path,body,key)=>stripe.request('POST',path,body,`paid-stock:${tenantId}:${key}`);
const protectedState=async()=>Promise.all(protectedIds.map(async id=>{
  const account=await store.account(id);assert.ok(account?.stripe_subscription_id);
  const sub=await read('/v1/subscriptions/'+account.stripe_subscription_id);
  const clock=objectId(sub.test_clock)?await read('/v1/test_helpers/test_clocks/'+objectId(sub.test_clock)):null;
  return {account:hash(account),subscription:hash(sub),clock:clock?.frozen_time};
}));
const count=async()=> (await store.inventory(tenantId)).length;
const audit=async()=>hash(await store.read('SELECT * FROM dbo.management_billing_audit WHERE tenant_id=@tenantId ORDER BY id',{tenantId}));
const provider=()=>read('/v1/subscriptions/'+subscription.id);
const scheduled=async expected=>{
  const sub=await provider();assert.equal(sub.livemode,false);assert.equal(objectId(sub.customer),customer.id);
  assert.equal(sub.items.data[0].quantity,2);assert.equal(objectId(sub.latest_invoice),proof.initialInvoice);
  const schedule=await read('/v1/subscription_schedules/'+objectId(sub.schedule));
  assert.equal(schedule.livemode,false);assert.equal(objectId(schedule.subscription),sub.id);
  assert.equal(objectId(schedule.customer),customer.id);assert.equal(schedule.status,'active');
  assert.deepEqual(schedule.phases.map(p=>p.items[0].quantity),[2,expected]);
  assert.ok(schedule.phases.every(p=>p.items.length===1&&objectId(p.items[0].price)===BILLING_PRICE));
  assert.equal(schedule.phases[1].start_date,sub.items.data[0].current_period_end);
  proof.scheduleId=schedule.id;return hash(schedule);
};
const cleanupFixture=async()=>{
  // Keep evidence on failure; never replay an ambiguous creation. Known fixture
  // subscription cancellation is bounded and verified, with no proration/invoice.
  try{
    if(subscription){
      const current=await provider();assert.equal(current.livemode,false);assert.equal(objectId(current.customer),customer.id);
      assert.equal(current.metadata.acceptance_fixture,tenantId);
      await stripe.request('DELETE','/v1/subscriptions/'+subscription.id,{invoice_now:false,prorate:false},`paid-stock:${tenantId}:cleanup-subscription`);
      assert.equal((await provider()).status,'canceled');
      if(await store.account(tenantId)){await service.refresh(tenantId);assert.equal((await store.account(tenantId)).subscription_status,'canceled');}
    }else if(providerAttempted){throw Object.assign(Error('Inspect ambiguous provider creation before cleanup'),{code:'PROVIDER_CREATION_UNCONFIRMED'});}
    providerClean=true;
  }catch(error){console.error('PAID_INVENTORY_CLEANUP_FAILED='+JSON.stringify({code:error.code||'UNCONFIRMED',...proof}));process.exitCode=1;}
  try{
    if(created){
      await store.locked(tenantId,async q=>{
        await q("UPDATE dbo.properties SET status='inactive' WHERE tenant_id=@tenantId",{tenantId});
        await q('UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId',{tenantId});
        await q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId,actorId});
        await q("UPDATE dbo.app_users SET status='inactive' WHERE id=@actorId AND tenant_id=@tenantId",{tenantId,actorId});
        await q("UPDATE dbo.tenants SET status='inactive' WHERE id=@tenantId",{tenantId});
      });
      assert.equal((await store.read("SELECT id FROM dbo.tenants WHERE id=@tenantId AND status='inactive'",{tenantId})).length,1);
      assert.equal((await store.read("SELECT id FROM dbo.app_users WHERE id=@actorId AND status='inactive'",{actorId})).length,1);
      assert.equal((await store.read("SELECT id FROM dbo.tenant_memberships WHERE tenant_id=@tenantId AND status='active'",{tenantId})).length,0);
      assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=0',{tenantId})).length,0);
    }
    if(baseline){assert.deepEqual(await protectedState(),baseline);}
    cleanup=providerClean;
    console.log('PAID_INVENTORY_CLEANUP='+JSON.stringify({verified:cleanup,fixtureInactive:created,subscriptionCanceled:providerClean&&Boolean(subscription),recordsRetained:true}));
  }catch(error){console.error('PAID_INVENTORY_CLEANUP_FAILED='+JSON.stringify({code:error.code||'UNCONFIRMED',...proof}));process.exitCode=1;}
  if(passed&&cleanup){console.log('PAID_INVENTORY_PASS='+JSON.stringify({...proof,passed:true,fixtureInactive:true,subscriptionCanceled:true,protectedBillingUnchanged:true}));}
  await closeMssqlPool();
};

try{
  assert.match(tenantId||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.ok(!protectedIds.includes(tenantId));
  assert.ok(['transitions','promotion'].includes(scenario));
  for(const flag of ['MANAGEMENT_BILLING_SANDBOX_ENABLED','MANAGEMENT_BILLING_SCHEMA_READY','MANAGEMENT_RECOVERY_SCHEMA_READY']){assert.equal(process.env[flag],'true');}
  assert.notEqual(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED,'true');
  assert.equal(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).toLowerCase(),protectedIds[0]);
  await stripe.assertAccount();const price=await service.price(BILLING_PRICE);assert.equal(price.unit_amount,500);
  for(const table of ['management_inventory_staging','management_inventory_controls','management_inventory_splits','management_inventory_split_units','management_billing_recovery','management_billing_steps']){
    assert.ok((await store.read('SELECT OBJECT_ID(@name) AS id',{name:'dbo.'+table}))[0]?.id,'Required schema: '+table);
  }
  baseline=await protectedState();
  stage='private_fixture';
  await store.locked(tenantId,async q=>{
    assert.equal((await q('SELECT id FROM dbo.tenants WHERE id=@tenantId',{tenantId})).length,0,'Never replay an existing fixture');
    await q("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@tenantId,'R5 private paid stock acceptance',@slug,'active','development-testing')",{tenantId,slug:'r5-paid-stock-'+tenantId});
    // Non-login synthetic actor exercises the service's existing membership authority.
    await q("INSERT dbo.app_users(id,tenant_id,name,email,role,user_type,status) VALUES(@actorId,@tenantId,'Synthetic paid stock actor',@email,'admin','admin','active')",{tenantId,actorId,email:'r5-paid-stock-'+tenantId+'@example.invalid'});
    await q("INSERT dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@tenantId,@actorId,'admin','active',1)",{tenantId,actorId});
    for(const id of [propertyId,second]){
      await q("INSERT dbo.properties(id,tenant_id,name,status,propertytype,country_code) VALUES(@id,@tenantId,'Private synthetic paid stock','inactive','house','LK')",{id,tenantId});
      await q('UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME() WHERE property_id=@id AND tenant_id=@tenantId',{id,tenantId});
      assert.equal((await q('SELECT property_id FROM dbo.public_listing_preferences WHERE property_id=@id AND tenant_id=@tenantId AND opted_out=1',{id,tenantId})).length,1);
    }
  });created=true;check('isolated_private_fixture');
  // Check the deployed stock/blocker queries before creating provider objects.
  stage='cessation_sql_preflight';
  const stockPreview=await store.locked(tenantId,q=>store.cessationPreviewLocked(q,{tenantId,actorId,propertyId}));
  assert.equal(stockPreview.eligible,true);
  stage='genuine_paid_subscription';providerAttempted=true;
  customer=await write('/v1/customers',{description:'R5 private paid stock '+tenantId,payment_method:'pm_card_visa',
    invoice_settings:{default_payment_method:'pm_card_visa'},metadata:{acceptance_fixture:tenantId}},'customer');
  proof.customerId=customer.id;progress();assert.equal(customer.livemode,false);assert.ok(!customer.email);
  subscription=await write('/v1/subscriptions',{customer:customer.id,items:[{price:BILLING_PRICE,quantity:2}],
    default_payment_method:objectId(customer.invoice_settings.default_payment_method),payment_behavior:'error_if_incomplete',
    metadata:{acceptance_fixture:tenantId}},'subscription');
  proof.subscriptionId=subscription.id;progress();assert.equal(subscription.livemode,false);assert.equal(subscription.status,'active');
  assert.equal(objectId(subscription.customer),customer.id);assert.ok(!subscription.test_clock);
  const invoice=await read('/v1/invoices/'+objectId(subscription.latest_invoice));
  assert.equal(invoice.livemode,false);assert.equal(objectId(invoice.customer),customer.id);assert.equal(invoice.status,'paid');
  assert.equal(invoice.amount_paid,1000);assert.equal(invoice.currency,'usd');assert.equal(invoice.billing_reason,'subscription_create');
  proof.initialInvoice=invoice.id;
  await store.locked(tenantId,async q=>{
    await q(`INSERT dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,market,inventory_json)
      VALUES(@tenantId,@account,@customer,@subscription,@price,'LK',@inventory)`,{tenantId,account:BILLING_ACCOUNT,customer:customer.id,subscription:subscription.id,price:BILLING_PRICE,inventory:JSON.stringify(await store.inventory(tenantId,q))});
  });
  const initial=await service.refresh(tenantId);assert.equal(initial.entitlement.state,'active');assert.equal(await count(),2);
  check('genuine_paid_capacity_reconciled');
  if(scenario==='promotion'){
    const ids=[randomUUID(),randomUUID(),randomUUID()];
    const records=ids.map((id,n)=>({kind:'property',payload:{id,name:'Private paid addition '+n,
      description:'Synthetic staged promotion evidence '+n,propertytype:'house',country_code:'LK',
      rentalvalues:{listingCategory:'residential'},availability:'inactive'}}));
    const stagedRows=()=>store.read('SELECT * FROM dbo.management_inventory_staging WHERE tenant_id=@tenantId ORDER BY id',{tenantId});
    const stockRows=()=>store.read('SELECT id,name,description,status FROM dbo.properties WHERE tenant_id=@tenantId ORDER BY id',{tenantId});
    // Provider webhooks may append unrelated reconciliation audit rows during a
    // no-op retry. Preserve all stock/command audit invariants, excluding only
    // that asynchronous event stream; compare each component independently.
    const operationAudit=()=>store.read("SELECT * FROM dbo.management_billing_audit WHERE tenant_id=@tenantId AND action<>'stripe.event_reconciled' ORDER BY id",{tenantId});
    const snapshot=async()=>({staged:hash(await stagedRows()),stock:hash(await stockRows()),audit:hash(await operationAudit())});
    const unchanged=async before=>{
      const after=await snapshot();
      for(const component of Object.keys(before)){
        if(after[component]!==before[component]){console.log('PAID_INVENTORY_RETRY_DIAGNOSTIC='+JSON.stringify({stage,component,before:before[component],after:after[component]}));}
        assert.equal(after[component],before[component],component);
      }
    };
    const prepare=records=>store.stageStock({tenantId,actorId,records,reason:'Prepare private paid inventory acceptance.'});
    stage='paid_stage_create_import';
    await prepare([records[0]]);await prepare(records.slice(1));
    assert.equal((await stagedRows()).length,3);assert.ok((await stagedRows()).every(r=>r.status==='pending'));
    assert.equal((await stockRows()).length,2);assert.equal(await count(),2);
    assert.equal((await store.inventory(tenantId,undefined,{includePending:true})).length,5);
    check('create_and_import_remain_private_pending');
    stage='paid_stage_retry';
    const stagedSnapshot=await snapshot();await prepare(records);
    await unchanged(stagedSnapshot);check('staging_retry_no_duplicate_effect');
    stage='paid_stage_atomic_conflict';
    const rollback={...records[0],payload:{...records[0].payload,id:randomUUID()}};
    await assert.rejects(()=>prepare([rollback,{...records[1],payload:{...records[1].payload,name:'Conflicting identity'}}]),
      error=>error.code==='BILLING_STOCK_CONFLICT');
    await unchanged(stagedSnapshot);check('conflicting_import_rolls_back_entire_batch');
    stage='paid_stage_nonmember';
    await assert.rejects(()=>store.stageStock({tenantId,actorId:randomUUID(),records:[rollback],reason:'Nonmember must not stage stock.'}),
      error=>error.code==='BILLING_ADMIN_REQUIRED');
    await unchanged(stagedSnapshot);check('nonmember_cannot_stage_stock');
    stage='paid_promotion_preview';
    const preview=await service.quantityPreview({tenantId,actorId,id:randomUUID()});
    assert.equal(preview.from,2);assert.equal(preview.to,5);assert.equal(preview.timing,'prorated_next_invoice');
    assert.equal(await count(),2);assert.ok((await stagedRows()).every(r=>r.status==='pending'));
    assert.equal((await provider()).items.data[0].quantity,2);check('quantity_preview_does_not_promote_stock');
    stage='paid_promotion_apply';
    const apply={tenantId,actorId,id:randomUUID(),previewId:preview.previewId};
    const result=await service.quantityApply(apply);
    assert.equal(result.currentQuantity,5);assert.equal(await count(),5);
    const promoted=await stagedRows();assert.equal(promoted.length,3);
    assert.ok(promoted.every(r=>r.status==='promoted'&&String(r.promotion_command_id).toLowerCase()===apply.id));
    const stock=await stockRows();assert.equal(stock.length,5);
    for(const record of records){
      const row=stock.find(r=>String(r.id).toLowerCase()===record.payload.id);
      assert.ok(row);assert.equal(row.name,record.payload.name);assert.equal(row.description,record.payload.description);
      assert.equal(row.status,'inactive');
    }
    const remote=await provider();assert.equal(remote.items.data[0].quantity,5);
    assert.equal(remote.livemode,false);assert.equal(objectId(remote.latest_invoice),proof.initialInvoice);
    check('paid_quantity_confirmation_promotes_exact_records');
    stage='paid_promotion_retry';
    const promotedSnapshot=await snapshot(),remoteHash=hash(remote);
    assert.deepEqual(await service.quantityApply(apply),result);
    await unchanged(promotedSnapshot);assert.equal(hash(await provider()),remoteHash);
    assert.equal((await stagedRows()).length,3);check('promotion_retry_no_duplicate_effect');
  }else{
  stage='paid_cessation_preview';
  const preview=await service.cessationPreview({tenantId,actorId,propertyId});assert.equal(preview.eligible,true);
  const cease={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:preview.inventoryHash,reason:'Cease private synthetic stock for paid acceptance.'};
  stage='paid_cessation_apply';
  const ceased=await service.ceaseStock(cease);assert.equal(await count(),1);const ceasedSchedule=await scheduled(1);
  check('cessation_defers_provider_reduction_to_renewal');
  const ceaseAudit=await audit();assert.deepEqual(await service.ceaseStock(cease),ceased);
  assert.equal(await audit(),ceaseAudit);assert.equal(await scheduled(1),ceasedSchedule);check('cessation_retry_no_duplicate_effect');
  stage='paid_restoration';
  const restorePreview=await service.restorationPreview({tenantId,actorId,propertyId});
  const restore={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:restorePreview.inventoryHash,reason:'Restore the same synthetic paid property.'};
  const restored=await service.restoreStock(restore);assert.equal(restored.managementRestored,true);assert.equal(await count(),2);
  const restoredSchedule=await scheduled(2);check('restoration_updates_paid_renewal_schedule');
  const restoreAudit=await audit();assert.deepEqual(await service.restoreStock(restore),restored);
  assert.equal(await audit(),restoreAudit);assert.equal(await scheduled(2),restoredSchedule);check('restoration_retry_no_duplicate_effect');
  const controls=await store.read('SELECT property_id,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(controls.length,1);assert.equal(String(controls[0].property_id).toLowerCase(),propertyId);assert.ok(controls[0].restored_at);
  check('original_property_and_cessation_history_retained');
  stage='paid_split';
  const units=[1,2,3].map(n=>({id:randomUUID(),propertyid:propertyId,unitnumber:'Private acceptance unit '+n,availability:'inactive'}));
  const splitPreview=await service.splitPreview({tenantId,actorId,propertyId,units});
  const split={tenantId,actorId,propertyId,units,id:randomUUID(),inventoryHash:splitPreview.inventoryHash,reason:'Split private synthetic property under paid subscription.'};
  const result=await service.splitStock(split);assert.equal(result.splitCompleted,true);assert.equal(await count(),4);
  assert.equal((await store.read('SELECT id FROM dbo.property_units WHERE tenant_id=@tenantId AND propertyid=@propertyId',{tenantId,propertyId})).length,3);
  const splitSchedule=await scheduled(4);assert.equal((await store.account(tenantId)).pending_quantity,4);
  check('split_activates_exact_units_with_next_renewal_quantity');
  const splitAudit=await audit();assert.deepEqual(await service.splitStock(split),result);
  assert.equal(await audit(),splitAudit);assert.equal(await scheduled(4),splitSchedule);check('split_retry_no_duplicate_effect');
  }
  assert.deepEqual(await protectedState(),baseline);check('protected_accounts_subscriptions_and_clocks_unchanged');
  passed=true;
}catch(error){console.error('PAID_INVENTORY_FAILED='+JSON.stringify({stage,code:error.code||'UNCONFIRMED',sqlNumber:Number.isInteger(error.number)?error.number:null,sqlLine:Number.isInteger(error.lineNumber)?error.lineNumber:null,...proof}));process.exitCode=1;}
finally{await cleanupFixture();}
