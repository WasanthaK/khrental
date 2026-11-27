// R5 row 32: one disposable LK workspace, a genuine Stripe sandbox renewal,
// the deployed signed receiver and an isolated synthetic issuer market.
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createAuthRecord,issueAuthSession,revokeAccessToken} from '/app/src/api/auth/index.js';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {BILLING_ACCOUNT,hash,parsePricing} from '/app/src/api/managementBilling/contract.js';
import {createStripeClient,invoiceSubscription,objectId} from '/app/src/api/managementBilling/stripe.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const operation=process.env.R5_LK_ISSUER_OPERATION;
const issuerMarket=process.env.MANAGEMENT_LK_SANDBOX_ISSUER_MARKET;
const store=createBillingStore(),stripe=createStripeClient();
const actorId=randomUUID(),authId=randomUUID(),propertyId=randomUUID(),agreementId=randomUUID();
const initialIssuerId=randomUUID(),initialAssignmentId=randomUUID();
const laterIssuerId=randomUUID(),laterAssignmentId=randomUUID();
const label='R5 synthetic deployed issuer cutover '+operation;
const email=`r5-issuer-${operation}@example.invalid`;
const read=(resource,params)=>stripe.request('GET','/v1/'+resource,params);
const write=(method,resource,body,step)=>stripe.request(method,'/v1/'+resource,body,`r5-issuer:${operation}:${step}`);
const proof={operation,workspace:operation,issuerMarket,livemode:false,checks:[]};
const check=name=>{proof.checks.push(name);console.log('LK_ISSUER_CHECK='+name);};
const protectedIds=['80a4b392-13f8-484d-81fa-a110a6ef75f0','2383f4fc-e107-4ac7-9e13-39db501f40ec'];
const protectedSnapshot=()=>Promise.all(protectedIds.map(async id=>hash(await store.account(id))));
const lkCalendar=()=>store.read(`SELECT a.id,a.market,a.issuer_id,a.effective_at_utc,a.approval_reference,
  i.legal_name,i.country_code FROM dbo.management_market_issuer_assignments a
  JOIN dbo.management_invoice_issuers i ON i.id=a.issuer_id WHERE a.market='LK'
  ORDER BY a.effective_at_utc,a.id`);
let stage='preflight',clock,subscription,invoice,event,token,authRecord,fixtureCreated=false;
let providerAttempted=false,baseline,calendarBaseline,binding;

const effectivePrice=async()=>{
  const [record]=await store.read(`SELECT TOP 1 id,version,rules_json,stripe_price_id
    FROM dbo.management_pricing_versions WHERE market='LK' AND status='sandbox_published'
    AND TRY_CONVERT(DATETIMEOFFSET,JSON_VALUE(rules_json,'$.effectiveAt'))<=SYSUTCDATETIME()
    ORDER BY TRY_CONVERT(DATETIMEOFFSET,JSON_VALUE(rules_json,'$.effectiveAt')) DESC,version DESC`);
  assert.ok(record?.stripe_price_id);
  const rules=parsePricing(JSON.parse(record.rules_json));
  assert.deepEqual([record.version,rules.billingCurrency,rules.baseFeeMinor,rules.includedRentMinor,rules.excessRateBasisPoints],
    [2,'LKR',150000,2500000,200]);
  return {versionId:record.id.toLowerCase(),priceId:record.stripe_price_id};
};

const findInvoiceCreated=async(invoiceId,startedAt)=>{
  for(let poll=0;poll<10;poll++){
    let cursor;
    for(let page=0;page<5;page++){
      const events=await read('events',{type:'invoice.created',created:{gte:startedAt-10},limit:100,
        ...(cursor?{starting_after:cursor}:{})});
      const found=events.data.find(candidate=>candidate.data?.object?.id===invoiceId);
      if(found){assert.equal(found.livemode,false);return found;}
      if(!events.has_more){break;}cursor=events.data.at(-1)?.id;assert.ok(cursor);
    }
    await delay(2000);
  }
  assert.fail('No invoice.created event matched the isolated renewal invoice');
};

