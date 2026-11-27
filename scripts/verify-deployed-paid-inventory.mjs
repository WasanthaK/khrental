// Genuine sandbox provider acceptance. HTTP permissions are a separate scenario;
// service scenarios do not establish HTTP, and none establishes UI or login.
// HTTP stock mutations use temporary serving readiness and fixture-scoped enforcement;
// its workflow restores original flags. Other scenarios leave serving flags unchanged.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createAuthRecord,revokeAccessToken} from '/app/src/api/auth/index.js';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createBillingService} from '/app/src/api/managementBilling/service.js';
import {createStripeClient,objectId} from '/app/src/api/managementBilling/stripe.js';
import {BILLING_ACCOUNT,BILLING_PRICE,hash} from '/app/src/api/managementBilling/contract.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const tenantId=process.env.PAID_INVENTORY_OPERATION,propertyId=randomUUID(),second=randomUUID();
let actorId=randomUUID();
const scenario=process.env.PAID_INVENTORY_SCENARIO||'transitions';
const httpTransitions=scenario==='http-transitions';
const restorationRenewal=scenario==='restoration-renewal';
const splitRenewal=scenario==='split-renewal';
const zeroStockCancellation=scenario==='zero-stock-cancellation';
const cessationRenewal=scenario==='cessation-renewal'||restorationRenewal||splitRenewal||zeroStockCancellation;
let fixtureClock=null;
let cessationMaintenanceId=null;
let cessationInvoiceId=null,cessationPaymentId=null;
let cessationSettlementId=null,cessationDepositId=null;
let cessationEnquiryId=null,cessationOfferId=null;
const hostedCheckout=scenario==='http-hosted-checkout';
let checkoutSessionId=null,checkoutCommandId=null;
const env={...process.env,MANAGEMENT_INVENTORY_SCHEMA_READY:'true',MANAGEMENT_CESSATION_SCHEMA_READY:'true',
  MANAGEMENT_RESTORATION_SCHEMA_READY:'true',MANAGEMENT_SPLIT_SCHEMA_READY:'true'};
const store=createBillingStore({env}),stripe=createStripeClient(),service=createBillingService({store,stripe,env});
const protectedIds=['80a4b392-13f8-484d-81fa-a110a6ef75f0','2383f4fc-e107-4ac7-9e13-39db501f40ec'];
const proof={operation:tenantId,scenario,checks:[],scope:'genuine sandbox provider + deployed service/SQL',httpAccepted:false,uiAccepted:false};
const httpTokens=[],httpActors=[];
let foreignTenant=null;
let created=false,passed=false,cleanup=false,providerClean=false,stage='preflight',providerAttempted=false,customer,subscription,baseline;
    const makeSession=async(id,role)=>{
      const authId=randomUUID(),email='r5-paid-http-'+id+'@example.invalid';
      if(id!==actorId){
        await store.locked(tenantId,async q=>{
          await q("INSERT dbo.app_users(id,tenant_id,name,email,role,user_type,auth_id,status) VALUES(@id,@tenantId,'Private paid HTTP fixture',@email,@role,@role,@authId,'active')",{id,tenantId,email,role,authId});
          await q("INSERT dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@tenantId,@id,@role,'active',1)",{tenantId,id,role});
        });httpActors.push(id);
      }else{
        await store.locked(tenantId,q=>q('UPDATE dbo.app_users SET auth_id=@authId,email=@email WHERE id=@id AND tenant_id=@tenantId',{authId,email,id,tenantId}));
      }
      const record=await createAuthRecord({authId,appUserId:id,email,role,password:randomBytes(32).toString('base64url'),metadata:{acceptance_fixture:tenantId}});
      const token=randomBytes(32).toString('base64url');httpTokens.push(token);
      const digest=createHash('sha256').update(token).digest('hex');
      await store.locked(tenantId,q=>q('INSERT dbo.auth_sessions(auth_user_id,token_hash,expires_at) VALUES(@id,@digest,DATEADD(MINUTE,5,SYSUTCDATETIME()))',{id:record.id,digest}));
      return token;
    };

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
const audit=async()=>hash(await store.read("SELECT * FROM dbo.management_billing_audit WHERE tenant_id=@tenantId AND action<>'stripe.event_reconciled' ORDER BY id",{tenantId}));
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
    if(hostedCheckout&&checkoutSessionId){
      let session=await read('/v1/checkout/sessions/'+checkoutSessionId);
      assert.equal(session.livemode,false);assert.equal(String(session.metadata.quixo_tenant).toLowerCase(),tenantId);
      // Closing an unfinished session first prevents payment racing fixture cleanup.
      if(session.status==='open'){
        await write('/v1/checkout/sessions/'+session.id+'/expire',{},'expire-checkout');
        session=await read('/v1/checkout/sessions/'+session.id);assert.equal(session.status,'expired');
      }
      customer=await read('/v1/customers/'+objectId(session.customer));
      assert.equal(String(customer.metadata.quixo_tenant).toLowerCase(),tenantId);
      if(objectId(session.subscription)){subscription=await read('/v1/subscriptions/'+objectId(session.subscription));}
      else{assert.equal(session.status,'expired');providerAttempted=false;}
    }
    if(subscription){
      const current=await provider();assert.equal(current.livemode,false);assert.equal(objectId(current.customer),customer.id);
      if(hostedCheckout){assert.equal(String(customer.metadata.quixo_tenant).toLowerCase(),tenantId);}
      else{assert.equal(current.metadata.acceptance_fixture,tenantId);}
      if(current.status!=='canceled'){await stripe.request('DELETE','/v1/subscriptions/'+subscription.id,{invoice_now:false,prorate:false},`paid-stock:${tenantId}:cleanup-subscription`);}
      assert.equal((await provider()).status,'canceled');
      if(await store.account(tenantId)){await service.refresh(tenantId);assert.equal((await store.account(tenantId)).subscription_status,'canceled');}
    }else if(providerAttempted){throw Object.assign(Error('Inspect ambiguous provider creation before cleanup'),{code:'PROVIDER_CREATION_UNCONFIRMED'});}
    providerClean=true;
  }catch(error){console.error('PAID_INVENTORY_CLEANUP_FAILED='+JSON.stringify({code:error.code||'UNCONFIRMED',sqlNumber:Number.isInteger(error.number)?error.number:null,...proof}));process.exitCode=1;}
  try{
    for(const token of httpTokens){
      await revokeAccessToken(token);
      const digest=createHash('sha256').update(token).digest('hex');
      assert.equal((await store.read('SELECT id FROM dbo.auth_sessions WHERE token_hash=@digest AND revoked_at IS NULL',{digest})).length,0);
    }
    if(created){
      if(cessationMaintenanceId){await store.locked(tenantId,q=>q("UPDATE dbo.maintenance_requests SET status='cancelled' WHERE tenant_id=@tenantId AND id=@id AND status='pending'",{tenantId,id:cessationMaintenanceId}));}
      // Status-filtered: a failed run must not leave a synthetic open obligation behind.
      if(cessationPaymentId){await store.locked(tenantId,q=>q("UPDATE dbo.payments SET status='rejected',updatedat=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status='pending'",{tenantId,id:cessationPaymentId}));}
      if(cessationInvoiceId){await store.locked(tenantId,q=>q("UPDATE dbo.invoices SET status='cancelled',updatedat=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status IN ('issued','draft')",{tenantId,id:cessationInvoiceId}));}
      if(cessationDepositId){await store.locked(tenantId,q=>q("UPDATE dbo.tenancy_deposit_transactions SET status='voided',updatedat=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status='received'",{tenantId,id:cessationDepositId}));}
      if(cessationSettlementId){await store.locked(tenantId,q=>q("UPDATE dbo.tenancy_settlements SET status='voided',updatedat=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status='draft'",{tenantId,id:cessationSettlementId}));}
      // Never leave a live hold behind; the enquiry is closed only after its offer is withdrawn.
      if(cessationOfferId){await store.locked(tenantId,q=>q("UPDATE dbo.property_rental_offers SET status='withdrawn',updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND enquiry_id=@id AND status IN('offered','accepted')",{tenantId,id:cessationOfferId}));}
      if(cessationEnquiryId){await store.locked(tenantId,q=>q("UPDATE dbo.property_enquiries SET status='closed',updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status IN('pending','responded')",{tenantId,id:cessationEnquiryId}));}
      for(let attempt=0;attempt<3;attempt++){
      try{await store.locked(tenantId,async q=>{
        for(const id of httpActors){
          await q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@id",{tenantId,id});
          await q("UPDATE dbo.app_users SET status='inactive' WHERE id=@id AND tenant_id=@tenantId",{tenantId,id});
        }
        if(foreignTenant){await q("UPDATE dbo.tenants SET status='inactive' WHERE id=@foreignTenant",{foreignTenant});}
        // Ceased records reject all UPDATEs, including a redundant status write.
        await q("UPDATE dbo.properties SET status='inactive' WHERE tenant_id=@tenantId AND status<>'inactive'",{tenantId});
        await q('UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId',{tenantId});
        await q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId,actorId});
        await q("UPDATE dbo.app_users SET status='inactive' WHERE id=@actorId AND tenant_id=@tenantId",{tenantId,actorId});
        await q("UPDATE dbo.tenants SET status='inactive' WHERE id=@tenantId",{tenantId});
      });break;}catch(error){
        if(error.number!==1205||attempt===2){throw error;}
        console.log('PAID_CLEANUP_SQL_DEADLOCK_RETRY='+String(attempt+1));await delay(1000*(attempt+1));
      }}
      assert.equal((await store.read("SELECT id FROM dbo.properties WHERE tenant_id=@tenantId AND (status IS NULL OR status<>'inactive')",{tenantId})).length,0);
      assert.equal((await store.read("SELECT id FROM dbo.tenants WHERE id=@tenantId AND status='inactive'",{tenantId})).length,1);
      assert.equal((await store.read("SELECT id FROM dbo.app_users WHERE id=@actorId AND status='inactive'",{actorId})).length,1);
      assert.equal((await store.read("SELECT id FROM dbo.tenant_memberships WHERE tenant_id=@tenantId AND status='active'",{tenantId})).length,0);
      assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=0',{tenantId})).length,0);
      for(const id of httpActors){assert.equal((await store.read("SELECT id FROM dbo.app_users WHERE id=@id AND status='inactive'",{id})).length,1);}
      if(foreignTenant){assert.equal((await store.read("SELECT id FROM dbo.tenants WHERE id=@foreignTenant AND status='inactive'",{foreignTenant})).length,1);}
      if(cessationSettlementId){
        assert.equal((await store.read("SELECT id FROM dbo.tenancy_settlements WHERE tenant_id=@tenantId AND status<>'voided'",{tenantId})).length,0);
        assert.equal((await store.read("SELECT id FROM dbo.tenancy_deposit_transactions WHERE tenant_id=@tenantId AND status<>'voided'",{tenantId})).length,0);
      }
      if(cessationInvoiceId){
        assert.equal((await store.read("SELECT id FROM dbo.invoices WHERE tenant_id=@tenantId AND status<>'cancelled'",{tenantId})).length,0);
        assert.equal((await store.read("SELECT id FROM dbo.payments WHERE tenant_id=@tenantId AND status<>'rejected'",{tenantId})).length,0);
      }
      if(cessationOfferId){
        assert.equal((await store.read("SELECT enquiry_id FROM dbo.property_rental_offers WHERE tenant_id=@tenantId AND status IN('offered','accepted','agreement')",{tenantId})).length,0);
        assert.equal((await store.read("SELECT id FROM dbo.property_enquiries WHERE tenant_id=@tenantId AND status IN('pending','responded')",{tenantId})).length,0);
      }
    }
    if(baseline){assert.deepEqual(await protectedState(),baseline);}
    cleanup=providerClean;
    console.log('PAID_INVENTORY_CLEANUP='+JSON.stringify({verified:cleanup,fixtureInactive:created,subscriptionCanceled:providerClean&&Boolean(subscription),recordsRetained:true}));
  }catch(error){console.error('PAID_INVENTORY_CLEANUP_FAILED='+JSON.stringify({code:error.code||'UNCONFIRMED',sqlNumber:Number.isInteger(error.number)?error.number:null,...proof}));process.exitCode=1;}
  if(passed&&cleanup){console.log('PAID_INVENTORY_PASS='+JSON.stringify({...proof,passed:true,fixtureInactive:true,subscriptionCanceled:true,protectedBillingUnchanged:true}));}
  await closeMssqlPool();
};


