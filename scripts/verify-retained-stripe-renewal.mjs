import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {BILLING_ACCOUNT,BILLING_PRICE} from '../src/api/managementBilling/contract.js';
import {createStripeClient,objectId,invoiceSubscription} from '../src/api/managementBilling/stripe.js';

export const targetFromEnv=(env=process.env)=>{
  const target={};
  for(const [name,prefix] of [['customer','cus_'],['subscription','sub_'],['clock','clock_'],['schedule','sub_sched_']]){
    const value=env[`RETAINED_${name.toUpperCase()}`];
    assert.ok(typeof value==='string'&&new RegExp(`^${prefix}[a-zA-Z0-9]+$`).test(value),`exact retained ${name} required`);target[name]=value;
  }
  return target;
};
export const assertRetainedTerms=(target,subscription,schedule,clock)=>{
  assert.equal(subscription.id,target.subscription);assert.equal(subscription.livemode,false);
  assert.equal(objectId(subscription.customer),target.customer);assert.equal(objectId(subscription.test_clock),target.clock);
  assert.equal(objectId(subscription.schedule),target.schedule);assert.equal(subscription.status,'active');
  assert.ok(!subscription.cancel_at_period_end&&!subscription.trial_end&&!subscription.trial_start);
  assert.equal(subscription.items.data.length,1);
  const item=subscription.items.data[0];assert.equal(objectId(item.price),BILLING_PRICE);assert.equal(item.quantity,2);
  assert.equal(schedule.id,target.schedule);assert.equal(schedule.livemode,false);assert.equal(schedule.status,'active');
  assert.equal(objectId(schedule.customer),target.customer);assert.equal(objectId(schedule.subscription),target.subscription);
  assert.equal(schedule.end_behavior,'release');assert.equal(schedule.phases.length,2);
  const [current,next]=schedule.phases;
  for(const [phase,quantity] of [[current,2],[next,1]]){
    assert.equal(phase.items.length,1);assert.equal(objectId(phase.items[0].price),BILLING_PRICE);assert.equal(phase.items[0].quantity,quantity);
    assert.equal(phase.proration_behavior,'none');
  }
  assert.equal(current.end_date,item.current_period_end);assert.equal(next.start_date,current.end_date);
  assert.equal(clock.id,target.clock);assert.equal(clock.livemode,false);assert.equal(clock.status,'ready');
  assert.ok(Number.isSafeInteger(clock.frozen_time)&&clock.frozen_time<next.start_date);
  return {renewalAt:next.start_date,paidThrough:next.end_date,itemId:item.id};
};
// This generated module executes inside the existing app and issues SELECT only.
// Parameters are validated IDs; it never exports connection details or customer PII.
export const receiverSource=(target,evidence=null)=>`
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {getMssqlPool,closeMssqlPool,sql} from 'file:///app/src/api/mssql/pool.js';
const target=${JSON.stringify(target)}, evidence=${JSON.stringify(evidence)};
try {
  assert.equal(process.env.MANAGEMENT_BILLING_SANDBOX_ENABLED,'true');
  assert.equal(process.env.MANAGEMENT_BILLING_SCHEMA_READY,'true');
  const pool=await getMssqlPool();
  let accepted=false;
  for(let attempt=0;attempt<(evidence?60:1);attempt++){
    const q=pool.request().input('customer',sql.VarChar(100),target.customer).input('subscription',sql.VarChar(100),target.subscription)
      .input('account',sql.VarChar(100),'${BILLING_ACCOUNT}').input('event',sql.VarChar(100),evidence?.eventId||'');
    const rows=(await q.query(\`SELECT a.subscription_status,a.quantity,a.initial_payment_verified,a.paid_through,a.grace_started_at,
      (SELECT COUNT(*) FROM dbo.management_billing_events e WHERE e.tenant_id=a.tenant_id AND e.stripe_event_id=@event AND e.event_type='invoice.paid') AS event_count,
      (SELECT COUNT(*) FROM dbo.management_billing_audit u WHERE u.tenant_id=a.tenant_id AND u.resource_id=@event AND u.action='stripe.event_reconciled') AS audit_count
      FROM dbo.management_billing_accounts a WHERE a.stripe_customer_id=@customer AND a.stripe_subscription_id=@subscription AND a.stripe_account_id=@account\`)).recordset;
    assert.equal(rows.length,1,'exact deployed organization binding required');
    const row=rows[0];
    accepted=evidence?row.quantity===1&&row.subscription_status==='active'&&row.initial_payment_verified&&row.grace_started_at===null&&
      new Date(row.paid_through).getTime()===evidence.paidThrough*1000&&row.event_count===1&&row.audit_count===1:
      row.quantity===2&&row.subscription_status==='active'&&Boolean(row.initial_payment_verified);
    if(accepted){console.log('RETAINED_RECEIVER='+JSON.stringify({bound:true,quantity:row.quantity,status:row.subscription_status,eventCount:row.event_count,auditCount:row.audit_count}));break;}
    await delay(2000);
  }
  assert.ok(accepted,'deployed receiver state did not match acceptance');
}catch{console.error('RETAINED_RECEIVER_FAILED');process.exitCode=1;}finally{await closeMssqlPool();}
`;
const main=async()=>{
  const target=targetFromEnv(),mode=process.argv[2];
  if(mode==='receiver-preflight'||mode==='receiver-verify'){
    const evidence=mode==='receiver-verify'?JSON.parse(await readFile('retained-renewal-evidence.json','utf8')):null;
    console.log(deflateRawSync(receiverSource({customer:target.customer,subscription:target.subscription},evidence&&{eventId:evidence.eventId,paidThrough:evidence.paidThrough})).toString('base64url'));return;
  }
  assert.ok(['advance','duplicate'].includes(mode),'known acceptance mode required');
  const stripe=createStripeClient({env:{...process.env,MANAGEMENT_BILLING_SANDBOX_ENABLED:'true',STRIPE_SANDBOX_ACCOUNT_ID:BILLING_ACCOUNT}});
  await stripe.assertAccount();
  if(mode==='duplicate'){
    const evidence=JSON.parse(await readFile('retained-renewal-evidence.json','utf8'));
    assert.equal(evidence.subscriptionId,target.subscription);
    const event=await stripe.request('GET',`/v1/events/${evidence.eventId}`);
    assert.equal(event.type,'invoice.paid');assert.equal(event.livemode,false);assert.equal(invoiceSubscription(event.data.object),target.subscription);
    const secret=process.env.STRIPE_SANDBOX_WEBHOOK_SECRET;assert.ok(secret?.startsWith('whsec_'));
    const body=JSON.stringify(event);
    for(let index=0;index<2;index++){
      const timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
      const response=await fetch('https://app.quixo.homes/api/management-billing/webhook',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
        headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body});
      assert.equal(response.status,200);assert.equal((await response.json()).data?.duplicate,true);
    }
    evidence.duplicateHttp=true;await writeFile('retained-renewal-evidence.json',JSON.stringify(evidence,null,2)+'\n');
    console.log('RETAINED_DUPLICATE_HTTP=PASS');return;
  }
  assert.equal(process.env.RETAINED_RENEWAL_CONFIRM,'ADVANCE-RETAINED-SANDBOX');
  assert.match(await readFile('retained-preflight.txt','utf8'),/RETAINED_RECEIVER=\{"bound":true,"quantity":2/);
  const read=(path,body)=>stripe.request('GET',path,body);
  const subscription=await read(`/v1/subscriptions/${target.subscription}`),schedule=await read(`/v1/subscription_schedules/${target.schedule}`),clock=await read(`/v1/test_helpers/test_clocks/${target.clock}`);
  const terms=assertRetainedTerms(target,subscription,schedule,clock),originalInvoice=objectId(subscription.latest_invoice);
  const poll=async(action,predicate)=>{
    for(let attempt=0;attempt<120;attempt++){const value=await action();if(predicate(value)){return value;}await delay(1000);}
    throw new Error('Provider acceptance timed out');
  };
  for(const time of [terms.renewalAt,terms.renewalAt+7200]){
    await stripe.request('POST',`/v1/test_helpers/test_clocks/${target.clock}/advance`,{frozen_time:time},`retained:${target.clock}:${time}`);
    await poll(()=>read(`/v1/test_helpers/test_clocks/${target.clock}`),c=>c.status==='ready'&&c.frozen_time===time);
  }
  const renewed=await read(`/v1/subscriptions/${target.subscription}`);
  assert.equal(renewed.livemode,false);assert.equal(renewed.status,'active');assert.equal(renewed.items.data.length,1);assert.equal(renewed.items.data[0].quantity,1);
  assert.notEqual(objectId(renewed.latest_invoice),originalInvoice);
  const invoice=await poll(()=>read(`/v1/invoices/${objectId(renewed.latest_invoice)}`),i=>i.status==='paid');
  assert.equal(invoice.livemode,false);assert.equal(objectId(invoice.customer),target.customer);assert.equal(invoiceSubscription(invoice),target.subscription);
  assert.equal(invoice.billing_reason,'subscription_cycle');assert.equal(invoice.amount_remaining,0);assert.equal(invoice.amount_paid,invoice.amount_due);
  assert.equal(invoice.currency,'usd');assert.equal(invoice.lines.has_more,false,'review paginated invoice lines separately');
  const recurring=invoice.lines.data.filter(l=>objectId(l.parent?.subscription_item_details?.subscription_item||l.subscription_item)===terms.itemId&&!(l.parent?.subscription_item_details?.proration??l.proration));
  assert.equal(recurring.length,1);assert.equal(recurring[0].quantity,1);assert.equal(recurring[0].amount,500);assert.equal(recurring[0].period.end,terms.paidThrough);
  // Retained pending proration is legitimate: verify the actual total, never assume USD 5.
  assert.equal(invoice.lines.data.reduce((sum,l)=>sum+l.amount,0),invoice.subtotal);
  const list=await poll(()=>read('/v1/events',{type:'invoice.paid',limit:100}),p=>p.data.some(e=>e.data.object.id===invoice.id));
  const event=list.data.find(e=>e.data.object.id===invoice.id);assert.equal(event.livemode,false);
  const evidence={source:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,subscriptionId:target.subscription,invoiceId:invoice.id,eventId:event.id,
    paidThrough:terms.paidThrough,quantity:1,invoicePaid:true,amountDue:invoice.amount_due,amountPaid:invoice.amount_paid,
    recurringAmount:recurring[0].amount,prorationAmount:invoice.lines.data.filter(l=>l.parent?.subscription_item_details?.proration??l.proration).reduce((sum,l)=>sum+l.amount,0),
    providerRenewal:true,duplicateHttp:false};
  await writeFile('retained-renewal-evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log('RETAINED_PROVIDER_RENEWAL=PASS');
};
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){main().catch(error=>{console.error(`RETAINED_ACCEPTANCE_FAILED ${error.code||'UNCONFIRMED'}`);process.exitCode=1;});}