const api=async(role='admin')=>{
  await store.locked(operation,q=>q('UPDATE dbo.tenant_memberships SET role=@role WHERE tenant_id=@id AND app_user_id=@actor',
    {id:operation,actor:actorId,role}));
  const response=await fetch(`https://app.quixo.homes/api/management-billing/invoices/${invoice.id}/local-fee`,{
    redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'x-tenant-id':operation}});
  const body=await response.json();return {status:response.status,body};
};

const main=async()=>{
  assert.match(operation||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(process.env.MANAGEMENT_LK_SANDBOX_INVOICE_TENANT,operation);
  assert.equal(issuerMarket,'XZ');
  assert.equal(process.env.MANAGEMENT_BILLING_SCHEMA_READY,'true');
  await stripe.assertAccount();
  assert.equal((await store.read('SELECT id FROM dbo.tenants WHERE id=@id',{id:operation})).length,0,
    'Existing operation requires reconciliation; never create a replacement fixture');
  assert.equal((await store.read('SELECT id FROM dbo.management_market_issuer_assignments WHERE market=@market',{market:issuerMarket})).length,0,
    'The isolated issuer market must be empty before this operation');
  baseline=await protectedSnapshot();calendarBaseline=hash(await lkCalendar());binding=await effectivePrice();
  const price=await read('prices/'+binding.priceId);
  assert.deepEqual([price.livemode,price.active,price.currency,price.unit_amount],[false,true,'lkr',150000]);
  stage='genuine_provider_fixture';providerAttempted=true;
  const startedAt=Math.floor(Date.now()/1000);
  clock=await write('POST','test_helpers/test_clocks',{name:label,frozen_time:startedAt},'clock');
  const customer=await write('POST','customers',{description:label,test_clock:clock.id,payment_method:'pm_card_visa',
    invoice_settings:{default_payment_method:'pm_card_visa'},metadata:{acceptance_fixture:operation}},'customer');
  subscription=await write('POST','subscriptions',{customer:customer.id,items:[{price:binding.priceId,quantity:1}],
    default_payment_method:objectId(customer.invoice_settings.default_payment_method),payment_behavior:'error_if_incomplete',
    metadata:{acceptance_fixture:operation}},'subscription');
  assert.deepEqual([subscription.livemode,subscription.status,objectId(subscription.test_clock)],[false,'active',clock.id]);
  const [item]=subscription.items.data;
  const initial=await read('invoices/'+objectId(subscription.latest_invoice));
  assert.deepEqual([initial.billing_reason,initial.status,initial.currency,initial.amount_paid],['subscription_create','paid','lkr',150000]);
  stage='isolated_workspace_and_future_issuer';
  await store.locked(operation,async q=>{
    await q("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@id,@name,@slug,'active','development-testing')",
      {id:operation,name:label,slug:'r5-issuer-'+operation});
    await q("INSERT dbo.app_users(id,tenant_id,name,email,role,user_type,auth_id,status) VALUES(@actor,@id,@name,@email,'admin','admin',@auth,'active')",
      {actor:actorId,id:operation,name:label,email,auth:authId});
    await q("INSERT dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@id,@actor,'admin','active',1)",
      {id:operation,actor:actorId});
    await q("INSERT dbo.properties(id,tenant_id,name,status,propertytype,country_code) VALUES(@property,@id,@name,'rented','house','LK')",
      {property:propertyId,id:operation,name:'R5 synthetic LKR 100000 dwelling'});
    await q("INSERT dbo.agreements(id,tenant_id,propertyid,status,rentamount) VALUES(@agreement,@id,@property,'active',100000)",
      {agreement:agreementId,id:operation,property:propertyId});
    await q("INSERT dbo.management_invoice_issuers(id,legal_name,country_code) VALUES(@issuer,'R5 Synthetic Initial Issuer','US')",
      {issuer:initialIssuerId});
    const [future]=await q('SELECT DATEADD(HOUR,6,SYSUTCDATETIME()) AS effectiveAt');
    await q(`INSERT dbo.management_market_issuer_assignments(id,market,issuer_id,effective_at_utc,approval_reference)
      VALUES(@assignment,@market,@issuer,@effective,'R5 row 32 isolated synthetic schedule')`,
    {assignment:initialAssignmentId,market:issuerMarket,issuer:initialIssuerId,effective:future.effectiveAt});
    await q(`INSERT dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_customer_id,stripe_subscription_id,
      stripe_item_id,stripe_price_id,pricing_version_id,market,inventory_json,subscription_status,initial_payment_verified,quantity)
      VALUES(@id,@account,@customer,@subscription,@item,@price,@version,'LK','[]','active',1,1)`,
    {id:operation,account:BILLING_ACCOUNT,customer:customer.id,subscription:subscription.id,item:item.id,
      price:binding.priceId,version:binding.versionId});
  });fixtureCreated=true;
  authRecord=await createAuthRecord({authId,appUserId:actorId,email,role:'admin',password:randomBytes(32).toString('base64url'),
    metadata:{acceptance_fixture:operation}});
  token=(await issueAuthSession(authRecord)).accessToken;
  check('isolated_future_issuer_schedule_and_one_workspace_scope');
  stage='genuine_recurring_invoice';
  await write('POST','test_helpers/test_clocks/'+clock.id+'/advance',{frozen_time:item.current_period_end},'advance');
  for(let n=0;n<90;n++){
    const current=await read('test_helpers/test_clocks/'+clock.id);
    if(current.status==='ready'&&current.frozen_time===item.current_period_end){break;}
    assert.equal(current.status,'advancing');await delay(1000);
  }
  const invoices=await read('invoices',{customer:customer.id,subscription:subscription.id,limit:10});
  const renewals=invoices.data.filter(value=>value.billing_reason==='subscription_cycle');assert.equal(renewals.length,1);
  [invoice]=renewals;assert.deepEqual([invoice.livemode,invoice.currency,invoice.status,invoiceSubscription(invoice)],
    [false,'lkr','draft',subscription.id]);
  event=await findInvoiceCreated(invoice.id,startedAt);
  stage='signed_deployed_delivery';
  const payload=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000);
  const signature=createHmac('sha256',process.env.STRIPE_SANDBOX_WEBHOOK_SECRET).update(timestamp+'.'+payload).digest('hex');
  const delivered=await fetch('https://app.quixo.homes/api/management-billing/webhook',{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:payload});
  const delivery=await delivered.json();assert.equal(delivered.status,200,delivery.code||'signed receiver status');
  assert.equal(delivery.data?.received,true);check('genuine_invoice_event_signed_to_deployed_receiver');
  invoice=await read('invoices/'+invoice.id);
  const localLines=invoice.lines.data.filter(line=>line.metadata?.quixo_fee==='lk_recurring_fee_v1');
  assert.equal(localLines.length,1);assert.equal(localLines[0].amount,150000);
  invoice=await write('POST','invoices/'+invoice.id+'/finalize',{auto_advance:false},'finalize');
  assert.deepEqual([invoice.status,invoice.total,invoice.currency],['open',300000,'lkr']);
  stage='later_issuer_and_historical_readback';
  const laterEffective=new Date((invoice.created+1)*1000);
  await store.locked(operation,async q=>{
    await q("INSERT dbo.management_invoice_issuers(id,legal_name,country_code) VALUES(@issuer,'R5 Synthetic Later Issuer','LK')",
      {issuer:laterIssuerId});
    await q(`INSERT dbo.management_market_issuer_assignments(id,market,issuer_id,effective_at_utc,approval_reference)
      VALUES(@assignment,@market,@issuer,@effective,'R5 row 32 isolated later synthetic assignment')`,
    {assignment:laterAssignmentId,market:issuerMarket,issuer:laterIssuerId,effective:laterEffective});
    const [later]=await q('SELECT legal_name FROM dbo.management_invoice_issuer_at(@market,DATEADD(SECOND,1,@effective))',
      {market:issuerMarket,effective:laterEffective});
    assert.equal(later.legal_name,'R5 Synthetic Later Issuer');
  });
  const historical=await api('admin');assert.equal(historical.status,200,JSON.stringify(historical.body));
  assert.deepEqual([historical.body.data.invoiceId,historical.body.data.monthlyFeeMinor,
    historical.body.data.issuer.legalName,historical.body.data.issuer.country],
  [invoice.id,300000,'R5 Synthetic Initial Issuer','US']);
  const denied=await api('viewer');assert.equal(denied.status,403);check('authenticated_historical_receipt_retains_initial_issuer_after_later_assignment');
  assert.equal(hash(await lkCalendar()),calendarBaseline);assert.deepEqual(await protectedSnapshot(),baseline);
  Object.assign(proof,{passed:true,invoice:invoice.id,totalMinor:invoice.total,currency:invoice.currency,
    initialIssuer:'R5 Synthetic Initial Issuer (US)',laterIssuer:'R5 Synthetic Later Issuer (LK)',
    signedDelivery:true,authenticatedReadback:true,viewerDenied:true,sharedLkCalendarUnchanged:true,
    protectedBillingUnchanged:true,liveChargingEnabled:false});
};

