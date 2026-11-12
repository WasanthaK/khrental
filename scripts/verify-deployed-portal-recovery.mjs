// Run only through the explicit, main-only acceptance workflow. No live charges.
import assert from 'node:assert/strict';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createBillingService} from '/app/src/api/managementBilling/service.js';
import {createStripeClient,objectId} from '/app/src/api/managementBilling/stripe.js';
import {BILLING_ACCOUNT,BILLING_PORTAL,hash} from '/app/src/api/managementBilling/contract.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const target=JSON.parse(process.env.RECOVERY_ACCEPTANCE_TARGET||'{}');
const store=createBillingStore(),stripe=createStripeClient();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let stage='preflight';
try{
  assert.match(target.id||'',/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(target.customer||'',/^cus_[a-zA-Z0-9]+$/);assert.match(target.subscription||'',/^sub_[a-zA-Z0-9]+$/);
  for(const flag of ['MANAGEMENT_BILLING_SANDBOX_ENABLED','MANAGEMENT_RECOVERY_SCHEMA_READY','MANAGEMENT_RECOVERY_WORKER_ENABLED']){assert.equal(process.env[flag],'true');}
  const accounts=await store.read('SELECT * FROM dbo.management_billing_accounts WHERE stripe_customer_id=@customer AND stripe_subscription_id=@subscription AND stripe_account_id=@account',{customer:target.customer,subscription:target.subscription,account:BILLING_ACCOUNT});
  assert.equal(accounts.length,1);const account=accounts[0],tenantId=account.tenant_id;
  assert.deepEqual(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).split(',').map(x=>x.trim().toLowerCase()),[tenantId.toLowerCase()]);
  const tenant=(await store.read('SELECT [plan],status FROM dbo.tenants WHERE id=@tenantId',{tenantId}))[0];
  assert.equal(tenant.plan,'development-testing');assert.equal(tenant.status,'active');
  const actors=await store.read("SELECT m.app_user_id FROM dbo.tenant_memberships m JOIN dbo.app_users u ON u.id=m.app_user_id WHERE m.tenant_id=@tenantId AND LOWER(m.role)='admin' AND LOWER(COALESCE(m.status,'active'))='active' AND LOWER(COALESCE(u.status,'active'))='active' ORDER BY m.app_user_id",{tenantId});
  assert.ok(actors.length);const actorId=actors[0].app_user_id;
  assert.equal((await store.read('SELECT id FROM dbo.management_billing_commands WHERE id=@id',{id:target.id})).length,0,'Existing operation: inspect it, never create a replacement');
  assert.equal((await store.read("SELECT id FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND status='pending'",{tenantId})).length,0);
  await stripe.assertAccount();
  const subscription=()=>stripe.request('GET','/v1/subscriptions/'+target.subscription);
  const financial=s=>({id:s.id,customer:objectId(s.customer),status:s.status,cancel:s.cancel_at_period_end,schedule:objectId(s.schedule),invoice:objectId(s.latest_invoice),items:s.items.data.map(i=>({id:i.id,price:objectId(i.price),quantity:i.quantity,start:i.current_period_start,end:i.current_period_end}))});
  const before=await subscription();assert.equal(before.livemode,false);assert.equal(objectId(before.customer),target.customer);
  const accountHash=hash(account),financialHash=hash(financial(before));
  let writes=0,sessionId=null;
  const interrupted={...stripe,request:async(method,path,body,key)=>{
    if(method==='GET'){return stripe.request(method,path,body,key);}
    assert.equal(method,'POST');assert.equal(path,'/v1/billing_portal/sessions');assert.equal(++writes,1);
    assert.equal(body.customer,target.customer);assert.equal(body.configuration,BILLING_PORTAL);assert.equal(key,`quixo:${tenantId}:${target.id}`);
    const result=await stripe.request(method,path,body,key);
    assert.equal(result.livemode,false);assert.equal(objectId(result.customer),target.customer);sessionId=result.id;
    console.log('PORTAL_RESPONSE_DISCARDED='+JSON.stringify({operationId:target.id,sessionId,controlledFault:true}));
    throw Object.assign(new Error('Controlled response loss after confirmed sandbox portal creation'),{status:503,code:'STRIPE_UNAVAILABLE'});
  }};
  stage='controlled_response_loss';
  const service=createBillingService({store,stripe:interrupted});
  await assert.rejects(service.portal({tenantId,actorId,id:target.id}),{code:'STRIPE_UNAVAILABLE'});
  assert.equal(writes,1);assert.ok(sessionId);
  const journal=async()=>(await store.read('SELECT c.status,r.state,r.attempts,r.last_error,c.result_json FROM dbo.management_billing_commands c JOIN dbo.management_billing_recovery r ON r.command_id=c.id WHERE c.id=@id AND c.tenant_id=@tenantId',{id:target.id,tenantId}))[0];
  const pending=await journal();assert.equal(pending.status,'pending');assert.equal(pending.state,'pending');assert.equal(pending.last_error,'STRIPE_UNAVAILABLE');
  stage='automatic_worker_recovery';let completed;
  // Do not rewrite SQL time, claims, leases, backoff or invoke manual recovery.
  for(let n=0;n<48;n++){
    await delay(5000);completed=await journal();
    if(completed.status==='completed'){break;}
    assert.notEqual(completed.state,'failed_needs_review');
  }
  assert.equal(completed.status,'completed');assert.equal(completed.state,'succeeded');assert.ok(completed.attempts>=2);
  const steps=await store.read('SELECT name,idempotency_key,result_json,completed_at FROM dbo.management_billing_steps WHERE command_id=@id',{id:target.id});
  assert.equal(steps.length,1);assert.equal(steps[0].name,'create_portal');assert.ok(steps[0].completed_at);
  const key=`quixo:${tenantId}:${target.id}`;assert.equal(steps[0].idempotency_key,key);
  const proof=JSON.parse(steps[0].result_json);assert.equal(proof.sessionId,sessionId);assert.ok(proof.eventId);
  const event=await stripe.request('GET','/v1/events/'+proof.eventId);
  assert.equal(event.type,'billing_portal.session.created');assert.equal(event.livemode,false);assert.equal(event.request.idempotency_key,key);assert.equal(event.data.object.id,sessionId);
  const events=new Set();let cursor,exhausted=false;
  for(let n=0;n<10;n++){
    const page=await stripe.request('GET','/v1/events',{type:event.type,created:{gte:event.created-60},limit:100,...(cursor?{starting_after:cursor}:{})});
    assert.ok(Array.isArray(page.data));assert.equal(typeof page.has_more,'boolean');
    for(const item of page.data){if(item.request?.idempotency_key===key){events.add(item.id);assert.equal(item.data.object.id,sessionId);}}
    if(!page.has_more){exhausted=true;break;}cursor=page.data.at(-1)?.id;assert.ok(cursor);
  }
  assert.ok(exhausted);assert.equal(events.size,1);
  const audit=await store.read("SELECT current_hash FROM dbo.management_billing_audit WHERE tenant_id=@tenantId AND resource_id=@id AND action='sandbox.portal.recovered'",{tenantId,id:target.id});
  assert.equal(audit.length,1);assert.equal(audit[0].current_hash,hash(JSON.parse(completed.result_json)));
  assert.equal(hash(await store.account(tenantId)),accountHash);assert.equal(hash(financial(await subscription())),financialHash);
  console.log('DEPLOYED_RECOVERY_PASS='+JSON.stringify({operationId:target.id,sessionId,eventId:event.id,kind:'portal',controlledResponseLoss:true,automaticWorker:true,attempts:completed.attempts,command:'completed',journal:'succeeded',steps:1,audits:1,matchingProviderEvents:1,originalKeyPreserved:true,subscriptionUnchanged:true,accountUnchanged:true,liveCharge:false}));
}catch(error){console.error('DEPLOYED_RECOVERY_FAILED='+JSON.stringify({stage,code:error.code||'UNCONFIRMED',operationId:target.id}));process.exitCode=1;}
finally{await closeMssqlPool();}
