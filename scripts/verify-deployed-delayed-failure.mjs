// Dedicated sandbox fixture; no members, stock, worker scope or runtime changes.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createBillingService} from '/app/src/api/managementBilling/service.js';
import {createStripeClient,objectId,invoiceSubscription} from '/app/src/api/managementBilling/stripe.js';
import {BILLING_ACCOUNT,BILLING_PRICE,hash} from '/app/src/api/managementBilling/contract.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const target=JSON.parse(process.env.DELAYED_ACCEPTANCE_TARGET||'{}');
const store=createBillingStore(),stripe=createStripeClient();
const service=createBillingService({store,stripe});
const proof={fixtureId:target.id,scope:'deployed signed HTTP webhook + SQL; delayed failure after genuine recovery',livemode:false};
let stage='preflight';
const read=(path,body)=>stripe.request('GET',path,body);
const write=(path,body,key)=>stripe.request('POST',path,body,`delayed:${target.id}:${key}`);
const progress=()=>console.log('DELAYED_FIXTURE='+JSON.stringify(proof));
const poll=async(action,accept)=>{
  for(let n=0;n<120;n++){const value=await action();if(accept(value)){return value;}await new Promise(resolve=>setTimeout(resolve,1000));}
  throw Object.assign(new Error('Bounded acceptance wait expired'),{code:'ACCEPTANCE_TIMEOUT'});
};
const main=async()=>{
  assert.match(target.id||'',/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for(const flag of ['MANAGEMENT_BILLING_SANDBOX_ENABLED','MANAGEMENT_BILLING_SCHEMA_READY']){assert.equal(process.env[flag],'true');}
  await stripe.assertAccount();
  if(target.inspect){
    const account=await store.account(target.id);
    const events=await store.read('SELECT stripe_event_id,event_type,processed_at FROM dbo.management_billing_events WHERE tenant_id=@id',{id:target.id});
    console.log('DELAYED_INSPECT='+JSON.stringify({fixtureId:target.id,bound:!!account,customer:account?.stripe_customer_id,subscription:account?.stripe_subscription_id,
      status:account?.subscription_status,grace:account?.grace_started_at,paidThrough:account?.paid_through,events,readOnly:true}));return;
  }
  // The accepted retained clock is a protected control, never a test target.
  const protectedId='80A4B392-13F8-484D-81FA-A110A6EF75F0';
  assert.notEqual(target.id.toLowerCase(),protectedId.toLowerCase());
  assert.deepEqual(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).split(',').map(x=>x.trim().toLowerCase()),[protectedId.toLowerCase()]);
  const control=await store.account(protectedId);assert.equal(control.stripe_subscription_id,'sub_1UYmVVQ4sARuLNQakc6Gat2Z');
  const financial=s=>({id:s.id,customer:objectId(s.customer),status:s.status,cancel:s.cancel_at_period_end,schedule:objectId(s.schedule),invoice:objectId(s.latest_invoice),
    items:s.items.data.map(i=>({id:i.id,price:objectId(i.price),quantity:i.quantity,start:i.current_period_start,end:i.current_period_end}))});
  const controlHash=hash(control),controlFinancial=hash(financial(await read('/v1/subscriptions/'+control.stripe_subscription_id)));
  const controlClock=await read('/v1/test_helpers/test_clocks/clock_1UYnGgQ4sARuLNQaB716SfPQ');
  const secret=process.env.STRIPE_SANDBOX_WEBHOOK_SECRET;assert.ok(secret?.startsWith('whsec_'));
  await service.price(BILLING_PRICE);
  // Reserve once before provider writes. Any failed/unknown run must be inspected,
  // never replaced or blindly rerun. Logs retain IDs without payloads or secrets.
  await store.locked(target.id,async q=>{
    assert.equal((await q('SELECT id FROM dbo.tenants WHERE id=@id',{id:target.id})).length,0,'Existing fixture: inspect original run');
    await q("INSERT INTO dbo.tenants(id,name,slug,status,[plan]) VALUES(@id,'R5 delayed-event sandbox acceptance',@slug,'active','development-testing')",
      {id:target.id,slug:`r5-delayed-${target.id}`});
  });progress();
  stage='dedicated_provider_fixture';
  const clock=await write('/v1/test_helpers/test_clocks',{frozen_time:Math.floor(Date.now()/1000),name:`r5-delayed-${target.id}`},'clock');
  proof.clockId=clock.id;assert.equal(clock.livemode,false);progress();
  const customer=await write('/v1/customers',{test_clock:clock.id,description:`r5-delayed-${target.id}`,payment_method:'pm_card_visa',
    invoice_settings:{default_payment_method:'pm_card_visa'},metadata:{acceptance_fixture:target.id}},'customer');
  proof.customerId=customer.id;assert.equal(customer.livemode,false);assert.ok(!customer.email);assert.equal(objectId(customer.test_clock),clock.id);progress();
  const good=objectId(customer.invoice_settings.default_payment_method);
  const subscription=await write('/v1/subscriptions',{customer:customer.id,items:[{price:BILLING_PRICE,quantity:1}],default_payment_method:good,
    payment_behavior:'error_if_incomplete',metadata:{acceptance_fixture:target.id}},'subscription');
  proof.subscriptionId=subscription.id;progress();
  const current=()=>read('/v1/subscriptions/'+subscription.id);
  const initial=await read('/v1/invoices/'+objectId(subscription.latest_invoice));
  assert.equal(initial.status,'paid');assert.equal(initial.amount_paid,500);assert.equal(initial.billing_reason,'subscription_create');
  assert.equal(subscription.livemode,false);assert.equal(objectId(subscription.test_clock),clock.id);
  const bad=await write('/v1/payment_methods/pm_card_chargeCustomerFail/attach',{customer:customer.id},'bad-method');
  await write('/v1/subscriptions/'+subscription.id,{default_payment_method:bad.id},'fail-renewal');
  stage='genuine_failed_renewal';
  const renewalAt=subscription.items.data[0].current_period_end;
  for(const time of [renewalAt,renewalAt+7200]){
    await write('/v1/test_helpers/test_clocks/'+clock.id+'/advance',{frozen_time:time},`advance-${time}`);
    await poll(()=>read('/v1/test_helpers/test_clocks/'+clock.id),c=>c.status==='ready'&&c.frozen_time===time);
  }
  const invoice=await poll(async()=>read('/v1/invoices/'+objectId((await current()).latest_invoice)),i=>i.id!==initial.id&&i.status==='open'&&i.attempted);
  assert.equal(invoice.livemode,false);assert.equal(invoiceSubscription(invoice),subscription.id);assert.equal(objectId(invoice.customer),customer.id);
  assert.equal(invoice.billing_reason,'subscription_cycle');assert.equal(invoice.amount_remaining,500);assert.equal((await current()).status,'past_due');
  const eventFor=async type=>poll(async()=>{
    let cursor;
    for(let n=0;n<10;n++){
      const page=await read('/v1/events',{type,limit:100,created:{gte:clock.frozen_time-60},...(cursor?{starting_after:cursor}:{})});
      const event=page.data.find(e=>e.data.object.id===invoice.id&&objectId(e.data.object.customer)===customer.id&&e.livemode===false);
      if(event){return event;}if(!page.has_more){return null;}cursor=page.data.at(-1)?.id;assert.ok(cursor);
    }
    throw Object.assign(new Error('Bounded event scan exhausted'),{code:'EVENT_SCAN_EXHAUSTED'});
  },Boolean);
  const failure=await eventFor('invoice.payment_failed');proof.failureEventId=failure.id;proof.invoiceId=invoice.id;progress();
  stage='genuine_recovery_before_binding';
  await write('/v1/subscriptions/'+subscription.id,{default_payment_method:good},'restore-method');
  await write('/v1/invoices/'+invoice.id+'/pay',{payment_method:good},'pay-failed-invoice');
  const paid=await poll(()=>read('/v1/invoices/'+invoice.id),i=>i.status==='paid');
  assert.equal(paid.amount_paid,500);assert.equal(paid.amount_remaining,0);
  const recovered=await current();assert.equal(recovered.status,'active');
  const paidEvent=await eventFor('invoice.paid');proof.paidEventId=paidEvent.id;progress();
  assert.equal((await store.read('SELECT stripe_event_id FROM dbo.management_billing_events WHERE stripe_event_id=@id',{id:failure.id})).length,0);
  // Binding only after confirmed recovery makes every first ledger acceptance of
  // this old failure (including natural Stripe retries) a delayed delivery.
  await store.locked(target.id,q=>q(`INSERT INTO dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,market,inventory_json)
    VALUES(@id,@account,@customer,@subscription,@price,'LK','[]')`,{id:target.id,account:BILLING_ACCOUNT,customer:customer.id,subscription:subscription.id,price:BILLING_PRICE}));
  const deliver=async event=>{
    const body=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000);
    const signature=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
    const response=await fetch('https://app.quixo.homes/api/management-billing/webhook',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body});
    const data=await response.json();assert.equal(response.status,200,data.code||'Webhook status');assert.equal(data.data?.received,true);return data.data;
  };
  stage='deployed_delayed_delivery';
  await deliver(paidEvent);
  const active=async()=>{
    const account=await store.account(target.id);
    assert.equal(account.subscription_status,'active');assert.ok(account.initial_payment_verified);assert.equal(account.grace_started_at,null);
    assert.equal(account.quantity,1);assert.equal(new Date(account.paid_through).getTime(),recovered.items.data[0].current_period_end*1000);
    assert.equal((await service.summary(target.id)).entitlement.state,'active');
  };
  await active();await deliver(failure);await active();
  for(let n=0;n<2;n++){assert.equal((await deliver(failure)).duplicate,true);await active();}
  for(const event of [paidEvent,failure]){
    assert.equal((await store.read('SELECT stripe_event_id FROM dbo.management_billing_events WHERE tenant_id=@id AND stripe_event_id=@event',{id:target.id,event:event.id})).length,1);
    assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE tenant_id=@id AND resource_id=@event AND action='stripe.event_reconciled'",{id:target.id,event:event.id})).length,1);
  }
  assert.equal((await store.read('SELECT id FROM dbo.tenant_memberships WHERE tenant_id=@id',{id:target.id})).length,0);
  assert.equal((await store.read('SELECT id FROM dbo.properties WHERE tenant_id=@id',{id:target.id})).length,0);
  assert.equal(hash(await store.account(protectedId)),controlHash);
  assert.equal(hash(financial(await read('/v1/subscriptions/'+control.stripe_subscription_id))),controlFinancial);
  assert.equal((await read('/v1/test_helpers/test_clocks/'+controlClock.id)).frozen_time,controlClock.frozen_time);
  Object.assign(proof,{passed:true,recoveryBeforeBinding:true,signedHttp:true,delayedFailureLedgerRows:1,delayedFailureAuditRows:1,duplicateDeliveries:2,
    entitlement:'active',grace:null,protectedAccountAndSubscriptionUnchanged:true,protectedClockUnchanged:true,workerScopeUnchanged:true,
    retainedDedicatedFixture:true,paidThrough:recovered.items.data[0].current_period_end,fixtureFrozenTime:renewalAt+7200});
  console.log('DELAYED_PASS='+JSON.stringify(proof));
};
try{await main();}catch(error){console.error('DELAYED_FAILED='+JSON.stringify({stage,code:error.code||'UNCONFIRMED',...proof}));process.exitCode=1;}
finally{await closeMssqlPool();}