try{await main();}
catch(error){console.error('LK_ISSUER_FAILED='+JSON.stringify({operation,stage,code:error.code||'ASSERTION'}));process.exitCode=1;}
finally{
  let providerClean=false,sqlClean=false,sessionRevoked=false;
  try{
    if(token){await revokeAccessToken(token);sessionRevoked=true;}
    if(providerAttempted){
      assert.ok(clock?.id,'Reconcile the recorded clock before any new operation');
      assert.equal((await read('test_helpers/test_clocks/'+clock.id)).name,label);
      if(subscription?.id){const current=await read('subscriptions/'+subscription.id);if(current.status!=='canceled'){
        const canceled=await write('DELETE','subscriptions/'+subscription.id,{invoice_now:false,prorate:false},'cancel');assert.equal(canceled.status,'canceled');}}
      const removed=await write('DELETE','test_helpers/test_clocks/'+clock.id,{},'delete-clock');assert.equal(removed.deleted,true);providerClean=true;
    }
    if(fixtureCreated){await store.locked(operation,async q=>{
      await q('DELETE dbo.management_billing_events WHERE tenant_id=@id',{id:operation});
      await q('DELETE dbo.management_billing_audit WHERE tenant_id=@id OR actor_id=@actor',{id:operation,actor:actorId});
      await q('DELETE dbo.management_billing_accounts WHERE tenant_id=@id',{id:operation});
      await q('DELETE dbo.agreements WHERE id=@agreement AND tenant_id=@id',{agreement:agreementId,id:operation});
      await q('DELETE dbo.properties WHERE id=@property AND tenant_id=@id',{property:propertyId,id:operation});
      await q(`DELETE s FROM dbo.auth_sessions s JOIN dbo.auth_users u ON u.id=s.auth_user_id
        WHERE u.app_user_id=@actor`,{actor:actorId});
      await q('DELETE dbo.auth_users WHERE app_user_id=@actor',{actor:actorId});
      await q('DELETE dbo.tenant_memberships WHERE tenant_id=@id AND app_user_id=@actor',{id:operation,actor:actorId});
      await q('DELETE dbo.app_users WHERE id=@actor AND tenant_id=@id',{actor:actorId,id:operation});
      await q('DELETE dbo.tenants WHERE id=@id',{id:operation});
      await q('DELETE dbo.management_market_issuer_assignments WHERE market=@market',{market:issuerMarket});
      await q('DELETE dbo.management_invoice_issuers WHERE id IN (@initial,@later)',{initial:initialIssuerId,later:laterIssuerId});
    });
      const residue=await store.read(`SELECT id FROM dbo.tenants WHERE id=@id
        UNION ALL SELECT id FROM dbo.management_market_issuer_assignments WHERE market=@market`,{id:operation,market:issuerMarket});
      assert.equal(residue.length,0);sqlClean=true;
    }
    if(baseline){assert.deepEqual(await protectedSnapshot(),baseline);assert.equal(hash(await lkCalendar()),calendarBaseline);}
    console.log('LK_ISSUER_CLEANUP='+JSON.stringify({operation,providerClean,sqlClean,sessionRevoked,sharedLkCalendarUnchanged:true}));
    assert.ok(providerClean&&sqlClean&&sessionRevoked);
    if(proof.passed){console.log('LK_ISSUER_PASS='+JSON.stringify({...proof,providerClean,sqlClean,sessionRevoked}));}
  }catch(error){console.error('LK_ISSUER_CLEANUP_FAILED='+JSON.stringify({operation,stage,code:error.code||'ASSERTION'}));process.exitCode=1;}
  await closeMssqlPool();
}
