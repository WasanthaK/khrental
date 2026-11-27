import assert from 'node:assert/strict';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {BILLING_PRODUCT, hash, parsePricing} from '/app/src/api/managementBilling/contract.js';
import {createStripeClient, invoiceSubscription, objectId} from '/app/src/api/managementBilling/stripe.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const operation=process.env.LK_PRICE_OPERATION;
const store=createBillingStore(), stripe=createStripeClient();
const read=(resource,params)=>stripe.request('GET','/v1/'+resource,params);
const write=(method,resource,body,step)=>stripe.request(method,'/v1/'+resource,body,'r5-lk-catalogue:'+operation+':'+step);
const label='R5 synthetic published-price invoice '+operation;
const protectedIds=['80a4b392-13f8-484d-81fa-a110a6ef75f0','2383f4fc-e107-4ac7-9e13-39db501f40ec'];
const protectedSnapshot=()=>Promise.all(protectedIds.map(async id=>hash(await store.account(id))));
const effective=async()=>{
  const [record]=await store.read(`SELECT TOP 1 id,version,rules_json,stripe_price_id FROM dbo.management_pricing_versions
    WHERE market='LK' AND status='sandbox_published' AND TRY_CONVERT(DATETIMEOFFSET,JSON_VALUE(rules_json,'$.effectiveAt'))<=SYSUTCDATETIME()
    ORDER BY TRY_CONVERT(DATETIMEOFFSET,JSON_VALUE(rules_json,'$.effectiveAt')) DESC,version DESC`);
  assert.ok(record);
  const rules=parsePricing(JSON.parse(record.rules_json));
  assert.deepEqual([record.version,rules.billingCurrency,rules.baseFeeMinor,rules.includedRentMinor,rules.excessRateBasisPoints,rules.effectiveAt],
    [2,'LKR',150000,2500000,200,'2026-11-27T00:00:00.000Z']);
  return {price:record.stripe_price_id,version:record.id.toLowerCase(),effectiveAt:rules.effectiveAt};
};

let phase='preflight',clock,attemptedClock=false,subscription,baseline,binding,invoice;
try {
  assert.match(operation,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  await stripe.assertAccount();
  baseline=await protectedSnapshot();
  binding=await effective();
  const price=await read('prices/'+binding.price);
  assert.deepEqual([price.livemode,price.active,objectId(price.product),price.metadata?.pricing_version,price.metadata?.market,
    price.currency,price.unit_amount,price.recurring?.interval,price.recurring?.interval_count,price.recurring?.usage_type],
    [false,true,BILLING_PRODUCT,binding.version,'LK','lkr',150000,'month',1,'licensed']);
  phase='private_clock';
  attemptedClock=true;
  clock=await write('POST','test_helpers/test_clocks',{name:label,frozen_time:Math.floor(Date.now()/1000)},'clock');
  assert.equal(clock.name,label);
  phase='synthetic_customer';
  const customer=await write('POST','customers',{description:label,test_clock:clock.id,payment_method:'pm_card_visa',
    invoice_settings:{default_payment_method:'pm_card_visa'},metadata:{acceptance_fixture:operation}},'customer');
  assert.equal(objectId(customer.test_clock),clock.id);
  assert.equal(customer.metadata.acceptance_fixture,operation);
  phase='one_dwelling_invoice';
  subscription=await write('POST','subscriptions',{customer:customer.id,items:[{price:binding.price,quantity:1}],
    default_payment_method:objectId(customer.invoice_settings.default_payment_method),payment_behavior:'error_if_incomplete',
    automatic_tax:{enabled:false},metadata:{acceptance_fixture:operation}},'subscription');
  assert.deepEqual([subscription.status,subscription.livemode,objectId(subscription.test_clock),subscription.metadata.acceptance_fixture],['active',false,clock.id,operation]);
  invoice=await read('invoices/'+objectId(subscription.latest_invoice));
  assert.deepEqual([invoice.livemode,invoice.status,invoice.billing_reason,invoice.currency,invoice.total,invoice.amount_paid,invoiceSubscription(invoice),objectId(invoice.customer)],
    [false,'paid','subscription_create','lkr',150000,150000,subscription.id,customer.id]);
  assert.ok(invoice.status_transitions?.finalized_at);
  assert.equal(invoice.lines.has_more,false);
  assert.equal(invoice.lines.data.length,1);
  const [line]=invoice.lines.data;
  assert.deepEqual([objectId(line.pricing?.price_details?.price),line.quantity,line.amount],[binding.price,1,150000]);
  assert.deepEqual(await effective(),binding);
} catch(error) {
  console.error('LK_PRICE_FAILED='+JSON.stringify({operation,phase,code:error.code||'ASSERTION'}));
  process.exitCode=1;
} finally {
  try {
    if(attemptedClock){
      assert.ok(clock?.id,'Reconcile clock creation by the recorded operation before any new attempt.');
      assert.equal((await read('test_helpers/test_clocks/'+clock.id)).name,label);
      if(subscription?.id){
        const current=await read('subscriptions/'+subscription.id);
        assert.deepEqual([current.metadata.acceptance_fixture,objectId(current.test_clock)],[operation,clock.id]);
        if(current.status!=='canceled'){
          const canceled=await write('DELETE','subscriptions/'+current.id,{invoice_now:false,prorate:false},'cancel');
          assert.equal(canceled.status,'canceled');
        }
      }
      const removed=await write('DELETE','test_helpers/test_clocks/'+clock.id,{},'delete-clock');
      assert.ok(removed.deleted);
    }
    if(baseline){assert.deepEqual(await protectedSnapshot(),baseline);}
    if(!process.exitCode){
      console.log('LK_PRICE_PASS='+JSON.stringify({passed:true,operation,version:2,versionId:binding.version,effectiveAt:binding.effectiveAt,
        price:binding.price,invoice:invoice.id,paidMinor:invoice.amount_paid,currency:invoice.currency,quantity:1,
        subscriptionCanceled:true,clockDeleted:true,protectedUnchanged:true}));
    }
  } catch(error) {
    console.error('LK_PRICE_CLEANUP_FAILED='+JSON.stringify({operation,phase,code:error.code||'ASSERTION'}));process.exitCode=1;
  } finally {await closeMssqlPool();}
}