async function verifyCessationResponseLoss() {
  stage = 'cessation_response_loss';
  const initialStock = await store.inventory(tenantId);
  const preview = await service.cessationPreview({tenantId, actorId, propertyId});
  assert.equal(preview.eligible, true);
  const id = randomUUID();
  const args = {tenantId, actorId, propertyId, id, inventoryHash: preview.inventoryHash,
    reason: 'Recover the original paid cessation after its schedule response was lost.'};
  const keyPrefix = `quixo:${tenantId}:${id}`;
  let createdSchedule, phaseKey;
  const client = {...stripe, request: async (method, path, body, key) => {
    if (method === 'GET') { return stripe.request(method, path, body, key); }
    assert.equal(method, 'POST');
    assert.equal(phaseKey, undefined, 'Recovery and exact retry must be read-only at Stripe');
    if (!createdSchedule) {
      assert.equal(path, '/v1/subscription_schedules');
      assert.equal(key.toLowerCase(), keyPrefix + ':schedule');
      assert.equal(body.from_subscription, subscription.id);
      const value = await stripe.request(method, path, body, key);
      assert.equal(objectId(value.subscription), subscription.id);
      createdSchedule = value.id;
      return value;
    }
    assert.equal(path, '/v1/subscription_schedules/' + createdSchedule);
    assert.equal(key.toLowerCase(), keyPrefix + ':phases');
    assert.deepEqual(body.phases.map(p => p.items[0].quantity), [2, 1]);
    const value = await stripe.request(method, path, body, key);
    assert.equal(value.id, createdSchedule);
    phaseKey = key;
    throw Object.assign(Error('Discarded the successful fixture schedule response'), {code:'STRIPE_UNAVAILABLE', status:503});
  }};
  const subject = createBillingService({store, stripe:client, env});
  const command = async () => {
    const rows = await store.read(`SELECT c.id,c.status,r.state,r.attempts,
      CASE WHEN r.next_attempt_at<=SYSUTCDATETIME() AND r.lease_until IS NULL THEN 1 ELSE 0 END AS due
      FROM dbo.management_billing_commands c JOIN dbo.management_billing_recovery r ON r.command_id=c.id
      WHERE c.tenant_id=@tenantId AND c.kind='cessation'`, {tenantId});
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id.toLowerCase(), id);
    return rows[0];
  };
  const steps = () => store.read(`SELECT name,idempotency_key,result_json,completed_at FROM dbo.management_billing_steps
    WHERE command_id=@id ORDER BY name`, {id});
  const controls = () => store.read('SELECT id,property_id FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId', {tenantId});
  const audits = () => store.read(`SELECT action FROM dbo.management_billing_audit WHERE tenant_id=@tenantId
    AND resource_id=@id AND action IN ('inventory.ceased','sandbox.cessation.recovered') ORDER BY action`, {tenantId,id});

  await assert.rejects(subject.ceaseStock(args), {code:'STRIPE_UNAVAILABLE'});
  assert.ok(phaseKey);
  const remote = await scheduled(1);
  assert.equal(proof.scheduleId, createdSchedule);
  const pending = await command();
  assert.equal(pending.status, 'pending');
  assert.equal(pending.state, 'pending');
  assert.equal(pending.attempts, 1);
  const beforeSteps = await steps();
  assert.deepEqual(beforeSteps.map(s => s.name), ['create_schedule','set_schedule_phases']);
  assert.ok(beforeSteps[0].completed_at);
  assert.equal(beforeSteps[1].completed_at, null);
  assert.equal(beforeSteps[1].idempotency_key, phaseKey);
  assert.deepEqual(await store.inventory(tenantId), initialStock);
  assert.deepEqual(await controls(), []);
  assert.deepEqual(await audits(), []);
  check('provider_applied_original_phases_while_both_dwellings_remained_managed');

  const deadline = Date.now() + 90000;
  while (!(await command()).due) {
    assert.ok(Date.now() < deadline, 'Original cessation did not become due');
    await delay(2000);
  }
  const result = await subject.ceaseStock(args);
  assert.equal(result.managementEnded, true);
  assert.equal(result.currentQuantity, 2);
  assert.equal(result.nextRenewalQuantity, 1);
  const after = await command();
  assert.equal(after.status, 'completed');
  assert.equal(after.state, 'succeeded');
  assert.equal(after.attempts, 2);
  const finished = await steps();
  assert.deepEqual(finished[0], beforeSteps[0]);
  assert.equal(finished.length, 2);
  assert.equal(finished[1].idempotency_key, phaseKey);
  assert.ok(finished[1].completed_at);
  const evidence = JSON.parse(finished[1].result_json);
  assert.equal(evidence.scheduleId, createdSchedule);
  assert.equal(evidence.nextQuantity, 1);
  const event = await read('/v1/events/' + evidence.eventId);
  assert.equal(event.livemode, false);
  assert.equal(event.type, 'subscription_schedule.updated');
  assert.equal(event.request.idempotency_key, phaseKey);
  assert.equal(event.data.object.id, createdSchedule);
  check('attempt_two_confirmed_the_original_stripe_event_without_a_write');

  const finalControls = await controls();
  assert.equal(finalControls.length, 1);
  assert.equal(finalControls[0].id.toLowerCase(), id);
  assert.equal(finalControls[0].property_id.toLowerCase(), propertyId);
  const remainingStock = await store.inventory(tenantId);
  assert.deepEqual(remainingStock.map(item => item.propertyId.toLowerCase()), [second]);
  assert.deepEqual((await audits()).map(row => row.action), ['inventory.ceased','sandbox.cessation.recovered']);
  const beforeRetryAudit = await audit();
  assert.deepEqual(await subject.ceaseStock(args), result);
  assert.deepEqual(await command(), after);
  assert.deepEqual(await controls(), finalControls);
  assert.deepEqual(await steps(), finished);
  assert.equal(await audit(), beforeRetryAudit);
  assert.deepEqual(await store.inventory(tenantId), remainingStock);
  assert.equal((await store.account(tenantId)).pending_quantity, 1);
  assert.equal(await scheduled(1), remote);
  const invoices = await read('/v1/invoices', {customer:customer.id, limit:100});
  assert.equal(invoices.has_more, false);
  assert.deepEqual(invoices.data.map(i => [i.id,i.status,i.amount_paid,i.total,i.currency]), [[proof.initialInvoice,'paid',1000,1000,'usd']]);
  check('exact_retry_preserved_one_cessation_one_recovery_audit_and_one_paid_invoice');
  Object.assign(proof, {cessationResponseLossAccepted:true, cessationCommandId:id, phaseIdempotencyKey:phaseKey, scheduleEventId:event.id});
}

async function verifyInvoicePreviewRecovery() {
  stage='invoice_preview_recovery';
  const property=randomUUID();
  await store.stageStock({tenantId,actorId,reason:'Preview one additional private dwelling.',records:[{
    kind:'property',payload:{id:property,name:'Private preview fixture',propertytype:'house',country_code:'LK',
      availability:'inactive',rentalvalues:{listingCategory:'residential'}}
  }]});
  try {
    for(const expire of [false,true]){
      const args={tenantId,actorId,id:randomUUID()};
      const posts=[];
      let nowOverride;
      const client={...stripe,request:async(method,path,body,key)=>{
        if(method==='GET'){return stripe.request(method,path,body,key);}
        assert.equal(method,'POST');
        assert.equal(path,'/v1/invoices/create_preview');
        assert.equal(body.customer,customer.id);
        assert.equal(body.subscription,subscription.id);
        assert.equal(body.subscription_details.items[0].quantity,3);
        assert.equal(key.toLowerCase(),`quixo:${tenantId}:${args.id}`);
        if(posts.length){
          assert.equal(expire,false);
          assert.equal(posts.length,1);
          assert.equal(key,posts[0].key);
          assert.deepEqual(body,posts[0].body);
        }
        const value=await stripe.request(method,path,body,key);
        posts.push({body:structuredClone(body),key,total:value.total});
        if(posts.length===1){throw Object.assign(Error('Discarded fixture preview response'),{code:'STRIPE_UNAVAILABLE',status:503});}
        return value;
      }};
      const subject=createBillingService({store,stripe:client,env,clock:{now:()=>nowOverride??Date.now()}});
      await assert.rejects(subject.quantityPreview(args),{code:'STRIPE_UNAVAILABLE'});
      assert.equal(posts.length,1);
      const recoveryRow=async()=> (await store.read(`SELECT attempts,state,
        CASE WHEN next_attempt_at<=SYSUTCDATETIME() AND lease_until IS NULL THEN 1 ELSE 0 END AS due
        FROM dbo.management_billing_recovery r JOIN dbo.management_billing_commands c ON c.id=r.command_id WHERE r.command_id=@id AND c.tenant_id=@tenantId`,args))[0];
      const deadline=Date.now()+90000;
      let row=await recoveryRow();
      while(!row.due && Date.now()<deadline){await delay(2000);row=await recoveryRow();}
      assert.equal(row.attempts,1);assert.equal(row.state,'pending');assert.equal(row.due,1);
      if(expire){
        nowOverride=(posts[0].body.subscription_details.proration_date+601)*1000;
        await assert.rejects(subject.quantityPreview(args),{code:'BILLING_REVIEW_EXPIRED'});
        assert.equal(posts.length,1);
        check('expired_preview_requires_fresh_review_without_provider_retry_controlled_clock');
      }else{
        const result=await subject.quantityPreview(args);
        assert.equal(result.from,2);assert.equal(result.to,3);
        assert.equal(result.nextInvoiceTotalMinor,posts[0].total);
        assert.deepEqual(await subject.quantityPreview(args),result);
        assert.equal(posts.length,2);
        check('lost_preview_recovered_with_original_key_and_proration');
      }
      row=await recoveryRow();
      assert.equal(row.attempts,2);assert.equal(row.state,'succeeded');
      const steps=await store.read('SELECT name,idempotency_key,completed_at FROM dbo.management_billing_steps WHERE command_id=@id',args);
      assert.equal(steps.length,1);assert.equal(steps[0].name,'preview_invoice');
      assert.equal(steps[0].idempotency_key,posts[0].key);
      assert.equal(Boolean(steps[0].completed_at),!expire);
      const audits=await store.read("SELECT id FROM dbo.management_billing_audit WHERE tenant_id=@tenantId AND resource_id=@id AND action='sandbox.quantity_preview.recovered'",args);
      assert.equal(audits.length,1);
    }
    const invoices=await read('/v1/invoices',{customer:customer.id,limit:100});
    assert.equal(invoices.has_more,false);
    assert.deepEqual(invoices.data.map(value=>value.id),[proof.initialInvoice]);
    assert.equal((await provider()).items.data[0].quantity,2);
    assert.equal(await count(),2);
    check('preview_created_no_payable_invoice_or_quantity_change');
    proof.invoicePreviewRecoveryAccepted=true;
  } finally {
    await store.withdrawStock({tenantId,actorId,ids:[property],reason:'Retire private preview fixture.'});
  }
}

const advanceFixtureClock=async(target,key)=>{
    const ownedCustomer=await read('/v1/customers/'+customer.id),ownedSub=await provider();
    assert.equal(ownedCustomer.livemode,false);assert.equal(ownedCustomer.metadata.acceptance_fixture,tenantId);
    assert.equal(objectId(ownedCustomer.test_clock),fixtureClock.id);assert.equal(objectId(ownedSub.test_clock),fixtureClock.id);
    assert.equal(ownedSub.metadata.acceptance_fixture,tenantId);assert.equal(objectId(ownedSub.customer),customer.id);
    const current=await read('/v1/test_helpers/test_clocks/'+fixtureClock.id);
    assert.equal(current.name,'r5-'+scenario+'-'+tenantId);assert.equal(current.status,'ready');assert.ok(target>current.frozen_time);
    await write('/v1/test_helpers/test_clocks/'+fixtureClock.id+'/advance',{frozen_time:target},key);
    for(let attempt=0;attempt<90;attempt++){
      const clock=await read('/v1/test_helpers/test_clocks/'+fixtureClock.id);
      if(clock.status==='ready'){assert.equal(clock.frozen_time,target);return;}
      assert.equal(clock.status,'advancing');await delay(2000);
    }
    throw Object.assign(Error('Fixture clock did not become ready'),{code:'FIXTURE_CLOCK_TIMEOUT'});
  };

