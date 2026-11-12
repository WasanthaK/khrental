// Genuine sandbox resources, existing service/webhook code, transactional memory.
// No production database, app configuration, customer email or live credential.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {BILLING_ACCOUNT,BILLING_PRICE} from '../src/api/managementBilling/contract.js';
import {createStripeClient,objectId,invoiceSubscription} from '../src/api/managementBilling/stripe.js';
import {billingReplay} from '../tests/fixtures/management-billing-replay.js';

const run=`r5-lifecycle-${process.env.GITHUB_RUN_ID || 'local'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
const report={run,source:process.env.GITHUB_SHA || 'local',account:BILLING_ACCOUNT,livemode:false,
  scope:'genuine Stripe sandbox API + application webhook service + transactional memory; not deployed HTTP/SQL',checks:[],objects:{}};
let stage='configuration',clock,customer,subscription,frozen;
const stripe=createStripeClient({env:{...process.env,MANAGEMENT_BILLING_SANDBOX_ENABLED:'true',STRIPE_SANDBOX_ACCOUNT_ID:BILLING_ACCOUNT}});
const check=(name,condition)=>{assert.ok(condition,name);report.checks.push(name);console.log(`PASS ${name}`);};
const read=(path,body)=>stripe.request('GET',path,body);
const write=(path,body,key)=>stripe.request('POST',path,body,`${run}:${key}`);
const poll=async(label,action,predicate)=>{
  for(let attempt=0;attempt<120;attempt++){
    const result=await action();if(predicate(result)){return result;}
    await delay(1000);
  }
  throw new Error(`Timed out: ${label}`);
};
const advance=async time=>{
  assert.ok(time>frozen,'clock must advance');
  await write(`/v1/test_helpers/test_clocks/${clock.id}/advance`,{frozen_time:time},`advance-${time}`);
  const ready=await poll('clock ready',()=>read(`/v1/test_helpers/test_clocks/${clock.id}`),c=>c.status==='ready'&&c.frozen_time===time);
  frozen=ready.frozen_time;
};
const getSubscription=()=>read(`/v1/subscriptions/${subscription.id}`);
const getInvoice=async()=>read(`/v1/invoices/${objectId((await getSubscription()).latest_invoice)}`);
const events=async(type,invoiceId)=>{
  const found=[];let cursor;
  for(let pageNumber=0;pageNumber<10;pageNumber++){
    const page=await read('/v1/events',{type,limit:100,...(cursor?{starting_after:cursor}:{})});
    found.push(...page.data.filter(e=>e.livemode===false&&e.data.object.id===invoiceId&&objectId(e.data.object.customer)===customer.id));
    if(!page.has_more){return found;}
    cursor=page.data.at(-1)?.id;assert.ok(cursor,'event pagination cursor');
  }
  throw new Error('Event history exceeds bounded acceptance scan');
};
const eventFor=(type,invoiceId)=>poll(type,()=>events(type,invoiceId),list=>list.length>0).then(list=>list.sort((a,b)=>a.created-b.created)[0]);
const record=async(label,invoice)=>{
  const current=await getSubscription();
  check(`${label}: exact sandbox ownership`,invoice.livemode===false&&current.livemode===false&&
    objectId(invoice.customer)===customer.id&&invoiceSubscription(invoice)===subscription.id&&objectId(current.test_clock)===clock.id);
  report.objects[label]={subscriptionId:current.id,status:current.status,invoiceId:invoice.id,billingReason:invoice.billing_reason,
    invoiceStatus:invoice.status,amountDue:invoice.amount_due,amountPaid:invoice.amount_paid,amountRemaining:invoice.amount_remaining,
    periodEnd:current.items.data[0].current_period_end,frozenTime:frozen};
  return current;
};
try{
  assert.equal(process.env.STRIPE_LIFECYCLE_CONFIRM,'RUN-ISOLATED-SANDBOX','explicit sandbox runner opt-in');
  assert.ok(stripe.configured(),'sandbox credential must be configured');
  await stripe.assertAccount();
  const price=await read(`/v1/prices/${BILLING_PRICE}`);
  check('existing monthly licensed sandbox price',price.livemode===false&&price.active&&price.currency==='usd'&&price.unit_amount===500&&price.recurring?.interval==='month'&&price.recurring?.usage_type==='licensed');
  stage='create isolated resources';
  frozen=Math.floor(Date.now()/1000);
  clock=await write('/v1/test_helpers/test_clocks',{frozen_time:frozen,name:run},'clock');
  report.objects.clockId=clock.id;
  customer=await write('/v1/customers',{test_clock:clock.id,description:run,payment_method:'pm_card_visa',
    invoice_settings:{default_payment_method:'pm_card_visa'},metadata:{acceptance_run:run}},'customer');
  report.objects.customerId=customer.id;
  check('isolated customer without email',customer.livemode===false&&!customer.email&&objectId(customer.test_clock)===clock.id);
  const good=objectId(customer.invoice_settings.default_payment_method);
  subscription=await write('/v1/subscriptions',{customer:customer.id,items:[{price:BILLING_PRICE,quantity:1}],
    default_payment_method:good,payment_behavior:'error_if_incomplete',metadata:{acceptance_run:run}},'subscription');
  report.objects.subscriptionId=subscription.id;
  const replay=billingReplay({stripeClient:stripe,initialTime:frozen*1000,initialAccount:{stripe_customer_id:customer.id,
    stripe_subscription_id:subscription.id,stripe_price_id:BILLING_PRICE}});
  stage='initial payment';
  const initial=await getInvoice();await record('initial',initial);
  check('initial invoice paid',initial.status==='paid'&&initial.billing_reason==='subscription_create'&&initial.amount_paid===500);
  const initialEvent=await eventFor('invoice.paid',initial.id);await replay.deliverEvent(initialEvent);
  check('initial payment grants application management',(await replay.summary()).entitlement.state==='active');

  stage='successful renewal';
  await advance((await getSubscription()).items.data[0].current_period_end);
  await advance(frozen+7200);
  const renewal=await poll('paid renewal',getInvoice,i=>i.id!==initial.id&&i.status==='paid');
  await record('renewal',renewal);
  check('genuine cycle invoice paid',renewal.billing_reason==='subscription_cycle'&&renewal.amount_paid===500);
  replay.setTime(frozen*1000);
  const renewalEvent=await eventFor('invoice.paid',renewal.id);await replay.deliverEvent(renewalEvent);
  check('renewal grants application management',(await replay.summary()).entitlement.state==='active');
  check('renewal duplicate deduplicated',(await replay.deliverEvent(renewalEvent)).duplicate===true);

  stage='failed renewal';
  const bad=await write('/v1/payment_methods/pm_card_chargeCustomerFail/attach',{customer:customer.id},'attach-failing-method');
  await write(`/v1/subscriptions/${subscription.id}`,{default_payment_method:bad.id},'select-failing-method');
  await advance((await getSubscription()).items.data[0].current_period_end);
  await advance(frozen+7200);
  const failed=await poll('failed renewal',getInvoice,i=>i.id!==renewal.id&&i.status==='open'&&i.attempted);
  const pastDue=await record('failure',failed);
  check('genuine failed cycle',failed.billing_reason==='subscription_cycle'&&failed.amount_remaining===500&&pastDue.status==='past_due');
  const failureEvent=await eventFor('invoice.payment_failed',failed.id);
  report.objects.failureEvent={id:failureEvent.id,created:failureEvent.created,invoiceCreated:failed.created};
  // Stripe events retain real time even though invoice periods use frozen time.
  replay.setTime(failureEvent.created*1000);await replay.deliverEvent(failureEvent);
  check('failure grants bounded grace',(await replay.summary()).entitlement.state==='grace');
  const graceStart=Date.parse(replay.state().account.grace_started_at);
  check('grace anchored to provider first failure',graceStart===failureEvent.created*1000);
  check('failure duplicate deduplicated',(await replay.deliverEvent(failureEvent)).duplicate===true);
  replay.setTime(graceStart+7*86400000-1);
  check('management allowed just before grace expiry',(await replay.summary()).entitlement.state==='grace');
  replay.setTime(graceStart+7*86400000);
  check('management denied at exact grace expiry',(await replay.summary()).entitlement.state==='read_only');

  stage='late recovery';
  // Advance both clocks independently. Event time is real; expiry uses the injected
  // application clock, while provider billing advances by seven simulated days.
  await advance(frozen+7*86400);
  await write(`/v1/subscriptions/${subscription.id}`,{default_payment_method:good},'select-good-method');
  await write(`/v1/invoices/${failed.id}/pay`,{payment_method:good},'recover-invoice');
  const recovered=await poll('recovered invoice',()=>read(`/v1/invoices/${failed.id}`),i=>i.status==='paid');
  await record('recovery',recovered);
  const recoveryEvent=await eventFor('invoice.paid',failed.id);
  replay.setTime(graceStart+7*86400000);await replay.deliverEvent(recoveryEvent);
  check('late payment restores management',(await replay.summary()).entitlement.state==='active');
  check('recovery clears grace',replay.state().account.grace_started_at===null);
  // A fresh ledger delivery of the old genuine event must read current Stripe state.
  const stale=billingReplay({stripeClient:stripe,initialTime:graceStart+7*86400000,initialAccount:replay.state().account});
  await stale.deliverEvent(failureEvent);
  check('stale failure cannot revoke recovered access',(await stale.summary()).entitlement.state==='active'&&stale.state().account.grace_started_at===null);
  stage='recovery within a new grace period';
  await write(`/v1/subscriptions/${subscription.id}`,{default_payment_method:bad.id},'select-failing-method-again');
  await advance((await getSubscription()).items.data[0].current_period_end);
  await advance(frozen+7200);
  const nextFailure=await poll('next failed renewal',getInvoice,i=>i.id!==failed.id&&i.status==='open'&&i.attempted);
  await record('nextFailure',nextFailure);
  const nextFailureEvent=await eventFor('invoice.payment_failed',nextFailure.id);
  replay.setTime(nextFailureEvent.created*1000);await replay.deliverEvent(nextFailureEvent);
  const nextGrace=Date.parse(replay.state().account.grace_started_at);
  check('new failure starts its own bounded grace',(await replay.summary()).entitlement.state==='grace'&&nextGrace===nextFailureEvent.created*1000&&nextGrace>graceStart);
  await write(`/v1/subscriptions/${subscription.id}`,{default_payment_method:good},'select-good-method-again');
  await write(`/v1/invoices/${nextFailure.id}/pay`,{payment_method:good},'recover-within-grace');
  const earlyPaid=await poll('within-grace invoice paid',()=>read(`/v1/invoices/${nextFailure.id}`),i=>i.status==='paid');
  await record('withinGraceRecovery',earlyPaid);
  const earlyEvent=await eventFor('invoice.paid',nextFailure.id);await replay.deliverEvent(earlyEvent);
  check('payment within grace restores management',earlyEvent.created*1000<nextGrace+7*86400000&&(await replay.summary()).entitlement.state==='active'&&replay.state().account.grace_started_at===null);
  report.objects.events={initial:initialEvent.id,renewal:renewalEvent.id,failure:failureEvent.id,recovery:recoveryEvent.id,
    nextFailure:nextFailureEvent.id,withinGraceRecovery:earlyEvent.id};
  report.passed=true;
}catch(error){
  report.passed=false;report.failure={stage,code:error.code || 'ACCEPTANCE_FAILED'};
  // Assertion messages contain only fixed labels. Provider messages/payloads never logged.
  console.error(`FAIL ${stage}: ${report.failure.code}`);process.exitCode=1;
}finally{
  if(subscription){
    try{
      const current=await getSubscription();
      assert.equal(current.livemode,false);assert.equal(objectId(current.customer),customer.id);
      assert.equal(current.metadata.acceptance_run,run);
      if(current.status!=='canceled'){
        await stripe.request('DELETE',`/v1/subscriptions/${subscription.id}`,{invoice_now:false,prorate:false},`${run}:cleanup`);
      }
      report.cleanup=(await getSubscription()).status==='canceled';
      if(!report.cleanup){process.exitCode=1;}
    }catch{report.cleanup=false;process.exitCode=1;}
  }
  await writeFile('stripe-lifecycle-evidence.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
