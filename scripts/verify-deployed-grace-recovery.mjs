// Existing dedicated sandbox only. No SQL clock edits or HTTP rollout changes.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createBillingStore,assertManagementWrite} from '/app/src/api/managementBilling/store.js';
import {createBillingService} from '/app/src/api/managementBilling/service.js';
import {createStripeClient,objectId,invoiceSubscription} from '/app/src/api/managementBilling/stripe.js';
import {BILLING_ACCOUNT,BILLING_PRICE,hash} from '/app/src/api/managementBilling/contract.js';
import {getMssqlPool,closeMssqlPool,sql} from '/app/src/api/mssql/pool.js';

const target=JSON.parse(process.env.GRACE_ACCEPTANCE_TARGET||'{}');
const fixture={tenant:'2383f4fc-e107-4ac7-9e13-39db501f40ec',customer:'cus_VcBsCPq1TS8N9K',subscription:'sub_1UaxV8Q4sARuLNQaOeDFrlg3',clock:'clock_1UaxV7Q4sARuLNQazaI2X0i2'};
const store=createBillingStore(),stripe=createStripeClient(),service=createBillingService({store,stripe});
const proof={operationId:target.id,fixture,livemode:false,scope:'deployed signed HTTP lifecycle + SQL guard invoked with process-local fixture scope'};
const read=(path,body)=>stripe.request('GET',path,body);
const write=(path,body,key)=>stripe.request('POST',path,body,`grace:${target.id}:${key}`);
const current=()=>read('/v1/subscriptions/'+fixture.subscription);
let stage='preflight';
const progress=()=>console.log('GRACE_PROGRESS='+JSON.stringify(proof));
const poll=async(action,accept)=>{
  for(let n=0;n<120;n++){const value=await action();if(accept(value)){return value;}await new Promise(resolve=>setTimeout(resolve,1000));}
  throw Object.assign(new Error('Bounded acceptance wait expired'),{code:'ACCEPTANCE_TIMEOUT'});
};
const main=async()=>{
  assert.match(target.id||'',/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for(const flag of ['MANAGEMENT_BILLING_SANDBOX_ENABLED','MANAGEMENT_BILLING_SCHEMA_READY']){assert.equal(process.env[flag],'true');}
  await stripe.assertAccount();
  const account=await store.account(fixture.tenant);assert.ok(account);
  assert.equal(account.stripe_account_id,BILLING_ACCOUNT);assert.equal(account.stripe_customer_id,fixture.customer);
  assert.equal(account.stripe_subscription_id,fixture.subscription);assert.equal(account.stripe_price_id,BILLING_PRICE);
  const subscription=await current();assert.equal(subscription.livemode,false);assert.equal(objectId(subscription.customer),fixture.customer);
  assert.equal(objectId(subscription.test_clock),fixture.clock);assert.equal(subscription.metadata.acceptance_fixture,fixture.tenant);
  if(target.inspect){
    const invoice=await read('/v1/invoices/'+objectId(subscription.latest_invoice));
    const events=await store.read('SELECT stripe_event_id,event_type,processed_at FROM dbo.management_billing_events WHERE tenant_id=@id',{id:fixture.tenant});
    console.log('GRACE_INSPECT='+JSON.stringify({operationId:target.id,fixture,status:account.subscription_status,grace:account.grace_started_at,paidThrough:account.paid_through,
      providerStatus:subscription.status,invoiceId:invoice.id,invoiceStatus:invoice.status,events,readOnly:true}));return;
  }
  assert.equal(subscription.status,'active');assert.equal(account.subscription_status,'active');assert.equal(account.grace_started_at,null);
  assert.ok(account.initial_payment_verified);assert.equal(account.comp_type,null);assert.equal(account.risk_hold,false);
  assert.ok(!subscription.cancel_at_period_end&&!subscription.trial_end&&!subscription.trial_start&&!subscription.schedule);
  assert.equal(subscription.items.data.length,1);assert.equal(objectId(subscription.items.data[0].price),BILLING_PRICE);assert.equal(subscription.items.data[0].quantity,1);
  assert.equal(new Date(account.paid_through).getTime(),1799758393000,'Expected retained fixture starting period');
  const clock=await read('/v1/test_helpers/test_clocks/'+fixture.clock);assert.equal(clock.status,'ready');assert.equal(clock.frozen_time,1797087193);
  const customer=await read('/v1/customers/'+fixture.customer);assert.equal(customer.metadata.acceptance_fixture,fixture.tenant);assert.ok(!customer.email);
  assert.equal(objectId(customer.test_clock),fixture.clock);
  const good=objectId(subscription.default_payment_method);assert.match(good||'',/^pm_/);
  const secret=process.env.STRIPE_SANDBOX_WEBHOOK_SECRET;assert.ok(secret?.startsWith('whsec_'));
  const tenant=(await store.read('SELECT [plan],status FROM dbo.tenants WHERE id=@id',{id:fixture.tenant}))[0];
  assert.equal(tenant.plan,'development-testing');assert.equal(tenant.status,'active');
  for(const table of ['tenant_memberships','properties','management_billing_commands']){
    assert.equal((await store.read(`SELECT id FROM dbo.${table} WHERE tenant_id=@id`,{id:fixture.tenant})).length,0);
  }
  const protectedId='80A4B392-13F8-484D-81FA-A110A6EF75F0';
  assert.deepEqual(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).split(',').map(x=>x.trim().toLowerCase()),[protectedId.toLowerCase()]);
  assert.notEqual(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED,'true','Full HTTP rollout is a separate case');
  const control=await store.account(protectedId);assert.equal(control.stripe_subscription_id,'sub_1UYmVVQ4sARuLNQakc6Gat2Z');
  const financial=s=>({id:s.id,customer:objectId(s.customer),status:s.status,cancel:s.cancel_at_period_end,schedule:objectId(s.schedule),invoice:objectId(s.latest_invoice),
    items:s.items.data.map(i=>({id:i.id,price:objectId(i.price),quantity:i.quantity,start:i.current_period_start,end:i.current_period_end}))});
  const controlHash=hash(control),controlFinancial=hash(financial(await read('/v1/subscriptions/'+control.stripe_subscription_id)));
  const controlClock=await read('/v1/test_helpers/test_clocks/clock_1UYnGgQ4sARuLNQaB716SfPQ');
  // Explicit dependency only: neither process.env nor the serving app is changed.
  const guardEnv={...process.env,MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:'true',MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS:`${fixture.tenant},${target.id}`};
  assert.equal(await store.account(target.id),null);
  const guard=async(tenantId,denied=false)=>{
    const transaction=new sql.Transaction(await getMssqlPool());await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try{
      if(denied){await assert.rejects(assertManagementWrite({tenantId,transaction,env:guardEnv}),{status:403,code:'MANAGEMENT_READ_ONLY'});}
      else{await assertManagementWrite({tenantId,transaction,env:guardEnv});}
    }finally{await transaction.rollback();}
  };
  await guard(target.id,true);await guard(fixture.tenant);
  // Single durable reservation. Never rerun an uncertain provider operation.
  await store.locked(fixture.tenant,async q=>{
    assert.equal((await q('SELECT id FROM dbo.management_billing_audit WHERE resource_id=@id',{id:target.id})).length,0,'Inspect original operation before retry');
    await store.audit(q,{tenantId:fixture.tenant,action:'acceptance.grace.started',resourceId:target.id,current:fixture,reason:'Dedicated sandbox grace/recovery acceptance; no runtime rollout'});
  });progress();
  const deliver=async event=>{
    const body=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000);
    const signature=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
    const response=await fetch('https://app.quixo.homes/api/management-billing/webhook',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body});
    const data=await response.json();assert.equal(response.status,200,data.code||'Webhook status');assert.equal(data.data?.received,true);return data.data;
  };
  const eventFor=async(type,invoiceId)=>poll(async()=>{
    const matches=[];let cursor;
    for(let n=0;n<10;n++){
      const page=await read('/v1/events',{type,limit:100,created:{gte:clock.created},...(cursor?{starting_after:cursor}:{})});
      matches.push(...page.data.filter(e=>e.livemode===false&&e.data.object.id===invoiceId&&objectId(e.data.object.customer)===fixture.customer));
      if(!page.has_more){return matches.sort((a,b)=>a.created-b.created)[0]||null;}cursor=page.data.at(-1)?.id;assert.ok(cursor);
    }
    throw Object.assign(new Error('Bounded event scan exhausted'),{code:'EVENT_SCAN_EXHAUSTED'});
  },Boolean);
  stage='genuine_failure';
  const bad=await write('/v1/payment_methods/pm_card_chargeCustomerFail/attach',{customer:fixture.customer},'bad-method');
  await write('/v1/subscriptions/'+fixture.subscription,{default_payment_method:bad.id},'fail-renewal');
  const renewalAt=subscription.items.data[0].current_period_end;
  for(const time of [renewalAt,renewalAt+7200]){
    await write('/v1/test_helpers/test_clocks/'+fixture.clock+'/advance',{frozen_time:time},`advance-${time}`);
    await poll(()=>read('/v1/test_helpers/test_clocks/'+fixture.clock),c=>c.status==='ready'&&c.frozen_time===time);
  }
  const invoice=await poll(async()=>read('/v1/invoices/'+objectId((await current()).latest_invoice)),i=>i.id!==objectId(subscription.latest_invoice)&&i.status==='open'&&i.attempted);
  assert.equal(invoice.livemode,false);assert.equal(invoiceSubscription(invoice),fixture.subscription);assert.equal(objectId(invoice.customer),fixture.customer);
  assert.equal(invoice.billing_reason,'subscription_cycle');assert.equal(invoice.amount_remaining,500);assert.equal((await current()).status,'past_due');
  const failure=await eventFor('invoice.payment_failed',invoice.id);proof.invoiceId=invoice.id;proof.failureEventId=failure.id;progress();
  stage='deployed_grace_and_sql_guard';
  await deliver(failure);
  const grace=await store.account(fixture.tenant),summary=await service.summary(fixture.tenant);
  assert.equal(grace.subscription_status,'past_due');assert.equal(new Date(grace.grace_started_at).getTime(),failure.created*1000);
  assert.equal(summary.entitlement.state,'grace');assert.equal(summary.entitlement.management,true);
  assert.equal(Date.parse(summary.entitlement.graceEndsAt),(failure.created+7*86400)*1000);
  await guard(fixture.tenant);await guard(target.id,true);
  assert.equal((await deliver(failure)).duplicate,true);
  assert.equal(new Date((await store.account(fixture.tenant)).grace_started_at).getTime(),failure.created*1000);
  proof.graceStartedAt=new Date(failure.created*1000).toISOString();proof.graceEndsAt=summary.entitlement.graceEndsAt;proof.sqlGuardDuringGrace=true;progress();
  stage='genuine_recovery_within_grace';
  await write('/v1/subscriptions/'+fixture.subscription,{default_payment_method:good},'restore-method');
  await write('/v1/invoices/'+invoice.id+'/pay',{payment_method:good},'recover-invoice');
  const paid=await poll(()=>read('/v1/invoices/'+invoice.id),i=>i.status==='paid');assert.equal(paid.amount_paid,500);assert.equal(paid.amount_remaining,0);
  const recovery=await eventFor('invoice.paid',invoice.id);assert.ok(recovery.created<(failure.created+7*86400));
  proof.paidEventId=recovery.id;await deliver(recovery);
  const final=await store.account(fixture.tenant),recovered=await current();
  assert.equal(recovered.status,'active');assert.equal(final.subscription_status,'active');assert.equal(final.grace_started_at,null);
  assert.ok(final.initial_payment_verified);assert.equal((await service.summary(fixture.tenant)).entitlement.state,'active');
  assert.equal(new Date(final.paid_through).getTime(),recovered.items.data[0].current_period_end*1000);
  await guard(fixture.tenant);await guard(target.id,true);
  for(const event of [failure,recovery]){
    assert.equal((await store.read('SELECT stripe_event_id FROM dbo.management_billing_events WHERE tenant_id=@id AND stripe_event_id=@event',{id:fixture.tenant,event:event.id})).length,1);
    assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE tenant_id=@id AND resource_id=@event AND action='stripe.event_reconciled'",{id:fixture.tenant,event:event.id})).length,1);
  }
  assert.equal(hash(await store.account(protectedId)),controlHash);
  assert.equal(hash(financial(await read('/v1/subscriptions/'+control.stripe_subscription_id))),controlFinancial);
  assert.equal((await read('/v1/test_helpers/test_clocks/'+controlClock.id)).frozen_time,controlClock.frozen_time);
  Object.assign(proof,{passed:true,signedHttp:true,gracePinnedToFirstProviderFailure:true,duplicateDidNotExtendGrace:true,recoveryWithinGrace:true,
    entitlement:'active',grace:null,sqlGuardAfterRecovery:true,sqlGuardNegativeControl:true,sqlTimeUnchanged:true,httpEnforcementRollout:false,
    eventAndAuditRowsPerEvent:1,protectedRetainedStateUnchanged:true,workerScopeUnchanged:true,paidThrough:recovered.items.data[0].current_period_end,fixtureFrozenTime:renewalAt+7200,
    graceExpiryAccepted:false});
  await store.locked(fixture.tenant,q=>store.audit(q,{tenantId:fixture.tenant,action:'acceptance.grace.passed',resourceId:target.id,current:proof,reason:'Genuine deployed grace/recovery passed; expiry and HTTP rollout remain separate'}));
  console.log('GRACE_PASS='+JSON.stringify(proof));
};
try{await main();}catch(error){console.error('GRACE_FAILED='+JSON.stringify({stage,code:error.code||'UNCONFIRMED',...proof}));process.exitCode=1;}
finally{await closeMssqlPool();}