const verifyCessationRenewal=async()=>{
  const quantity=splitRenewal?4:restorationRenewal?2:1,amount=quantity*500;
  let splitArgs,splitResult;
  proof.scope='genuine sandbox '+scenario+' + deployed service/SQL reconciliation';
  proof.credentialLoginAccepted=false;proof.actualRenewalAccepted=false;
  if(splitRenewal){
    stage='renewal_split_preview';
    const units=[1,2,3].map(n=>({id:randomUUID(),propertyid:propertyId,unitnumber:'Private renewal unit '+n,availability:'inactive'}));
    const preview=await service.splitPreview({tenantId,actorId,propertyId,units});
    splitArgs={tenantId,actorId,propertyId,units,id:randomUUID(),inventoryHash:preview.inventoryHash,reason:'Verify split units replace the parent dwelling in the actual next sandbox renewal.'};
    stage='renewal_split_apply';
    splitResult=await service.splitStock(splitArgs);assert.equal(splitResult.splitCompleted,true);assert.equal(await count(),4);
    const schedule=await scheduled(4),beforeAudit=await audit();
    assert.equal((await store.account(tenantId)).pending_quantity,4);
    assert.equal((await read('/v1/invoices/'+proof.initialInvoice)).amount_paid,1000);
    check('split_preserves_current_invoice_and_schedules_four');
    assert.deepEqual(await service.splitStock(splitArgs),splitResult);
    assert.equal(await scheduled(4),schedule);assert.equal(await audit(),beforeAudit);assert.equal(await count(),4);
    check('split_retry_preserves_schedule_audit_and_unit_count');
  }else{
  stage='renewal_cessation_preview';
  const preview=await service.cessationPreview({tenantId,actorId,propertyId});assert.equal(preview.eligible,true);
  const args={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:preview.inventoryHash,reason:'Verify one ceased dwelling is excluded from the actual next sandbox renewal.'};
  stage='renewal_cessation_apply';
  const result=await service.ceaseStock(args);assert.equal(await count(),1);
  const schedule=await scheduled(1),beforeAudit=await audit();
  assert.equal((await read('/v1/invoices/'+proof.initialInvoice)).amount_paid,1000);
  check('cessation_preserves_current_paid_invoice_and_schedules_one');
  assert.deepEqual(await service.ceaseStock(args),result);
  assert.equal(await scheduled(1),schedule);assert.equal(await audit(),beforeAudit);
  check('cessation_retry_preserves_schedule_and_audit');
  if(restorationRenewal){
    stage='renewal_restoration_preview';
    const restorePreview=await service.restorationPreview({tenantId,actorId,propertyId});
    const restore={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:restorePreview.inventoryHash,reason:'Verify restored dwelling is included in the actual next sandbox renewal.'};
    stage='renewal_restoration_apply';
    const restored=await service.restoreStock(restore);assert.equal(restored.managementRestored,true);assert.equal(await count(),2);
    const restoreSchedule=await scheduled(2),restoreAudit=await audit();
    assert.equal((await read('/v1/invoices/'+proof.initialInvoice)).amount_paid,1000);
    check('restoration_preserves_current_invoice_and_schedules_two');
    assert.deepEqual(await service.restoreStock(restore),restored);
    assert.equal(await scheduled(2),restoreSchedule);assert.equal(await audit(),restoreAudit);
    check('restoration_retry_preserves_schedule_and_audit');
  }
  }
  const boundary=(await provider()).items.data[0].current_period_end;

  stage='renewal_boundary';await advanceFixtureClock(boundary,'renewal-boundary');
  let renewed=await provider();
  assert.equal(renewed.items.data[0].quantity,quantity);assert.notEqual(objectId(renewed.latest_invoice),proof.initialInvoice);
  proof.renewalInvoice=objectId(renewed.latest_invoice);
  const draft=await read('/v1/invoices/'+proof.renewalInvoice);
  assert.equal(draft.billing_reason,'subscription_cycle');assert.equal(draft.total,amount);assert.equal(draft.currency,'usd');
  assert.equal(objectId(draft.customer),customer.id);assert.equal(draft.livemode,false);
  check(splitRenewal?'renewal_boundary_applies_four_split_dwellings':restorationRenewal?'renewal_boundary_applies_two_restored_dwellings':'renewal_boundary_applies_one_dwelling_quantity');
  stage='renewal_automatic_payment';await advanceFixtureClock(boundary+3600,'renewal-payment');
  let invoice;
  for(let attempt=0;attempt<60;attempt++){
    invoice=await read('/v1/invoices/'+proof.renewalInvoice);
    if(invoice.status==='paid'){break;}await delay(2000);
  }
  assert.equal(invoice.status,'paid');assert.equal(invoice.amount_paid,amount);assert.equal(invoice.amount_remaining,0);
  assert.equal(invoice.lines.has_more,false);assert.equal(invoice.lines.data.length,1);
  assert.equal(invoice.lines.data[0].quantity,quantity);assert.equal(invoice.lines.data[0].amount,amount);
  assert.equal(invoice.lines.data[0].period.start,boundary);
  assert.equal(objectId(invoice.parent?.subscription_details?.subscription||invoice.subscription),subscription.id);
  const invoices=await read('/v1/invoices',{customer:customer.id,subscription:subscription.id,limit:100});
  assert.equal(invoices.has_more,false);assert.equal(invoices.data.length,2);
  assert.deepEqual(invoices.data.map(i=>i.id).sort(),[proof.initialInvoice,proof.renewalInvoice].sort());
  check(splitRenewal?'automatic_renewal_paid_exactly_four_dwellings_without_extra_invoice':restorationRenewal?'automatic_renewal_paid_exactly_two_dwellings_without_extra_invoice':'automatic_renewal_paid_exactly_one_dwelling_without_extra_invoice');
  stage='renewal_application_projection';
  const refreshed=await service.refresh(tenantId),account=await store.account(tenantId);
  assert.equal(refreshed.entitlement.state,'active');assert.equal(refreshed.billedQuantity,quantity);
  assert.equal(account.quantity,quantity);assert.equal(account.pending_quantity,null);assert.equal(await count(),quantity);
  assert.ok(new Date(account.paid_through).getTime()>=invoice.lines.data[0].period.end*1000);
  check('renewal_reconciles_paid_capacity_and_clears_pending_quantity');
  stage='renewal_refresh_retry';
  const financial=value=>({id:value.id,customer:objectId(value.customer),subscription:objectId(value.parent?.subscription_details?.subscription||value.subscription),
    livemode:value.livemode,status:value.status,currency:value.currency,total:value.total,paid:value.amount_paid,remaining:value.amount_remaining,reason:value.billing_reason,
    lines:value.lines.data.map(line=>({id:line.id,quantity:line.quantity,amount:line.amount,period:line.period,price:objectId(line.pricing?.price_details?.price||line.price)}))});
  const stockBefore=hash(await store.inventory(tenantId)),invoiceBefore=financial(invoice);
  await service.refresh(tenantId);
  stage='renewal_retry_stock';assert.equal(hash(await store.inventory(tenantId)),stockBefore);
  stage='renewal_retry_invoice';assert.deepEqual(financial(await read('/v1/invoices/'+proof.renewalInvoice)),invoiceBefore);
  const retriedInvoices=await read('/v1/invoices',{customer:customer.id,subscription:subscription.id,limit:100});
  assert.equal(retriedInvoices.has_more,false);assert.deepEqual(retriedInvoices.data.map(i=>i.id).sort(),[proof.initialInvoice,proof.renewalInvoice].sort());
  assert.equal((await store.account(tenantId)).quantity,quantity);
  check('renewal_refresh_retry_preserves_stock_and_invoice');
  if(splitRenewal){
    stage='retained_split_history';
    const splits=await store.read('SELECT command_id,property_id,state,activated_at FROM dbo.management_inventory_splits WHERE tenant_id=@tenantId',{tenantId});
    assert.equal(splits.length,1);assert.equal(String(splits[0].command_id).toLowerCase(),splitArgs.id);
    assert.equal(String(splits[0].property_id).toLowerCase(),propertyId);assert.equal(splits[0].state,'active');assert.ok(splits[0].activated_at);
    const units=await store.read('SELECT id,propertyid,parent_stock_id,split_operation_id,stock_type,status,unitnumber FROM dbo.property_units WHERE tenant_id=@tenantId ORDER BY id',{tenantId});
    assert.equal(units.length,3);
    for(const expected of splitArgs.units){
      const unit=units.find(u=>String(u.id).toLowerCase()===expected.id);assert.ok(unit);
      assert.equal(String(unit.propertyid).toLowerCase(),propertyId);assert.equal(String(unit.parent_stock_id).toLowerCase(),propertyId);
      assert.equal(String(unit.split_operation_id).toLowerCase(),splitArgs.id);assert.equal(unit.stock_type,'apartment_unit');
      assert.equal(unit.status,'inactive');assert.equal(unit.unitnumber,expected.unitnumber);
    }
    const reserved=await store.read('SELECT id FROM dbo.management_inventory_split_units WHERE command_id=@id',{id:splitArgs.id});
    assert.deepEqual(reserved.map(u=>String(u.id).toLowerCase()).sort(),splitArgs.units.map(u=>u.id).sort());
    const beforeRetry={units:hash(units),audit:await audit(),stock:hash(await store.inventory(tenantId))};
    assert.deepEqual(await service.splitStock(splitArgs),splitResult);
    assert.equal(await audit(),beforeRetry.audit);assert.equal(hash(await store.inventory(tenantId)),beforeRetry.stock);
    assert.equal(hash(await store.read('SELECT id,propertyid,parent_stock_id,split_operation_id,stock_type,status,unitnumber FROM dbo.property_units WHERE tenant_id=@tenantId ORDER BY id',{tenantId})),beforeRetry.units);
  }else{
  stage='retained_cessation_history';
  const controls=await store.read('SELECT property_id,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(controls.length,1);assert.equal(String(controls[0].property_id).toLowerCase(),propertyId);if(restorationRenewal){assert.ok(controls[0].restored_at);}else{assert.equal(controls[0].restored_at,null);}
  }
  stage='retained_property_states';
  const retained=await store.read('SELECT id,status FROM dbo.properties WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(retained.length,2);
  assert.equal(retained.find(p=>String(p.id).toLowerCase()===propertyId)?.status,restorationRenewal?'available':'inactive');
  assert.equal(retained.find(p=>String(p.id).toLowerCase()===second)?.status,'inactive');
  stage='retained_listing_privacy';
  assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=1',{tenantId})).length,2);
  check(splitRenewal?'split_identity_history_and_private_records_retained_after_renewal':restorationRenewal?'restored_history_and_private_records_retained_after_renewal':'ceased_history_and_private_records_retained_after_renewal');
  proof.actualRenewalAccepted=true;proof.renewalQuantity=quantity;proof.renewalAmountMinor=amount;proof.clockAdvancedTo=boundary+3600;
};



const verifyZeroStockCancellation=async()=>{
  proof.scope='genuine sandbox final-dwelling cancellation + deployed service/SQL reconciliation';
  proof.credentialLoginAccepted=false;proof.zeroStockCancellationAccepted=false;
  stage='zero_stock_first_cessation';
  const firstPreview=await service.cessationPreview({tenantId,actorId,propertyId});assert.equal(firstPreview.eligible,true);
  const firstArgs={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:firstPreview.inventoryHash,reason:'Verify the final-dwelling cancellation releases the existing reduction schedule.'};
  const firstResult=await service.ceaseStock(firstArgs);assert.equal(await count(),1);
  const scheduleBefore=await scheduled(1),firstAudit=await audit(),scheduleId=objectId((await provider()).schedule);
  check('first_cessation_preserves_paid_invoice_and_schedules_one');
  assert.deepEqual(await service.ceaseStock(firstArgs),firstResult);
  assert.equal(await scheduled(1),scheduleBefore);assert.equal(await audit(),firstAudit);
  check('first_cessation_retry_preserves_schedule_and_audit');

  stage='zero_stock_final_cessation';
  const preview=await service.cessationPreview({tenantId,actorId,propertyId:second});assert.equal(preview.eligible,true);
  const args={tenantId,actorId,propertyId:second,id:randomUUID(),inventoryHash:preview.inventoryHash,reason:'Verify zero managed dwellings cancel at the paid boundary with retained history and no renewal invoice.'};
  const result=await service.ceaseStock(args);
  assert.equal(result.managementEnded,true);assert.equal(result.cancelAtPeriodEnd,true);
  assert.equal(result.nextRenewalQuantity,0);assert.equal(result.timing,'cancel_at_renewal');assert.equal(await count(),0);
  const ending=await provider(),boundary=ending.items.data[0].current_period_end;
  assert.equal(ending.status,'active');assert.equal(ending.cancel_at_period_end,true);assert.equal(ending.cancel_at,boundary);
  assert.ok(!objectId(ending.schedule));assert.equal(ending.items.data[0].quantity,2);
  assert.equal(objectId(ending.latest_invoice),proof.initialInvoice);
  const released=await read('/v1/subscription_schedules/'+scheduleId);
  assert.equal(released.status,'released');assert.equal(objectId(released.released_subscription),subscription.id);
  const endingView=await service.refresh(tenantId),endingAccount=await store.account(tenantId);
  assert.equal(endingView.entitlement.state,'ending');assert.equal(endingView.entitlement.management,true);
  assert.equal(endingAccount.pending_quantity,0);assert.ok(!endingAccount.stripe_schedule_id);
  const initial=await read('/v1/invoices/'+proof.initialInvoice);
  assert.equal(initial.status,'paid');assert.equal(initial.total,1000);assert.equal(initial.amount_paid,1000);
  check('final_cessation_releases_schedule_and_cancels_at_paid_boundary');

  const snapshot=async()=>({
    audit:await audit(),stock:hash(await store.inventory(tenantId)),
    controls:hash(await store.read('SELECT property_id,ceased_at,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId ORDER BY property_id',{tenantId}))
  });
  const canceledFields=sub=>({id:sub.id,status:sub.status,cancelAt:sub.cancel_at,cancelAtPeriodEnd:sub.cancel_at_period_end,
    schedule:objectId(sub.schedule),invoice:objectId(sub.latest_invoice),quantity:sub.items.data[0].quantity});
  const before=await snapshot(),providerBefore=canceledFields(ending);
  assert.deepEqual(await service.ceaseStock(args),result);assert.deepEqual(await snapshot(),before);
  assert.deepEqual(canceledFields(await provider()),providerBefore);
  check('final_cessation_retry_preserves_cancellation_stock_and_history');

  stage='zero_stock_paid_boundary';
  await advanceFixtureClock(boundary,'zero-stock-boundary');
  const terminal=await provider();assert.equal(terminal.status,'canceled');assert.equal(terminal.ended_at,boundary);
  assert.equal(objectId(terminal.latest_invoice),proof.initialInvoice);
  check('zero_stock_subscription_cancels_at_paid_boundary');
  stage='zero_stock_no_renewal';
  await advanceFixtureClock(boundary+3600,'zero-stock-invoice-window');
  const invoices=await read('/v1/invoices',{customer:customer.id,subscription:subscription.id,limit:100});
  assert.equal(invoices.has_more,false);assert.deepEqual(invoices.data.map(i=>i.id),[proof.initialInvoice]);
  const retainedInvoice=await read('/v1/invoices/'+proof.initialInvoice);
  assert.equal(retainedInvoice.status,'paid');assert.equal(retainedInvoice.total,1000);assert.equal(retainedInvoice.amount_paid,1000);
  assert.equal(retainedInvoice.amount_remaining,0);
  const refreshed=await service.refresh(tenantId),account=await store.account(tenantId);
  assert.equal(account.subscription_status,'canceled');assert.equal(await count(),0);
  assert.equal(refreshed.entitlement.state,'read_only');assert.equal(refreshed.entitlement.management,false);
  assert.equal(refreshed.entitlement.historicalAccess,true);
  check('zero_stock_has_no_renewal_invoice_and_reconciles_read_only');

  stage='zero_stock_retained_history';
  const controls=await store.read('SELECT property_id,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId',{tenantId});
  assert.deepEqual(controls.map(c=>String(c.property_id).toLowerCase()).sort(),[propertyId,second].sort());
  assert.ok(controls.every(c=>c.restored_at===null));
  const properties=await store.read('SELECT id,status FROM dbo.properties WHERE tenant_id=@tenantId',{tenantId});
  assert.deepEqual(properties.map(p=>String(p.id).toLowerCase()).sort(),[propertyId,second].sort());
  assert.ok(properties.every(p=>p.status==='inactive'));
  const privateIds=await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=1',{tenantId});
  assert.deepEqual(privateIds.map(p=>String(p.property_id).toLowerCase()).sort(),[propertyId,second].sort());
  const retained=await snapshot();
  assert.deepEqual(await service.ceaseStock(firstArgs),firstResult);assert.deepEqual(await service.ceaseStock(args),result);
  await service.refresh(tenantId);assert.deepEqual(await snapshot(),retained);
  const finalInvoices=await read('/v1/invoices',{customer:customer.id,subscription:subscription.id,limit:100});
  assert.equal(finalInvoices.has_more,false);assert.deepEqual(finalInvoices.data.map(i=>i.id),[proof.initialInvoice]);
  check('zero_stock_retains_private_history_and_terminal_retries');
  proof.zeroStockCancellationAccepted=true;proof.renewalInvoiceCreated=false;proof.inventoryQuantity=0;
  proof.subscriptionCanceledAtBoundary=true;proof.clockAdvancedTo=boundary+3600;
};


async function verifyOpenTenancyCessation() {
  const agreementId=randomUUID();
  const target={tenantId,actorId,propertyId};
  const preview=()=>service.cessationPreview(target);
  const closeAgreement=()=>store.locked(tenantId,q=>q(
    "UPDATE dbo.agreements SET status='closed' WHERE tenant_id=@tenantId AND propertyid=@propertyId AND id=@agreementId AND status='active'",
    {...target,agreementId}));
  stage='open_tenancy_clean_review';
  const clean=await preview();
  assert.equal(clean.eligible,true);assert.deepEqual(clean.blockers,[]);
  const command={...target,id:randomUUID(),inventoryHash:clean.inventoryHash,reason:'Verify an active tenancy protects its dwelling.'};
  await store.locked(tenantId,q=>q(
    "INSERT dbo.agreements(id,tenant_id,propertyid,status,title) VALUES(@agreementId,@tenantId,@propertyId,'active','Private cessation fixture')",
    {...target,agreementId}));
  try {
    stage='open_tenancy_refusal';
    const blocked=await preview();
    assert.equal(blocked.eligible,false);assert.equal(blocked.inventoryHash,clean.inventoryHash);
    assert.deepEqual(blocked.blockers.map(({code,count})=>({code,count})),[{code:'TENANCY_OPEN',count:1}]);
    const state=async()=>({
      commands:await store.read('SELECT * FROM dbo.management_billing_commands WHERE tenant_id=@tenantId ORDER BY id',{tenantId}),
      controls:await store.read('SELECT * FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId ORDER BY id',{tenantId}),
      agreement:await store.read('SELECT * FROM dbo.agreements WHERE tenant_id=@tenantId AND id=@agreementId',{tenantId,agreementId}),
      stock:await store.inventory(tenantId),audit:await audit()
    });
    const before=await state();
    const guarded=createBillingService({store,env,stripe:{...stripe,request:(method,...args)=>{
      assert.equal(method,'GET','Cessation must refuse before any provider write');
      return stripe.request(method,...args);
    }}});
    await assert.rejects(guarded.ceaseStock(command),{code:'BILLING_CESSATION_BLOCKED'});
    await assert.rejects(guarded.ceaseStock(command),{code:'BILLING_CESSATION_BLOCKED'});
    assert.deepEqual(await state(),before);
    check('active_tenancy_blocks_stale_confirmation_and_retry_without_provider_write');
  } finally {
    await closeAgreement();
  }
  stage='closed_tenancy_fresh_review';
  const resolved=await preview();
  assert.equal(resolved.eligible,true);assert.deepEqual(resolved.blockers,[]);
  const result=await service.ceaseStock({...command,id:randomUUID(),inventoryHash:resolved.inventoryHash});
  assert.equal(result.managementEnded,true);assert.equal(await count(),1);
  await scheduled(1);
  const agreements=await store.read('SELECT status FROM dbo.agreements WHERE tenant_id=@tenantId AND propertyid=@propertyId AND id=@agreementId',
    {tenantId,propertyId,agreementId});
  assert.equal(agreements.length,1);assert.equal(agreements[0].status,'closed');
  check('closed_tenancy_retained_with_one_dwelling_scheduled_for_renewal');
  proof.openTenancyAccepted=true;
}

const verifyCessationObligation=async()=>{
  proof.scope='genuine sandbox paid cessation maintenance conflict + deployed service/SQL';
  proof.credentialLoginAccepted=false;proof.maintenanceConflictAccepted=false;
  stage='maintenance_clean_preview';
  const clean=await service.cessationPreview({tenantId,actorId,propertyId});
  assert.equal(clean.eligible,true);assert.deepEqual(clean.blockers,[]);
  const stale={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:clean.inventoryHash,reason:'Reject cessation when a maintenance obligation appears after review.'};
  check('cessation_preview_clean_before_new_obligation');
  cessationMaintenanceId=randomUUID();
  stage='maintenance_fixture_insert';
  await store.locked(tenantId,q=>q("INSERT INTO dbo.maintenance_requests(id,tenant_id,propertyid,title,description,status,assignedto,priority,requesttype,createdat,updatedat) VALUES(@id,@tenantId,@propertyId,'Synthetic cessation obligation','Not a customer request','pending',@actorId,'medium','other',SYSUTCDATETIME(),SYSUTCDATETIME())",{id:cessationMaintenanceId,tenantId,propertyId,actorId}));
  const blocked=await service.cessationPreview({tenantId,actorId,propertyId});
  assert.equal(blocked.eligible,false);assert.equal(blocked.inventoryHash,clean.inventoryHash);
  assert.deepEqual(blocked.blockers.map(b=>({code:b.code,count:b.count})),[{code:'MAINTENANCE_OPEN',count:1}]);
  check('new_maintenance_blocks_preview_without_changing_inventory_hash');
  const snapshot=async()=>{
    const state={};
    for(const table of ['properties','property_units','maintenance_requests','management_inventory_controls','management_billing_commands']){
      state[table]=await store.read('SELECT * FROM dbo.'+table+' WHERE tenant_id=@tenantId ORDER BY id',{tenantId});
    }
    state.recovery=await store.read('SELECT r.* FROM dbo.management_billing_recovery r JOIN dbo.management_billing_commands c ON c.id=r.command_id WHERE c.tenant_id=@tenantId ORDER BY r.command_id',{tenantId});
    state.steps=await store.read('SELECT s.* FROM dbo.management_billing_steps s JOIN dbo.management_billing_commands c ON c.id=s.command_id WHERE c.tenant_id=@tenantId ORDER BY s.command_id,s.name',{tenantId});
    state.audit=await audit();state.stock=await store.inventory(tenantId);
    return hash(state);
  };
  const remote=async()=>{const sub=await provider(),invoices=await read('/v1/invoices',{customer:customer.id,subscription:subscription.id,limit:100});return hash({sub,invoices:{has_more:invoices.has_more,data:invoices.data.map(i=>({id:i.id,status:i.status,total:i.total,paid:i.amount_paid,remaining:i.amount_remaining}))}});};
  const before=await snapshot(),providerBefore=await remote();
  stage='maintenance_stale_confirmation';
  await assert.rejects(service.ceaseStock(stale),{code:'BILLING_CESSATION_BLOCKED'});
  assert.equal(await snapshot(),before);assert.equal(await remote(),providerBefore);
  check('previously_clean_confirmation_rejected_without_local_or_provider_effect');
  stage='maintenance_blocked_retry';
  await assert.rejects(service.ceaseStock(stale),{code:'BILLING_CESSATION_BLOCKED'});
  await assert.rejects(service.ceaseStock({...stale,id:randomUUID(),inventoryHash:blocked.inventoryHash}),{code:'BILLING_CESSATION_BLOCKED'});
  assert.equal(await snapshot(),before);assert.equal(await remote(),providerBefore);
  check('blocked_retry_and_new_command_preserve_obligation_and_billing');
  stage='maintenance_resolve_fixture';
  await store.locked(tenantId,q=>q("UPDATE dbo.maintenance_requests SET status='cancelled' WHERE tenant_id=@tenantId AND id=@id AND status='pending'",{tenantId,id:cessationMaintenanceId}));
  const resolved=await service.cessationPreview({tenantId,actorId,propertyId});
  assert.equal(resolved.eligible,true);assert.deepEqual(resolved.blockers,[]);
  assert.equal(resolved.inventoryHash,clean.inventoryHash);
  check('cancelled_synthetic_maintenance_allows_fresh_review');
  const args={...stale,id:randomUUID(),inventoryHash:resolved.inventoryHash,reason:'Confirm cessation after canceling the isolated synthetic maintenance obligation.'};
  stage='maintenance_resolved_cessation';
  const result=await service.ceaseStock(args);assert.equal(result.managementEnded,true);assert.equal(await count(),1);
  const schedule=await scheduled(1);assert.equal((await store.account(tenantId)).pending_quantity,1);
  const invoice=await read('/v1/invoices/'+proof.initialInvoice);
  assert.equal(invoice.status,'paid');assert.equal(invoice.total,1000);assert.equal(invoice.amount_paid,1000);
  check('resolved_obligation_cessation_schedules_one_without_current_invoice_change');
  stage='maintenance_retained_history';
  const saved=await snapshot();assert.deepEqual(await service.ceaseStock(args),result);
  assert.equal(await snapshot(),saved);assert.equal(await scheduled(1),schedule);
  const requests=await store.read('SELECT id,propertyid,status FROM dbo.maintenance_requests WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(requests.length,1);assert.equal(String(requests[0].id).toLowerCase(),cessationMaintenanceId);
  assert.equal(String(requests[0].propertyid).toLowerCase(),propertyId);assert.equal(requests[0].status,'cancelled');
  const controls=await store.read('SELECT property_id,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(controls.length,1);assert.equal(String(controls[0].property_id).toLowerCase(),propertyId);assert.equal(controls[0].restored_at,null);
  assert.equal((await store.read("SELECT id FROM dbo.properties WHERE tenant_id=@tenantId AND status='inactive'",{tenantId})).length,2);
  assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=1',{tenantId})).length,2);
  check('cancelled_obligation_and_cessation_history_retained_with_exact_retry');
  proof.maintenanceConflictAccepted=true;proof.blockedCessationRequests=3;proof.obligationRetained=true;
};

// Outstanding invoice and pending payment review introduced after a clean review.
// Synthetic records only: no renter, agreement, due date, proof or customer contact.
const verifyCessationFinancialObligation=async()=>{
  proof.scope='genuine sandbox paid cessation financial obligations + deployed service/SQL';
  proof.credentialLoginAccepted=false;proof.financialConflictAccepted=false;
  stage='financial_clean_preview';
  const preview=()=>service.cessationPreview({tenantId,actorId,propertyId});
  const clean=await preview();
  assert.equal(clean.eligible,true);assert.deepEqual(clean.blockers,[]);
  const stale={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:clean.inventoryHash,reason:'Reject cessation while a financial obligation remains after review.'};
  check('cessation_preview_clean_before_financial_obligation');
  const snapshot=async()=>{
    const state={};
    for(const table of ['properties','property_units','invoices','payments','management_inventory_controls','management_billing_commands']){
      state[table]=await store.read('SELECT * FROM dbo.'+table+' WHERE tenant_id=@tenantId ORDER BY id',{tenantId});
    }
    state.recovery=await store.read('SELECT r.* FROM dbo.management_billing_recovery r JOIN dbo.management_billing_commands c ON c.id=r.command_id WHERE c.tenant_id=@tenantId ORDER BY r.command_id',{tenantId});
    state.steps=await store.read('SELECT s.* FROM dbo.management_billing_steps s JOIN dbo.management_billing_commands c ON c.id=s.command_id WHERE c.tenant_id=@tenantId ORDER BY s.command_id,s.name',{tenantId});
    state.audit=await audit();state.stock=await store.inventory(tenantId);
    return hash(state);
  };
  const remote=async()=>{const sub=await provider(),invoices=await read('/v1/invoices',{customer:customer.id,subscription:subscription.id,limit:100});return hash({sub,invoices:{has_more:invoices.has_more,data:invoices.data.map(i=>({id:i.id,status:i.status,total:i.total,paid:i.amount_paid,remaining:i.amount_remaining}))}});};
  const blockedBy=async expected=>{
    const result=await preview();assert.equal(result.eligible,false);assert.equal(result.inventoryHash,clean.inventoryHash);
    assert.deepEqual(result.blockers.map(b=>({code:b.code,count:b.count})),expected);
  };
  let refusals=0;
  // Every refused command must leave local records and provider billing byte-identical.
  const refused=async (commands, billing=service)=>{
    const before=await snapshot(),providerBefore=await remote();
    for(const command of commands){await assert.rejects(billing.ceaseStock(command),{code:'BILLING_CESSATION_BLOCKED'});refusals++;}
    assert.equal(await snapshot(),before);assert.equal(await remote(),providerBefore);
  };
  const fresh=()=>({...stale,id:randomUUID()});
  if (scenario === 'cessation-verified-payment') {
    const params = {tenantId, propertyId, invoiceId:randomUUID(), paymentId:randomUUID()};
    const updateInvoice = (status, total) => store.locked(tenantId, q => q(
      'UPDATE dbo.invoices SET status=@status,totalamount=@total WHERE tenant_id=@tenantId AND propertyid=@propertyId AND id=@invoiceId',
      {...params, status, total}));
    stage = 'cancelled_invoice_with_verified_payment';
    await store.locked(tenantId, async q => {
      await q("INSERT dbo.invoices(id,tenant_id,propertyid,totalamount,status,notes) VALUES(@invoiceId,@tenantId,@propertyId,100,'cancelled','Private cessation fixture')", params);
      await q("INSERT dbo.payments(id,tenant_id,propertyid,invoiceid,amount,status,notes) VALUES(@paymentId,@tenantId,@propertyId,@invoiceId,100,'verified','Private cessation fixture')", params);
    });
    let attemptedWrites = 0;
    const guarded = createBillingService({store, env, stripe:{...stripe, request(method, ...args) {
      if (method !== 'GET') { attemptedWrites++; }
      assert.equal(method, 'GET', 'Refusal must precede any provider write');
      return stripe.request(method, ...args);
    }}});
    const expectRefusal = async () => {
      await blockedBy([{code:'FINANCIAL_OPEN', count:1}]);
      await refused([stale, stale, fresh()], guarded);
      assert.equal(attemptedWrites, 0);
    };
    try {
      await expectRefusal();
      check('cancelled_invoice_with_verified_payment_blocks_without_writes');
      stage = 'paid_invoice_with_negative_outstanding';
      await updateInvoice('paid', 90);
      await expectRefusal();
      check('overpaid_invoice_blocks_without_writes');
    } finally {
      // Return only the synthetic invoice to a fully paid balance, preserving its payment.
      await updateInvoice('paid', 100);
    }
    stage = 'balanced_invoice_cessation';
    const resolved = await preview();
    assert.equal(resolved.eligible, true);
    assert.deepEqual(resolved.blockers, []);
    const result = await service.ceaseStock({...fresh(), inventoryHash:resolved.inventoryHash});
    assert.equal(result.managementEnded, true);
    assert.equal(await count(), 1);
    await scheduled(1);
    const retained = await store.read(
      "SELECT p.id FROM dbo.payments p JOIN dbo.invoices i ON i.tenant_id=p.tenant_id AND i.id=p.invoiceid WHERE p.tenant_id=@tenantId AND p.id=@paymentId AND i.id=@invoiceId AND i.propertyid=@propertyId AND i.status='paid' AND i.totalamount=100 AND p.status='verified' AND p.amount=100",
      params);
    assert.equal(retained.length, 1);
    check('balanced_invoice_and_verified_payment_retained_one_dwelling_scheduled');
    proof.verifiedPaymentAccepted = true;
    return;
  }
  cessationInvoiceId=randomUUID();
  if (scenario === 'cessation-zero-draft') {
    stage = 'zero_draft_insert';
    const params = {tenantId, propertyId, id: cessationInvoiceId};
    await store.locked(tenantId, q => q(
      "INSERT INTO dbo.invoices(id,tenant_id,propertyid,totalamount,status,notes) VALUES(@id,@tenantId,@propertyId,0,'draft','Synthetic cessation draft')",
      params));
    await blockedBy([{code:'FINANCIAL_OPEN', count:1}]);
    const before = await snapshot();
    const providerBefore = await remote();
    const guarded = createBillingService({store, env, stripe:{...stripe, request(method, ...args) {
      assert.equal(method, 'GET', 'Refusal must precede any provider write');
      return stripe.request(method, ...args);
    }}});
    for (const command of [stale, stale, fresh()]) {
      await assert.rejects(guarded.ceaseStock(command), {code:'BILLING_CESSATION_BLOCKED'});
    }
    assert.equal(await snapshot(), before);
    assert.equal(await remote(), providerBefore);
    check('zero_draft_blocks_stale_retry_and_new_request_without_writes');

    stage = 'zero_draft_resolution';
    await store.locked(tenantId, q => q(
      "UPDATE dbo.invoices SET status='cancelled',updatedat=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND propertyid=@propertyId AND id=@id AND status='draft'",
      params));
    const resolved = await preview();
    assert.equal(resolved.eligible, true);
    assert.deepEqual(resolved.blockers, []);
    const result = await service.ceaseStock({...fresh(), inventoryHash:resolved.inventoryHash});
    assert.equal(result.managementEnded, true);
    assert.equal(await count(), 1);
    await scheduled(1);
    const retained = await store.read(
      "SELECT id FROM dbo.invoices WHERE tenant_id=@tenantId AND propertyid=@propertyId AND id=@id AND status='cancelled' AND totalamount=0",
      params);
    assert.equal(retained.length, 1);
    check('cancelled_zero_draft_retained_and_one_dwelling_scheduled');
    proof.zeroDraftAccepted = true;
    return;
  }
  stage='financial_invoice_insert';
  await store.locked(tenantId,q=>q("INSERT INTO dbo.invoices(id,tenant_id,propertyid,totalamount,status,notes) VALUES(@id,@tenantId,@propertyId,100,'issued','Synthetic cessation obligation; not a customer invoice')",{id:cessationInvoiceId,tenantId,propertyId}));
  await blockedBy([{code:'FINANCIAL_OPEN',count:1}]);
  check('outstanding_invoice_blocks_preview_without_changing_inventory_hash');
  stage='financial_invoice_refusals';
  await refused([stale,stale,fresh()]);
  check('outstanding_invoice_stale_retry_and_new_command_rejected_without_effect');
  cessationPaymentId=randomUUID();
  stage='financial_payment_insert';
  await store.locked(tenantId,q=>q("INSERT INTO dbo.payments(id,tenant_id,invoiceid,propertyid,amount,status,notes) VALUES(@id,@tenantId,@invoiceId,@propertyId,100,'pending','Synthetic cessation obligation; not a customer payment')",{id:cessationPaymentId,tenantId,invoiceId:cessationInvoiceId,propertyId}));
  // An unverified payment does not reduce the outstanding balance: both obligations are named.
  await blockedBy([{code:'FINANCIAL_OPEN',count:1},{code:'PAYMENT_OPEN',count:1}]);
  stage='financial_both_refusal';
  await refused([fresh()]);
  check('pending_payment_review_reported_with_outstanding_invoice_and_rejected');
  stage='financial_invoice_resolve';
  await store.locked(tenantId,q=>q("UPDATE dbo.invoices SET status='cancelled',updatedat=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status='issued'",{tenantId,id:cessationInvoiceId}));
  await blockedBy([{code:'PAYMENT_OPEN',count:1}]);
  stage='financial_payment_only_refusal';
  await refused([fresh()]);
  check('pending_payment_review_alone_still_blocks_after_invoice_cancelled');
  stage='financial_payment_resolve';
  await store.locked(tenantId,q=>q("UPDATE dbo.payments SET status='rejected',updatedat=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status='pending'",{tenantId,id:cessationPaymentId}));
  const resolved=await preview();
  assert.equal(resolved.eligible,true);assert.deepEqual(resolved.blockers,[]);
  assert.equal(resolved.inventoryHash,clean.inventoryHash);
  check('resolved_financial_obligations_allow_fresh_review');
  const args={...stale,id:randomUUID(),inventoryHash:resolved.inventoryHash,reason:'Confirm cessation after resolving the isolated synthetic financial obligations.'};
  stage='financial_resolved_cessation';
  const result=await service.ceaseStock(args);assert.equal(result.managementEnded,true);assert.equal(await count(),1);
  const schedule=await scheduled(1);assert.equal((await store.account(tenantId)).pending_quantity,1);
  const invoice=await read('/v1/invoices/'+proof.initialInvoice);
  assert.equal(invoice.status,'paid');assert.equal(invoice.total,1000);assert.equal(invoice.amount_paid,1000);
  check('resolved_obligation_cessation_schedules_one_without_current_invoice_change');
  stage='financial_retained_history';
  const saved=await snapshot();assert.deepEqual(await service.ceaseStock(args),result);
  assert.equal(await snapshot(),saved);assert.equal(await scheduled(1),schedule);
  const invoices=await store.read('SELECT id,propertyid,status,totalamount FROM dbo.invoices WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(invoices.length,1);assert.equal(String(invoices[0].id).toLowerCase(),cessationInvoiceId);
  assert.equal(String(invoices[0].propertyid).toLowerCase(),propertyId);assert.equal(invoices[0].status,'cancelled');assert.equal(Number(invoices[0].totalamount),100);
  const payments=await store.read('SELECT id,invoiceid,status,amount FROM dbo.payments WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(payments.length,1);assert.equal(String(payments[0].id).toLowerCase(),cessationPaymentId);
  assert.equal(String(payments[0].invoiceid).toLowerCase(),cessationInvoiceId);assert.equal(payments[0].status,'rejected');assert.equal(Number(payments[0].amount),100);
  const controls=await store.read('SELECT property_id,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(controls.length,1);assert.equal(String(controls[0].property_id).toLowerCase(),propertyId);assert.equal(controls[0].restored_at,null);
  assert.equal((await store.read("SELECT id FROM dbo.properties WHERE tenant_id=@tenantId AND status='inactive'",{tenantId})).length,2);
  assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=1',{tenantId})).length,2);
  check('resolved_financial_records_and_cessation_history_retained_with_exact_retry');
  assert.equal(refusals,5);
  proof.financialConflictAccepted=true;proof.blockedCessationRequests=refusals;proof.obligationRetained=true;
  proof.financialBlockers='FINANCIAL_OPEN,PAYMENT_OPEN';
};

// Draft settlement and held deposit introduced after a clean review. Both hang
// from one synthetic closed agreement: no renter contract, signature or contact.
const verifyCessationSettlementDeposit=async()=>{
  proof.scope='genuine sandbox paid cessation settlement and deposit obligations + deployed service/SQL';
  proof.credentialLoginAccepted=false;proof.settlementDepositConflictAccepted=false;
  const agreementId=randomUUID();
  stage='settlement_closed_agreement';
  await store.locked(tenantId,q=>q("INSERT INTO dbo.agreements(id,tenant_id,propertyid,status,title,notes) VALUES(@id,@tenantId,@propertyId,'closed','Synthetic closed tenancy','Synthetic cessation fixture; not a customer agreement')",{id:agreementId,tenantId,propertyId}));
  stage='settlement_clean_preview';
  const preview=()=>service.cessationPreview({tenantId,actorId,propertyId});
  const clean=await preview();
  assert.equal(clean.eligible,true);assert.deepEqual(clean.blockers,[]);
  const stale={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:clean.inventoryHash,reason:'Reject cessation while a settlement or deposit obligation remains after review.'};
  check('cessation_preview_clean_with_closed_synthetic_tenancy');
  const snapshot=async()=>{
    const state={};
    for(const table of ['properties','property_units','agreements','tenancy_settlements','tenancy_deposit_transactions','management_inventory_controls','management_billing_commands']){
      state[table]=await store.read('SELECT * FROM dbo.'+table+' WHERE tenant_id=@tenantId ORDER BY id',{tenantId});
    }
    state.recovery=await store.read('SELECT r.* FROM dbo.management_billing_recovery r JOIN dbo.management_billing_commands c ON c.id=r.command_id WHERE c.tenant_id=@tenantId ORDER BY r.command_id',{tenantId});
    state.steps=await store.read('SELECT s.* FROM dbo.management_billing_steps s JOIN dbo.management_billing_commands c ON c.id=s.command_id WHERE c.tenant_id=@tenantId ORDER BY s.command_id,s.name',{tenantId});
    state.audit=await audit();state.stock=await store.inventory(tenantId);
    return hash(state);
  };
  const remote=async()=>{const sub=await provider(),invoices=await read('/v1/invoices',{customer:customer.id,subscription:subscription.id,limit:100});return hash({sub,invoices:{has_more:invoices.has_more,data:invoices.data.map(i=>({id:i.id,status:i.status,total:i.total,paid:i.amount_paid,remaining:i.amount_remaining}))}});};
  const blockedBy=async expected=>{
    const result=await preview();assert.equal(result.eligible,false);assert.equal(result.inventoryHash,clean.inventoryHash);
    assert.deepEqual(result.blockers.map(b=>({code:b.code,count:b.count})),expected);
  };
  let refusals=0;
  // Every refused command must leave local records and provider billing byte-identical.
  const refused=async commands=>{
    const before=await snapshot(),providerBefore=await remote();
    for(const command of commands){await assert.rejects(service.ceaseStock(command),{code:'BILLING_CESSATION_BLOCKED'});refusals++;}
    assert.equal(await snapshot(),before);assert.equal(await remote(),providerBefore);
  };
  const fresh=()=>({...stale,id:randomUUID()});
  cessationSettlementId=randomUUID();
  stage='settlement_insert';
  await store.locked(tenantId,q=>q("INSERT INTO dbo.tenancy_settlements(id,tenant_id,agreement_id,status,notes) VALUES(@id,@tenantId,@agreementId,'draft','Synthetic cessation obligation; not a customer settlement')",{id:cessationSettlementId,tenantId,agreementId}));
  await blockedBy([{code:'SETTLEMENT_OPEN',count:1}]);
  check('draft_settlement_blocks_preview_without_changing_inventory_hash');
  stage='settlement_refusals';
  await refused([stale,stale,fresh()]);
  check('draft_settlement_stale_retry_and_new_command_rejected_without_effect');
  cessationDepositId=randomUUID();
  stage='deposit_insert';
  await store.locked(tenantId,q=>q("INSERT INTO dbo.tenancy_deposit_transactions(id,tenant_id,agreement_id,renteeid,propertyid,transaction_type,amount,status,notes) VALUES(@id,@tenantId,@agreementId,@actorId,@propertyId,'security_deposit',100,'received','Synthetic cessation obligation; not a customer deposit')",{id:cessationDepositId,tenantId,agreementId,actorId,propertyId}));
  await blockedBy([{code:'SETTLEMENT_OPEN',count:1},{code:'DEPOSIT_OPEN',count:1}]);
  stage='settlement_deposit_refusal';
  await refused([fresh()]);
  check('held_deposit_reported_with_draft_settlement_and_rejected');
  stage='settlement_resolve';
  await store.locked(tenantId,q=>q("UPDATE dbo.tenancy_settlements SET status='voided',updatedat=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status='draft'",{tenantId,id:cessationSettlementId}));
  // A voided settlement is not a settled one: the held deposit must still block.
  await blockedBy([{code:'DEPOSIT_OPEN',count:1}]);
  stage='deposit_only_refusal';
  await refused([fresh()]);
  check('held_deposit_alone_still_blocks_after_settlement_voided');
  stage='deposit_resolve';
  await store.locked(tenantId,q=>q("UPDATE dbo.tenancy_deposit_transactions SET status='voided',updatedat=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status='received'",{tenantId,id:cessationDepositId}));
  const resolved=await preview();
  assert.equal(resolved.eligible,true);assert.deepEqual(resolved.blockers,[]);
  assert.equal(resolved.inventoryHash,clean.inventoryHash);
  check('resolved_settlement_and_deposit_allow_fresh_review');
  const args={...stale,id:randomUUID(),inventoryHash:resolved.inventoryHash,reason:'Confirm cessation after resolving the isolated synthetic settlement and deposit.'};
  stage='settlement_resolved_cessation';
  const result=await service.ceaseStock(args);assert.equal(result.managementEnded,true);assert.equal(await count(),1);
  const schedule=await scheduled(1);assert.equal((await store.account(tenantId)).pending_quantity,1);
  const invoice=await read('/v1/invoices/'+proof.initialInvoice);
  assert.equal(invoice.status,'paid');assert.equal(invoice.total,1000);assert.equal(invoice.amount_paid,1000);
  check('resolved_obligation_cessation_schedules_one_without_current_invoice_change');
  stage='settlement_retained_history';
  const saved=await snapshot();assert.deepEqual(await service.ceaseStock(args),result);
  assert.equal(await snapshot(),saved);assert.equal(await scheduled(1),schedule);
  const agreements=await store.read('SELECT id,propertyid,status FROM dbo.agreements WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(agreements.length,1);assert.equal(String(agreements[0].id).toLowerCase(),agreementId);
  assert.equal(String(agreements[0].propertyid).toLowerCase(),propertyId);assert.equal(agreements[0].status,'closed');
  const settlements=await store.read('SELECT id,agreement_id,status FROM dbo.tenancy_settlements WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(settlements.length,1);assert.equal(String(settlements[0].id).toLowerCase(),cessationSettlementId);
  assert.equal(String(settlements[0].agreement_id).toLowerCase(),agreementId);assert.equal(settlements[0].status,'voided');
  const deposits=await store.read('SELECT id,agreement_id,status,amount FROM dbo.tenancy_deposit_transactions WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(deposits.length,1);assert.equal(String(deposits[0].id).toLowerCase(),cessationDepositId);
  assert.equal(String(deposits[0].agreement_id).toLowerCase(),agreementId);assert.equal(deposits[0].status,'voided');assert.equal(Number(deposits[0].amount),100);
  const controls=await store.read('SELECT property_id,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(controls.length,1);assert.equal(String(controls[0].property_id).toLowerCase(),propertyId);assert.equal(controls[0].restored_at,null);
  assert.equal((await store.read("SELECT id FROM dbo.properties WHERE tenant_id=@tenantId AND status='inactive'",{tenantId})).length,2);
  assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=1',{tenantId})).length,2);
  check('resolved_settlement_deposit_and_cessation_history_retained_with_exact_retry');
  assert.equal(refusals,5);
  proof.settlementDepositConflictAccepted=true;proof.blockedCessationRequests=refusals;proof.obligationRetained=true;
  proof.obligationBlockers='SETTLEMENT_OPEN,DEPOSIT_OPEN';
};

// Rental offer introduced after a clean review. Schema-required enquiry and
// acceptance fields are synthetic fixture values, not a customer enquiry or consent.
const verifyCessationReservation=async()=>{
  proof.scope='genuine sandbox paid cessation reservation obligation + deployed service/SQL';
  proof.credentialLoginAccepted=false;proof.reservationConflictAccepted=false;
  stage='reservation_clean_preview';
  const preview=()=>service.cessationPreview({tenantId,actorId,propertyId});
  const clean=await preview();
  assert.equal(clean.eligible,true);assert.deepEqual(clean.blockers,[]);
  const stale={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:clean.inventoryHash,reason:'Reject cessation while a rental reservation remains after review.'};
  check('cessation_preview_clean_before_reservation');
  const keys={properties:'id',property_units:'id',property_enquiries:'id',property_rental_offers:'enquiry_id',management_inventory_controls:'id',management_billing_commands:'id'};
  const snapshot=async()=>{
    const state={};
    for(const table of Object.keys(keys)){
      state[table]=await store.read('SELECT * FROM dbo.'+table+' WHERE tenant_id=@tenantId ORDER BY '+keys[table],{tenantId});
    }
    state.recovery=await store.read('SELECT r.* FROM dbo.management_billing_recovery r JOIN dbo.management_billing_commands c ON c.id=r.command_id WHERE c.tenant_id=@tenantId ORDER BY r.command_id',{tenantId});
    state.steps=await store.read('SELECT s.* FROM dbo.management_billing_steps s JOIN dbo.management_billing_commands c ON c.id=s.command_id WHERE c.tenant_id=@tenantId ORDER BY s.command_id,s.name',{tenantId});
    state.audit=await audit();state.stock=await store.inventory(tenantId);
    return hash(state);
  };
  const remote=async()=>{const sub=await provider(),invoices=await read('/v1/invoices',{customer:customer.id,subscription:subscription.id,limit:100});return hash({sub,invoices:{has_more:invoices.has_more,data:invoices.data.map(i=>({id:i.id,status:i.status,total:i.total,paid:i.amount_paid,remaining:i.amount_remaining}))}});};
  const blockedBy=async expected=>{
    const result=await preview();assert.equal(result.eligible,false);assert.equal(result.inventoryHash,clean.inventoryHash);
    assert.deepEqual(result.blockers.map(b=>({code:b.code,count:b.count})),expected);
  };
  let refusals=0;
  // Every refused command must leave local records and provider billing byte-identical.
  const refused=async commands=>{
    const before=await snapshot(),providerBefore=await remote();
    for(const command of commands){await assert.rejects(service.ceaseStock(command),{code:'BILLING_CESSATION_BLOCKED'});refusals++;}
    assert.equal(await snapshot(),before);assert.equal(await remote(),providerBefore);
  };
  const fresh=()=>({...stale,id:randomUUID()});
  const listing=await store.read('SELECT public_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND property_id=@propertyId',{tenantId,propertyId});
  assert.equal(listing.length,1);
  cessationEnquiryId=randomUUID();
  stage='reservation_insert';
  await store.locked(tenantId,async q=>{
    await q("INSERT INTO dbo.property_enquiries(id,listing_public_id,tenant_id,property_id,seeker_id,seeker_name,seeker_email,country_code,listing_title,message,consent_version,request_id,payload_hash) VALUES(@id,@listing,@tenantId,@propertyId,@actorId,'Synthetic fixture',@email,'LK','TEST ONLY - no rental available','Seeded synthetic fixture; no customer enquiry or consent','fixture-only',@request,@hash)",{id:cessationEnquiryId,listing:listing[0].public_id,tenantId,propertyId,actorId,email:'r5-paid-stock-'+tenantId+'@example.invalid',request:randomUUID(),hash:'0'.repeat(64)});
    await q("INSERT INTO dbo.property_rental_offers(enquiry_id,tenant_id,property_id,application_version,status,version,currency,rent,deposit,fees,start_date,end_date,terms,offer_until,hold_until) VALUES(@id,@tenantId,@propertyId,1,'offered',1,'LKR',100,0,0,CONVERT(date,SYSUTCDATETIME()),CONVERT(date,DATEADD(day,30,SYSUTCDATETIME())),'Seeded synthetic hold; no participant acceptance, tenancy or payment',DATEADD(day,1,SYSUTCDATETIME()),DATEADD(day,2,SYSUTCDATETIME()))",{id:cessationEnquiryId,tenantId,propertyId});
  });
  cessationOfferId=cessationEnquiryId;
  await blockedBy([{code:'RESERVATION_OPEN',count:1}]);
  check('open_rental_offer_blocks_preview_without_changing_inventory_hash');
  stage='reservation_offer_refusals';
  await refused([stale,stale,fresh()]);
  check('open_rental_offer_stale_retry_and_new_command_rejected_without_effect');
  stage='reservation_accepted_hold';
  await store.locked(tenantId,q=>q("UPDATE dbo.property_rental_offers SET status='accepted',accepted_at=SYSUTCDATETIME(),consent_version='rental-offer-v1',updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND enquiry_id=@id AND status='offered'",{tenantId,id:cessationOfferId}));
  await blockedBy([{code:'RESERVATION_OPEN',count:1}]);
  stage='reservation_accepted_refusal';
  await refused([fresh()]);
  check('accepted_hold_still_blocks_preview_and_rejects_new_command_without_effect');
  stage='reservation_resolve';
  await store.locked(tenantId,q=>q("UPDATE dbo.property_rental_offers SET status='withdrawn',updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND enquiry_id=@id AND status IN('offered','accepted')",{tenantId,id:cessationOfferId}));
  const resolved=await preview();
  assert.equal(resolved.eligible,true);assert.deepEqual(resolved.blockers,[]);
  assert.equal(resolved.inventoryHash,clean.inventoryHash);
  check('withdrawn_offer_allows_fresh_review_with_unchanged_inventory_hash');
  const args={...stale,id:randomUUID(),inventoryHash:resolved.inventoryHash,reason:'Confirm cessation after withdrawing the isolated synthetic rental offer.'};
  stage='reservation_resolved_cessation';
  const result=await service.ceaseStock(args);assert.equal(result.managementEnded,true);assert.equal(await count(),1);
  const schedule=await scheduled(1);assert.equal((await store.account(tenantId)).pending_quantity,1);
  const invoice=await read('/v1/invoices/'+proof.initialInvoice);
  assert.equal(invoice.status,'paid');assert.equal(invoice.total,1000);assert.equal(invoice.amount_paid,1000);
  check('resolved_obligation_cessation_schedules_one_without_current_invoice_change');
  stage='reservation_retained_history';
  const saved=await snapshot();assert.deepEqual(await service.ceaseStock(args),result);
  assert.equal(await snapshot(),saved);assert.equal(await scheduled(1),schedule);
  const enquiries=await store.read('SELECT id,property_id,status FROM dbo.property_enquiries WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(enquiries.length,1);assert.equal(String(enquiries[0].id).toLowerCase(),cessationEnquiryId);
  assert.equal(String(enquiries[0].property_id).toLowerCase(),propertyId);
  const offers=await store.read('SELECT enquiry_id,property_id,status FROM dbo.property_rental_offers WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(offers.length,1);assert.equal(String(offers[0].enquiry_id).toLowerCase(),cessationEnquiryId);
  assert.equal(String(offers[0].property_id).toLowerCase(),propertyId);assert.equal(offers[0].status,'withdrawn');
  const controls=await store.read('SELECT property_id,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(controls.length,1);assert.equal(String(controls[0].property_id).toLowerCase(),propertyId);assert.equal(controls[0].restored_at,null);
  assert.equal((await store.read("SELECT id FROM dbo.properties WHERE tenant_id=@tenantId AND status='inactive'",{tenantId})).length,2);
  assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=1',{tenantId})).length,2);
  check('withdrawn_offer_enquiry_and_cessation_history_retained_with_exact_retry');
  assert.equal(refusals,4);
  proof.reservationConflictAccepted=true;proof.blockedCessationRequests=refusals;proof.obligationRetained=true;
  proof.obligationBlockers='RESERVATION_OPEN';
};

const prepareRenewalCleanup=async()=>{
  stage='existing_renewal_cleanup_ownership';
  const tenants=await store.read('SELECT slug,[plan] FROM dbo.tenants WHERE id=@tenantId',{tenantId});
  assert.equal(tenants.length,1);assert.equal(tenants[0].slug,'r5-paid-stock-'+tenantId);assert.equal(tenants[0].plan,'development-testing');
  const actors=await store.read('SELECT id,auth_id,email FROM dbo.app_users WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(actors.length,1);assert.equal(actors[0].email,'r5-paid-stock-'+tenantId+'@example.invalid');assert.ok(!actors[0].auth_id);
  const account=await store.account(tenantId);assert.equal(account.stripe_account_id,BILLING_ACCOUNT);
  customer=await read('/v1/customers/'+account.stripe_customer_id);
  assert.equal(customer.livemode,false);assert.equal(customer.metadata.acceptance_fixture,tenantId);assert.ok(customer.test_clock);
  subscription=await read('/v1/subscriptions/'+account.stripe_subscription_id);
  assert.equal(subscription.livemode,false);assert.equal(subscription.status,'canceled');
  assert.equal(subscription.metadata.acceptance_fixture,tenantId);assert.equal(objectId(subscription.customer),customer.id);
  assert.equal(objectId(subscription.test_clock),objectId(customer.test_clock));
  actorId=String(actors[0].id).toLowerCase();created=true;
  console.log('PAID_RENEWAL_CLEANUP_OWNERSHIP='+JSON.stringify({operation:tenantId,verified:true,subscriptionAlreadyCanceled:true}));
};

const cleanupUnpaidHostedCheckout=async()=>{
  stage='cleanup_inactive_unpaid_hosted_fixture';
  const tenants=await store.read('SELECT slug,status FROM dbo.tenants WHERE id=@tenantId',{tenantId});
  assert.equal(tenants.length,1);assert.equal(tenants[0].slug,'r5-paid-stock-'+tenantId);assert.equal(tenants[0].status,'inactive');
  assert.equal((await store.read("SELECT id FROM dbo.tenant_memberships WHERE tenant_id=@tenantId AND status='active'",{tenantId})).length,0);
  assert.equal((await store.read("SELECT id FROM dbo.app_users WHERE tenant_id=@tenantId AND status='active'",{tenantId})).length,0);
  assert.equal((await store.read('SELECT s.id FROM dbo.auth_sessions s JOIN dbo.auth_users a ON a.id=s.auth_user_id JOIN dbo.app_users u ON u.id=a.app_user_id WHERE u.tenant_id=@tenantId AND s.revoked_at IS NULL AND s.expires_at>SYSUTCDATETIME()',{tenantId})).length,0);
  const account=await store.account(tenantId);assert.equal(account.stripe_account_id,BILLING_ACCOUNT);assert.ok(!account.stripe_subscription_id);
  const commands=await store.read("SELECT id,result_json FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND kind='checkout' AND status='completed'",{tenantId});
  assert.equal(commands.length,1);const saved=JSON.parse(commands[0].result_json);
  let session=await read('/v1/checkout/sessions/'+saved.sessionId);
  assert.equal(session.livemode,false);assert.equal(session.mode,'subscription');assert.ok(!session.subscription);
  assert.equal(String(session.metadata.quixo_tenant).toLowerCase(),tenantId);
  assert.equal(String(session.metadata.quixo_operation).toLowerCase(),String(commands[0].id).toLowerCase());
  assert.equal(objectId(session.customer),account.stripe_customer_id);
  const owner=await read('/v1/customers/'+account.stripe_customer_id);
  assert.equal(owner.livemode,false);assert.equal(String(owner.metadata.quixo_tenant).toLowerCase(),tenantId);
  if(session.status==='open'){await write('/v1/checkout/sessions/'+session.id+'/expire',{},'expire-checkout');}
  session=await read('/v1/checkout/sessions/'+session.id);assert.equal(session.status,'expired');assert.ok(!session.subscription);
  const subscriptions=await read('/v1/subscriptions',{customer:owner.id,status:'all',limit:100});
  assert.equal(subscriptions.has_more,false);assert.equal(subscriptions.data.length,0);
  assert.deepEqual(await protectedState(),baseline);
  console.log('PAID_HOSTED_CLEANUP_PASS='+JSON.stringify({operation:tenantId,verified:true,sessionExpired:true,noSubscription:true,fixtureInactive:true,protectedBillingUnchanged:true,recordsRetained:true}));
};

const verifyHostedCheckout=async()=>{
  proof.scope='deployed HTTP staged stock + genuine hosted sandbox Checkout completion + SQL/provider reconciliation';
  proof.credentialLoginAccepted=false;proof.hostedCheckoutCompleted=false;
  await store.locked(tenantId,q=>q(`INSERT dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,market,inventory_json)
    VALUES(@tenantId,@account,@price,'LK','[]')`,{tenantId,account:BILLING_ACCOUNT,price:BILLING_PRICE}));
  let token=await makeSession(actorId,'admin');
  const http=async(path,body)=>{
    const response=await fetch('https://app.quixo.homes/api/management-billing/'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{Authorization:'Bearer '+token,'x-tenant-id':tenantId,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if(!response.ok){throw Object.assign(Error('Hosted Checkout acceptance HTTP request failed'),{code:result.code||'HTTP_UNCONFIRMED',status:response.status});}
    assert.equal(response.status,200);assert.equal(result.error,null);return result.data;
  };
  const records=[1,2,3].map(n=>({kind:'property',payload:{id:randomUUID(),name:'Private hosted Checkout stock '+n,
    description:'Synthetic staged Checkout acceptance '+n,propertytype:'house',country_code:'LK',
    rentalvalues:{listingCategory:'residential'},availability:'inactive'}}));
  const staged=()=>store.read('SELECT * FROM dbo.management_inventory_staging WHERE tenant_id=@tenantId ORDER BY id',{tenantId});
  const stock=()=>store.read('SELECT id,name,description,status FROM dbo.properties WHERE tenant_id=@tenantId ORDER BY id',{tenantId});
  stage='hosted_stage_create_import';
  await http('stock/prepare',{records:[records[0]],reason:'Prepare private hosted Checkout acceptance.'});
  await http('stock/prepare',{records:records.slice(1),reason:'Import private hosted Checkout acceptance.'});
  assert.equal((await staged()).length,3);assert.ok((await staged()).every(r=>r.status==='pending'));
  assert.equal((await stock()).length,0);assert.equal(await count(),0);check('staged_create_import_pending_before_checkout');
  stage='hosted_checkout_preview';
  const status=await http('status');assert.equal(status.stagingEnabled,true);assert.equal(status.inventoryQuantity,0);
  assert.equal(status.proposedInventoryQuantity,3);assert.equal(status.billedQuantity,0);assert.notEqual(status.entitlement.state,'active');
  check('http_checkout_preview_counts_only_prepared_stock');
  stage='hosted_checkout_create';checkoutCommandId=randomUUID();
  const command={requestId:checkoutCommandId,inventoryHash:status.inventoryHash};providerAttempted=true;
  const result=await http('checkout',command);checkoutSessionId=result.sessionId;
  // Never print the hosted URL; retrieve it privately through the sandbox connector.
  assert.equal(new URL(result.url).hostname,'checkout.stripe.com');
  let session=await read('/v1/checkout/sessions/'+checkoutSessionId);
  assert.equal(session.livemode,false);assert.equal(session.status,'open');assert.equal(session.mode,'subscription');
  assert.equal(String(session.metadata.quixo_tenant).toLowerCase(),tenantId);assert.equal(String(session.metadata.quixo_operation).toLowerCase(),checkoutCommandId);
  assert.equal(session.metadata.inventory_hash,status.inventoryHash);assert.equal(session.amount_total,1500);
  customer=await read('/v1/customers/'+objectId(session.customer));assert.equal(String(customer.metadata.quixo_tenant).toLowerCase(),tenantId);
  assert.equal((await stock()).length,0);assert.ok((await staged()).every(r=>r.status==='pending'));
  check('open_hosted_checkout_does_not_promote_stock');
  stage='hosted_checkout_retry';
  const beforeRetry={staged:hash(await staged()),stock:hash(await stock()),audit:await audit()};
  const retry=await http('checkout',command);assert.equal(retry.sessionId,checkoutSessionId);
  assert.deepEqual({staged:hash(await staged()),stock:hash(await stock()),audit:await audit()},beforeRetry);
  check('checkout_retry_reuses_session_without_stock_effect');
  stage='await_hosted_sandbox_completion';
  console.log('PAID_HOSTED_CHECKOUT_READY='+JSON.stringify({operation:tenantId,commandId:checkoutCommandId,sessionId:checkoutSessionId,waitSeconds:600}));
  for(let attempt=0;attempt<120;attempt++){
    session=await read('/v1/checkout/sessions/'+checkoutSessionId);
    if(session.status==='complete'){break;}
    assert.equal(session.status,'open');
    if(attempt%6===0){console.log('PAID_HOSTED_CHECKOUT_WAITING='+JSON.stringify({operation:tenantId,elapsedSeconds:attempt*5}));}
    await delay(5000);
  }
  assert.equal(session.status,'complete','Hosted sandbox Checkout did not complete within the bounded wait');
  assert.equal(session.payment_status,'paid');assert.equal(session.livemode,false);
  assert.equal(objectId(session.customer),customer.id);assert.ok(objectId(session.subscription));
  subscription=await read('/v1/subscriptions/'+objectId(session.subscription));
  assert.equal(subscription.livemode,false);assert.equal(objectId(subscription.customer),customer.id);
  assert.equal(subscription.status,'active');assert.ok(!subscription.test_clock);
  assert.equal(subscription.items.data.length,1);assert.equal(subscription.items.data[0].quantity,3);
  assert.equal(objectId(subscription.items.data[0].price),BILLING_PRICE);
  const invoice=await read('/v1/invoices/'+objectId(subscription.latest_invoice));
  assert.equal(invoice.livemode,false);assert.equal(invoice.status,'paid');assert.equal(invoice.amount_paid,1500);
  assert.equal(invoice.currency,'usd');assert.equal(invoice.billing_reason,'subscription_create');assert.equal(objectId(invoice.customer),customer.id);
  proof.initialInvoice=invoice.id;proof.subscriptionId=subscription.id;proof.hostedCheckoutCompleted=true;
  check('hosted_checkout_paid_exact_initial_quantity');
  // Keep every programmatic session short-lived, including after the browser wait.
  const previousDigest=createHash('sha256').update(token).digest('hex');
  const authSession=(await store.read('SELECT auth_user_id FROM dbo.auth_sessions WHERE token_hash=@digest',{digest:previousDigest}))[0];
  assert.ok(authSession?.auth_user_id);await revokeAccessToken(token);
  token=randomBytes(32).toString('base64url');httpTokens.push(token);
  await store.locked(tenantId,q=>q('INSERT dbo.auth_sessions(auth_user_id,token_hash,expires_at) VALUES(@id,@digest,DATEADD(MINUTE,5,SYSUTCDATETIME()))',
    {id:authSession.auth_user_id,digest:createHash('sha256').update(token).digest('hex')}));
  stage='hosted_checkout_http_refresh';
  const refreshed=await http('refresh',{});
  console.log('PAID_HOSTED_REFRESH='+JSON.stringify({state:refreshed.entitlement.state,billedQuantity:refreshed.billedQuantity,
    inventoryQuantity:refreshed.inventoryQuantity,pendingStockCount:refreshed.pendingStock.length}));
  assert.equal(refreshed.entitlement.state,'active');assert.equal(refreshed.billedQuantity,3);
  assert.equal(refreshed.inventoryQuantity,3);assert.equal(refreshed.pendingStock.length,0);
  stage='hosted_promoted_record_identity';
  const promoted=await staged();assert.equal(promoted.length,3);
  assert.ok(promoted.every(r=>r.status==='promoted'&&String(r.promotion_command_id).toLowerCase()===checkoutCommandId));
  const rows=await stock();assert.equal(rows.length,3);
  for(const record of records){
    const row=rows.find(r=>String(r.id).toLowerCase()===record.payload.id);assert.ok(row);
    assert.equal(row.name,record.payload.name);assert.equal(row.description,record.payload.description);assert.equal(row.status,'inactive');
  }
  stage='hosted_private_listing_preferences';
  // The normal insert trigger defaults opted_out to 0. Inactive availability
  // already withholds these fixtures; set the additional fixture-only opt-out
  // explicitly after verifying every promoted row is the intended inactive stock.
  await store.locked(tenantId,q=>q('UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId',{tenantId}));
  assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=1',{tenantId})).length,3);
  check('completed_checkout_promotes_exact_private_staged_records');
  stage='hosted_refresh_retry';
  const beforeRefresh={staged:hash(await staged()),stock:hash(await stock()),audit:await audit()};
  await http('refresh',{});await http('status');
  assert.deepEqual({staged:hash(await staged()),stock:hash(await stock()),audit:await audit()},beforeRefresh);
  assert.equal((await provider()).items.data[0].quantity,3);check('refresh_retry_no_duplicate_promotion');
  const sessions=await read('/v1/checkout/sessions',{customer:customer.id,limit:100});
  const subscriptions=await read('/v1/subscriptions',{customer:customer.id,status:'all',limit:100});
  assert.equal(sessions.has_more,false);assert.equal(sessions.data.length,1);assert.equal(sessions.data[0].id,checkoutSessionId);
  assert.equal(subscriptions.has_more,false);assert.equal(subscriptions.data.length,1);assert.equal(subscriptions.data[0].id,subscription.id);
  check('single_checkout_and_subscription_retained');
  proof.httpAccepted=true;proof.httpStockMutationAccepted=true;
};

try{
  assert.match(tenantId||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.ok(!protectedIds.includes(tenantId));
  assert.ok(['cessation-response-loss','cessation-verified-payment','cessation-zero-draft','cessation-open-tenancy','invoice-preview-recovery','transitions','promotion','http-permissions','http-promotion','http-transitions','http-hosted-checkout','cleanup-hosted-checkout','cessation-renewal','restoration-renewal','split-renewal','zero-stock-cancellation','cessation-maintenance-conflict','cessation-financial-conflict','cessation-settlement-deposit-conflict','cessation-reservation-conflict','cleanup-cessation-renewal'].includes(scenario));
  for(const flag of ['MANAGEMENT_BILLING_SANDBOX_ENABLED','MANAGEMENT_BILLING_SCHEMA_READY','MANAGEMENT_RECOVERY_SCHEMA_READY']){assert.equal(process.env[flag],'true');}
  if(scenario==='http-promotion'||httpTransitions||hostedCheckout){
    for(const flag of ['MANAGEMENT_INVENTORY_SCHEMA_READY','MANAGEMENT_CESSATION_SCHEMA_READY','MANAGEMENT_RESTORATION_SCHEMA_READY','MANAGEMENT_SPLIT_SCHEMA_READY','MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED']){assert.equal(process.env[flag],'true',flag);}
    assert.equal(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS,tenantId);
  }else{assert.notEqual(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED,'true');}
  assert.equal(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).toLowerCase(),protectedIds[0]);
  await stripe.assertAccount();const price=await service.price(BILLING_PRICE);assert.equal(price.unit_amount,500);
  for(const table of ['management_inventory_staging','management_inventory_controls','management_inventory_splits','management_inventory_split_units','management_billing_recovery','management_billing_steps']){
    assert.ok((await store.read('SELECT OBJECT_ID(@name) AS id',{name:'dbo.'+table}))[0]?.id,'Required schema: '+table);
  }
  baseline=await protectedState();
  if(scenario==='cleanup-cessation-renewal'){await prepareRenewalCleanup();}else if(scenario==='cleanup-hosted-checkout'){await cleanupUnpaidHostedCheckout();}else{
  stage='private_fixture';
  await store.locked(tenantId,async q=>{
    assert.equal((await q('SELECT id FROM dbo.tenants WHERE id=@tenantId',{tenantId})).length,0,'Never replay an existing fixture');
    await q("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@tenantId,'R5 private paid stock acceptance',@slug,'active','development-testing')",{tenantId,slug:'r5-paid-stock-'+tenantId});
    // Non-login synthetic actor exercises the service's existing membership authority.
    await q("INSERT dbo.app_users(id,tenant_id,name,email,role,user_type,status) VALUES(@actorId,@tenantId,'Synthetic paid stock actor',@email,'admin','admin','active')",{tenantId,actorId,email:'r5-paid-stock-'+tenantId+'@example.invalid'});
    await q("INSERT dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@tenantId,@actorId,'admin','active',1)",{tenantId,actorId});
    for(const id of hostedCheckout?[]:[propertyId,second]){
      await q("INSERT dbo.properties(id,tenant_id,name,status,propertytype,country_code) VALUES(@id,@tenantId,'Private synthetic paid stock','inactive','house','LK')",{id,tenantId});
      await q('UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME() WHERE property_id=@id AND tenant_id=@tenantId',{id,tenantId});
      assert.equal((await q('SELECT property_id FROM dbo.public_listing_preferences WHERE property_id=@id AND tenant_id=@tenantId AND opted_out=1',{id,tenantId})).length,1);
    }
  });created=true;check('isolated_private_fixture');
  if(hostedCheckout){await verifyHostedCheckout();}else{
  // Check the deployed stock/blocker queries before creating provider objects.
  stage='cessation_sql_preflight';
  const stockPreview=await store.locked(tenantId,q=>store.cessationPreviewLocked(q,{tenantId,actorId,propertyId}));
  assert.equal(stockPreview.eligible,true);
  stage='genuine_paid_subscription';providerAttempted=true;
  if(cessationRenewal){
    fixtureClock=await write('/v1/test_helpers/test_clocks',{frozen_time:Math.floor(Date.now()/1000),name:'r5-'+scenario+'-'+tenantId},'clock');
    assert.equal(fixtureClock.status,'ready');proof.testClockId=fixtureClock.id;progress();
  }
  customer=await write('/v1/customers',{description:'R5 private paid stock '+tenantId,...(cessationRenewal?{test_clock:fixtureClock.id}:{}),payment_method:'pm_card_visa',
    invoice_settings:{default_payment_method:'pm_card_visa'},metadata:{acceptance_fixture:tenantId}},'customer');
  proof.customerId=customer.id;progress();assert.equal(customer.livemode,false);assert.ok(!customer.email);
  subscription=await write('/v1/subscriptions',{customer:customer.id,items:[{price:BILLING_PRICE,quantity:2}],
    default_payment_method:objectId(customer.invoice_settings.default_payment_method),payment_behavior:'error_if_incomplete',
    metadata:{acceptance_fixture:tenantId}},'subscription');
  proof.subscriptionId=subscription.id;progress();assert.equal(subscription.livemode,false);assert.equal(subscription.status,'active');
  assert.equal(objectId(subscription.customer),customer.id);
  if(cessationRenewal){assert.equal(objectId(subscription.test_clock),fixtureClock.id);}else{assert.ok(!subscription.test_clock);}
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
  if(scenario==='cessation-response-loss'){await verifyCessationResponseLoss();}else if(scenario==='cessation-open-tenancy'){await verifyOpenTenancyCessation();}else if(scenario==='invoice-preview-recovery'){await verifyInvoicePreviewRecovery();}else if(scenario==='cessation-maintenance-conflict'){await verifyCessationObligation();}else if(scenario==='cessation-verified-payment'||scenario==='cessation-financial-conflict'||scenario==='cessation-zero-draft'){await verifyCessationFinancialObligation();}else if(scenario==='cessation-settlement-deposit-conflict'){await verifyCessationSettlementDeposit();}else if(scenario==='cessation-reservation-conflict'){await verifyCessationReservation();}else if(zeroStockCancellation){await verifyZeroStockCancellation();}else if(cessationRenewal){await verifyCessationRenewal();}else if(scenario==='http-permissions'){
    proof.scope='genuine paid sandbox fixture + deployed public HTTP permission and command isolation';
    proof.credentialLoginAccepted=false;proof.httpStockMutationAccepted=false;
    stage='http_sessions';
    const admin=await makeSession(actorId,'admin'),staff=await makeSession(randomUUID(),'staff');
    const http=async(method,path,body,token=admin,workspace=tenantId,extra={})=>{
      const response=await fetch('https://app.quixo.homes/api/management-billing/'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),
        headers:{...(token?{Authorization:'Bearer '+token}:{}),'x-tenant-id':workspace,...extra,...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      return {status:response.status,body:await response.json()};
    };
    const expect=async(method,path,body,status,code,token=admin,workspace=tenantId,extra={})=>{
      const result=await http(method,path,body,token,workspace,extra);
      if(result.status!==status||(code&&result.body.code!==code)){
        console.log('PAID_HTTP_DIAGNOSTIC='+JSON.stringify({stage,path,expectedStatus:status,status:result.status,code:result.body.code||null}));
      }
      assert.equal(result.status,status,path);if(code){assert.equal(result.body.code,code,path);}
      return result.body.data;
    };
    stage='http_admin_positive_control';
    const status=await expect('GET','status',null,200);
    assert.equal(status.entitlement.state,'active');
    const preview=await expect('POST','quantity-preview',{requestId:randomUUID()},200);
    assert.equal(preview.from,2);assert.equal(preview.to,2);assert.equal(preview.timing,'unchanged');
    check('administrator_paid_http_status_and_preview');
    // A synthetic foreign completed command is fixture data, not provider evidence.
    // The genuine primary preview above proves the route's positive path.
    stage='http_foreign_fixture';
    const foreign=randomUUID(),foreignCommand=randomUUID();
    await store.locked(foreign,async q=>{
      await q("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@foreign,'Private command isolation fixture',@slug,'active','development-testing')",{foreign,slug:'r5-paid-http-'+foreign});
      // Commands reference billing_accounts, not tenants directly. Keep the
      // foreign fixture unenrolled with any provider: no customer/subscription.
      await q("INSERT dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,market,inventory_json) VALUES(@foreign,@account,@price,'LK','[]')",{foreign,account:BILLING_ACCOUNT,price:BILLING_PRICE});
      await q("INSERT dbo.management_billing_commands(id,tenant_id,kind,payload_hash,payload_json,status,result_json,completed_at) VALUES(@id,@foreign,'quantity_preview',@digest,'{}','completed',@result,SYSUTCDATETIME())",{id:foreignCommand,foreign,digest:hash({}),result:JSON.stringify({...preview,previewId:foreignCommand})});
    });foreignTenant=foreign;
    const snapshot=async()=>hash({
      stock:await store.read('SELECT * FROM dbo.properties WHERE tenant_id=@tenantId ORDER BY id',{tenantId}),
      staged:await store.read('SELECT * FROM dbo.management_inventory_staging WHERE tenant_id=@tenantId ORDER BY id',{tenantId}),
      commands:await store.read('SELECT * FROM dbo.management_billing_commands WHERE tenant_id IN (@tenantId,@foreign) ORDER BY id',{tenantId,foreign}),
      recovery:await store.read('SELECT r.* FROM dbo.management_billing_recovery r JOIN dbo.management_billing_commands c ON c.id=r.command_id WHERE c.tenant_id IN (@tenantId,@foreign) ORDER BY r.command_id',{tenantId,foreign}),
      steps:await store.read('SELECT s.* FROM dbo.management_billing_steps s JOIN dbo.management_billing_commands c ON c.id=s.command_id WHERE c.tenant_id IN (@tenantId,@foreign) ORDER BY s.command_id,s.name',{tenantId,foreign}),
      audit:await store.read("SELECT * FROM dbo.management_billing_audit WHERE tenant_id IN (@tenantId,@foreign) AND action<>'stripe.event_reconciled' ORDER BY id",{tenantId,foreign})});
    const before=await snapshot(),providerBefore=hash(await provider());
    const routes=[['GET','status',null],...['stock/prepare','stock/withdraw','stock/cessation-preview','stock/cessation','stock/restoration-preview','stock/restore','stock/split-preview','stock/split','refresh','checkout','portal','quantity-preview','quantity-apply','reconcile-cancellation','cancellation'].map(path=>['POST',path,{}])];
    proof.permissionRoutes=routes.length;
    const denied=async(token,workspace,status,code,extra={})=>{
      for(const [method,path,body] of routes){await expect(method,path,body,status,code,token,workspace,extra);}
      assert.equal(await snapshot(),before);assert.equal(hash(await provider()),providerBefore);
    };
    stage='http_nonadmin';await denied(staff,tenantId,403,'BILLING_ADMIN_REQUIRED');check('nonadmin_billing_route_matrix_denied_without_effect');
    stage='http_forged_identity';await denied(null,tenantId,401,null,{'x-user-id':actorId,'x-user-email':'r5-paid-stock-'+tenantId+'@example.invalid','x-dev-bypass-role':'admin'});check('forged_identity_headers_do_not_authenticate');
    stage='http_foreign_workspace';await denied(admin,foreign,403,'TENANT_ACCESS_DENIED');check('foreign_workspace_route_matrix_denied_without_effect');
    stage='http_foreign_commands';
    await expect('POST','quantity-preview',{requestId:foreignCommand},409,'BILLING_REQUEST_CONFLICT');
    await expect('POST','quantity-apply',{requestId:randomUUID(),previewId:foreignCommand},409,'BILLING_PREVIEW_REQUIRED');
    assert.equal(await snapshot(),before);assert.equal(hash(await provider()),providerBefore);check('foreign_command_and_preview_ids_rejected_without_effect');
    stage='http_stale_membership';
    await store.locked(tenantId,q=>q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId,actorId}));
    await denied(admin,tenantId,403,'TENANT_NOT_RESOLVED');check('stale_administrator_membership_denied_without_effect');
    await store.locked(tenantId,q=>q("UPDATE dbo.tenant_memberships SET status='active' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId,actorId}));
    stage='http_revoked_session';await revokeAccessToken(admin);
    await denied(admin,tenantId,401,'INVALID_SESSION');check('revoked_session_route_matrix_denied_without_effect');
    proof.httpAccepted=true;
  }else if(['promotion','http-promotion'].includes(scenario)){
    let stockHttp=null,staffToken=null;
    if(scenario==='http-promotion'){
      proof.scope='genuine sandbox provider + deployed public HTTP paid create/import promotion';
      proof.credentialLoginAccepted=false;
      const adminToken=await makeSession(actorId,'admin');staffToken=await makeSession(randomUUID(),'staff');
      stockHttp=async(path,body,token=adminToken)=>{
        const response=await fetch('https://app.quixo.homes/api/management-billing/'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),
          headers:{Authorization:'Bearer '+token,'x-tenant-id':tenantId,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
        const result=await response.json();
        if(!response.ok){throw Object.assign(Error('Controlled stock HTTP request failed'),{code:result.code||'HTTP_UNCONFIRMED',status:response.status});}
        assert.equal(response.status,200);assert.equal(result.error,null);return result.data;
      };
      stage='http_stock_readiness';const status=await stockHttp('status');
      assert.equal(status.entitlement.state,'active');assert.equal(status.stagingEnabled,true);
      check('public_http_paid_stock_readiness');
    }
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
    const prepare=records=>stockHttp?stockHttp('stock/prepare',{records,reason:'Prepare private paid inventory acceptance.'}):store.stageStock({tenantId,actorId,records,reason:'Prepare private paid inventory acceptance.'});
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
    await assert.rejects(()=>stockHttp?stockHttp('stock/prepare',{records:[rollback],reason:'Nonadmin must not stage stock.'},staffToken):store.stageStock({tenantId,actorId:randomUUID(),records:[rollback],reason:'Nonmember must not stage stock.'}),
      error=>error.code==='BILLING_ADMIN_REQUIRED');
    await unchanged(stagedSnapshot);check(stockHttp?'nonadmin_cannot_stage_stock':'nonmember_cannot_stage_stock');
    if(stockHttp){
      stage='http_foreign_staged_resource';
      const foreign=randomUUID(),record={...records[0].payload,id:randomUUID()};
      // Explicit private fixture data: no operational property or provider object.
      await store.locked(foreign,async q=>{
        await q("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@foreign,'Private pending stock isolation',@slug,'active','development-testing')",{foreign,slug:'r5-pending-'+foreign});
        await q("INSERT dbo.management_inventory_staging(id,tenant_id,kind,payload_json,payload_hash,created_by) VALUES(@id,@foreign,'property',@payload,@digest,@actorId)",{id:record.id,foreign,payload:JSON.stringify(record),digest:hash(record),actorId});
      });foreignTenant=foreign;
      const foreignBefore=hash(await store.read('SELECT * FROM dbo.management_inventory_staging WHERE tenant_id=@foreign ORDER BY id',{foreign}));
      await assert.rejects(()=>stockHttp('stock/withdraw',{ids:[record.id],reason:'Foreign prepared record must remain unchanged.'}),e=>e.status===404&&e.code==='BILLING_STOCK_NOT_FOUND');
      await assert.rejects(()=>prepare([{kind:'property',payload:record}]),e=>e.status===409&&e.code==='BILLING_STOCK_CONFLICT');
      await assert.rejects(()=>stockHttp('stock/prepare',{tenantId:foreign,records:[rollback],reason:'Body cannot override authenticated workspace.'}),e=>e.status===400&&e.code==='BILLING_FIELDS_INVALID');
      assert.equal(hash(await store.read('SELECT * FROM dbo.management_inventory_staging WHERE tenant_id=@foreign ORDER BY id',{foreign})),foreignBefore);
      await unchanged(stagedSnapshot);check('foreign_prepared_stock_and_workspace_override_rejected');
    }
    stage='paid_promotion_preview';
    const preview=stockHttp?await stockHttp('quantity-preview',{requestId:randomUUID()}):await service.quantityPreview({tenantId,actorId,id:randomUUID()});
    assert.equal(preview.from,2);assert.equal(preview.to,5);assert.equal(preview.timing,'prorated_next_invoice');
    assert.equal(await count(),2);assert.ok((await stagedRows()).every(r=>r.status==='pending'));
    assert.equal((await provider()).items.data[0].quantity,2);check('quantity_preview_does_not_promote_stock');
    stage='paid_promotion_apply';
    const apply={tenantId,actorId,id:randomUUID(),previewId:preview.previewId};
    const applyStock=()=>stockHttp?stockHttp('quantity-apply',{requestId:apply.id,previewId:apply.previewId}):service.quantityApply(apply);
    const result=await applyStock();
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
    assert.deepEqual(await applyStock(),result);
    await unchanged(promotedSnapshot);assert.equal(hash(await provider()),remoteHash);
    assert.equal((await stagedRows()).length,3);check('promotion_retry_no_duplicate_effect');
    if(stockHttp){proof.httpAccepted=true;proof.httpStockMutationAccepted=true;}
  }else{
  let transitionHttp=null,foreignProperty=null,foreignUnit=null;
  if(httpTransitions){
    proof.scope='genuine sandbox provider + deployed public HTTP paid cessation/restoration/split';
    proof.credentialLoginAccepted=false;
    const token=await makeSession(actorId,'admin');
    transitionHttp=async(path,body)=>{
      const response=await fetch('https://app.quixo.homes/api/management-billing/'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),
        headers:{Authorization:'Bearer '+token,'x-tenant-id':tenantId,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const result=await response.json();
      if(!response.ok){throw Object.assign(Error('Controlled transition HTTP request failed'),{code:result.code||'HTTP_UNCONFIRMED',status:response.status});}
      assert.equal(response.status,200);assert.equal(result.error,null);return result.data;
    };
    stage='http_transition_readiness';const status=await transitionHttp('status');
    assert.equal(status.entitlement.state,'active');assert.equal(status.stagingEnabled,true);
    check('public_http_paid_transition_readiness');
    const foreign=randomUUID();foreignProperty=randomUUID();foreignUnit=randomUUID();
    await store.locked(foreign,async q=>{
      await q("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@foreign,'Private transition isolation',@slug,'active','development-testing')",{foreign,slug:'r5-transition-'+foreign});
      await q("INSERT dbo.properties(id,tenant_id,name,status,propertytype,country_code) VALUES(@property,@foreign,'Private foreign transition stock','inactive','house','LK')",{property:foreignProperty,foreign});
      await q('UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME() WHERE tenant_id=@foreign',{foreign});
      await q("INSERT dbo.property_units(id,tenant_id,propertyid,unitnumber,status) VALUES(@unit,@foreign,@property,'Private foreign unit','inactive')",{unit:foreignUnit,foreign,property:foreignProperty});
      assert.equal((await q('SELECT property_id FROM dbo.public_listing_preferences WHERE tenant_id=@foreign AND opted_out=1',{foreign})).length,1);
    });foreignTenant=foreign;
  }
  const snapshot=async()=>{
    const params={tenantId,foreign:foreignTenant||tenantId};
    const tables=[['properties','id'],['property_units','id'],['management_inventory_staging','id'],['management_inventory_controls','id'],
      ['management_inventory_splits','command_id'],['management_billing_commands','id']];
    const state={};
    for(const [table,key] of tables){state[table]=await store.read('SELECT * FROM dbo.'+table+' WHERE tenant_id IN (@tenantId,@foreign) ORDER BY '+key,params);}
    state.recovery=await store.read('SELECT r.* FROM dbo.management_billing_recovery r JOIN dbo.management_billing_commands c ON c.id=r.command_id WHERE c.tenant_id IN (@tenantId,@foreign) ORDER BY r.command_id',params);
    state.steps=await store.read('SELECT s.* FROM dbo.management_billing_steps s JOIN dbo.management_billing_commands c ON c.id=s.command_id WHERE c.tenant_id IN (@tenantId,@foreign) ORDER BY s.command_id,s.name',params);
    state.splitUnits=await store.read('SELECT u.* FROM dbo.management_inventory_split_units u JOIN dbo.management_inventory_splits s ON s.command_id=u.command_id WHERE s.tenant_id IN (@tenantId,@foreign) ORDER BY u.id',params);
    state.audit=await store.read("SELECT * FROM dbo.management_billing_audit WHERE tenant_id IN (@tenantId,@foreign) AND action<>'stripe.event_reconciled' ORDER BY id",params);
    return hash(state);
  };
  const remoteState=async()=>{
    const sub=await provider();return hash({sub,schedule:objectId(sub.schedule)?await read('/v1/subscription_schedules/'+objectId(sub.schedule)):null});
  };
  const denied=async(cases,name)=>{
    const before=await snapshot(),remote=await remoteState();
    for(const [path,body,status,code] of cases){await assert.rejects(()=>transitionHttp(path,body),e=>e.status===status&&e.code===code);}
    assert.equal(await snapshot(),before);assert.equal(await remoteState(),remote);
    proof.transitionNegativeRequests=(proof.transitionNegativeRequests||0)+cases.length;check(name);
  };
  const previewCall=(path,args,fn)=>transitionHttp?transitionHttp(path,args):fn();
  const applyCall=(path,args,fn)=>transitionHttp?transitionHttp(path,{requestId:args.id,propertyId:args.propertyId,
    ...(args.units?{units:args.units}:{unitId:args.unitId||null}),inventoryHash:args.inventoryHash,reason:args.reason}):fn();
  if(httpTransitions){
    stage='http_foreign_transition_resources';
    const target={propertyId:foreignProperty,unitId:null},mutation={...target,requestId:randomUUID(),inventoryHash:'0'.repeat(64),reason:'Reject foreign transition resource.'};
    const units=[1,2].map(n=>({id:randomUUID(),propertyid:foreignProperty,unitnumber:'Private foreign attempt '+n,availability:'inactive'}));
    await denied([
      ['stock/cessation-preview',target,404,'BILLING_STOCK_NOT_FOUND'],
      ['stock/cessation',mutation,404,'BILLING_STOCK_NOT_FOUND'],
      ['stock/restoration-preview',target,409,'BILLING_RESTORE_NOT_CEASED'],
      ['stock/restore',{...mutation,requestId:randomUUID()},409,'BILLING_RESTORE_NOT_CEASED'],
      ['stock/split-preview',{propertyId:foreignProperty,units},404,'BILLING_SPLIT_NOT_FOUND'],
      ['stock/split',{propertyId:foreignProperty,units,requestId:randomUUID(),inventoryHash:'0'.repeat(64),reason:mutation.reason},404,'BILLING_SPLIT_NOT_FOUND'],
      ['stock/cessation-preview',{propertyId,unitId:foreignUnit},404,'BILLING_STOCK_NOT_FOUND'],
      ['stock/cessation',{...mutation,propertyId,unitId:foreignUnit,requestId:randomUUID()},404,'BILLING_STOCK_NOT_FOUND']
    ],'foreign_property_and_mismatched_unit_transitions_rejected');
  }
  stage='paid_cessation_preview';
  const preview=await previewCall('stock/cessation-preview',{propertyId,unitId:null},()=>service.cessationPreview({tenantId,actorId,propertyId}));assert.equal(preview.eligible,true);
  const cease={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:preview.inventoryHash,reason:'Cease private synthetic stock for paid acceptance.'};
  if(httpTransitions){stage='http_stale_cessation';await denied([['stock/cessation',{requestId:randomUUID(),propertyId,unitId:null,inventoryHash:'0'.repeat(64),reason:cease.reason},409,'BILLING_CESSATION_BLOCKED']],'stale_cessation_preview_rejected_without_effect');}
  stage='paid_cessation_apply';
  const ceased=await applyCall('stock/cessation',cease,()=>service.ceaseStock(cease));assert.equal(await count(),1);const ceasedSchedule=await scheduled(1);
  check('cessation_defers_provider_reduction_to_renewal');
  const ceaseAudit=await audit();assert.deepEqual(await applyCall('stock/cessation',cease,()=>service.ceaseStock(cease)),ceased);
  assert.equal(await audit(),ceaseAudit);assert.equal(await scheduled(1),ceasedSchedule);check('cessation_retry_no_duplicate_effect');
  stage='paid_restoration';
  const restorePreview=await previewCall('stock/restoration-preview',{propertyId,unitId:null},()=>service.restorationPreview({tenantId,actorId,propertyId}));
  const restore={tenantId,actorId,propertyId,id:randomUUID(),inventoryHash:restorePreview.inventoryHash,reason:'Restore the same synthetic paid property.'};
  if(httpTransitions){stage='http_stale_restoration';await denied([['stock/restore',{requestId:randomUUID(),propertyId,unitId:null,inventoryHash:'0'.repeat(64),reason:restore.reason},409,'BILLING_INVENTORY_CHANGED']],'stale_restoration_preview_rejected_without_effect');}
  stage='paid_restoration_apply';
  const restored=await applyCall('stock/restore',restore,()=>service.restoreStock(restore));assert.equal(restored.managementRestored,true);assert.equal(await count(),2);
  const restoredSchedule=await scheduled(2);check('restoration_updates_paid_renewal_schedule');
  const restoreAudit=await audit();assert.deepEqual(await applyCall('stock/restore',restore,()=>service.restoreStock(restore)),restored);
  assert.equal(await audit(),restoreAudit);assert.equal(await scheduled(2),restoredSchedule);check('restoration_retry_no_duplicate_effect');
  const controls=await store.read('SELECT property_id,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId',{tenantId});
  assert.equal(controls.length,1);assert.equal(String(controls[0].property_id).toLowerCase(),propertyId);assert.ok(controls[0].restored_at);
  check('original_property_and_cessation_history_retained');
  stage='paid_split';
  const units=[1,2,3].map(n=>({id:randomUUID(),propertyid:propertyId,unitnumber:'Private acceptance unit '+n,availability:'inactive'}));
  const splitPreview=await previewCall('stock/split-preview',{propertyId,units},()=>service.splitPreview({tenantId,actorId,propertyId,units}));
  const split={tenantId,actorId,propertyId,units,id:randomUUID(),inventoryHash:splitPreview.inventoryHash,reason:'Split private synthetic property under paid subscription.'};
  if(httpTransitions){
    stage='http_stale_split';await denied([['stock/split',{requestId:randomUUID(),propertyId,units,inventoryHash:'0'.repeat(64),reason:split.reason},409,'BILLING_INVENTORY_CHANGED']],'stale_split_preview_rejected_without_effect');
    stage='http_foreign_split_unit';
    const conflicting=units.map((u,i)=>i===0?{...u,id:foreignUnit}:u);
    await denied([
      ['stock/split-preview',{propertyId,units:conflicting},409,'BILLING_SPLIT_UNIT_CONFLICT'],
      ['stock/split',{requestId:randomUUID(),propertyId,units:conflicting,inventoryHash:split.inventoryHash,reason:split.reason},409,'BILLING_SPLIT_UNIT_CONFLICT']
    ],'foreign_unit_identity_reuse_rejected_without_effect');
  }
  stage='paid_split_apply';
  const result=await applyCall('stock/split',split,()=>service.splitStock(split));assert.equal(result.splitCompleted,true);assert.equal(await count(),4);
  assert.equal((await store.read('SELECT id FROM dbo.property_units WHERE tenant_id=@tenantId AND propertyid=@propertyId',{tenantId,propertyId})).length,3);
  const splitSchedule=await scheduled(4);assert.equal((await store.account(tenantId)).pending_quantity,4);
  check('split_activates_exact_units_with_next_renewal_quantity');
  const splitAudit=await audit();assert.deepEqual(await applyCall('stock/split',split,()=>service.splitStock(split)),result);
  assert.equal(await audit(),splitAudit);assert.equal(await scheduled(4),splitSchedule);check('split_retry_no_duplicate_effect');
  if(httpTransitions){
    stage='http_repeat_split_new_command';
    await denied([
      ['stock/split-preview',{propertyId,units},409,'BILLING_SPLIT_ALREADY_SPLIT'],
      ['stock/split',{requestId:randomUUID(),propertyId,units,inventoryHash:split.inventoryHash,reason:split.reason},409,'BILLING_SPLIT_ALREADY_SPLIT']
    ],'second_split_command_rejected_without_effect');
    proof.httpAccepted=true;proof.httpStockMutationAccepted=true;
  }
  }
  }
  assert.deepEqual(await protectedState(),baseline);check('protected_accounts_subscriptions_and_clocks_unchanged');
  passed=true;
  }
}catch(error){console.error('PAID_INVENTORY_FAILED='+JSON.stringify({stage,code:error.code||'UNCONFIRMED',sqlNumber:Number.isInteger(error.number)?error.number:null,sqlLine:Number.isInteger(error.lineNumber)?error.lineNumber:null,...proof}));process.exitCode=1;}
finally{await cleanupFixture();}

