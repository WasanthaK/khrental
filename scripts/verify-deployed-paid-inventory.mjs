// Genuine sandbox provider acceptance. HTTP permissions are a separate scenario;
// service scenarios do not establish HTTP, and none establishes UI or login.
// HTTP stock mutations use temporary serving readiness and fixture-scoped enforcement;
// its workflow restores original flags. Other scenarios leave serving flags unchanged.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createAuthRecord,revokeAccessToken} from '/app/src/api/auth/index.js';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createBillingService} from '/app/src/api/managementBilling/service.js';
import {createStripeClient,objectId} from '/app/src/api/managementBilling/stripe.js';
import {BILLING_ACCOUNT,BILLING_PRICE,hash} from '/app/src/api/managementBilling/contract.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const tenantId=process.env.PAID_INVENTORY_OPERATION,actorId=randomUUID(),propertyId=randomUUID(),second=randomUUID();
const scenario=process.env.PAID_INVENTORY_SCENARIO||'transitions';
const httpTransitions=scenario==='http-transitions';
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
    for(const token of httpTokens){
      await revokeAccessToken(token);
      const digest=createHash('sha256').update(token).digest('hex');
      assert.equal((await store.read('SELECT id FROM dbo.auth_sessions WHERE token_hash=@digest AND revoked_at IS NULL',{digest})).length,0);
    }
    if(created){
      await store.locked(tenantId,async q=>{
        for(const id of httpActors){
          await q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@id",{tenantId,id});
          await q("UPDATE dbo.app_users SET status='inactive' WHERE id=@id AND tenant_id=@tenantId",{tenantId,id});
        }
        if(foreignTenant){await q("UPDATE dbo.tenants SET status='inactive' WHERE id=@foreignTenant",{foreignTenant});}
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
      for(const id of httpActors){assert.equal((await store.read("SELECT id FROM dbo.app_users WHERE id=@id AND status='inactive'",{id})).length,1);}
      if(foreignTenant){assert.equal((await store.read("SELECT id FROM dbo.tenants WHERE id=@foreignTenant AND status='inactive'",{foreignTenant})).length,1);}
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
  assert.ok(['transitions','promotion','http-permissions','http-promotion','http-transitions'].includes(scenario));
  for(const flag of ['MANAGEMENT_BILLING_SANDBOX_ENABLED','MANAGEMENT_BILLING_SCHEMA_READY','MANAGEMENT_RECOVERY_SCHEMA_READY']){assert.equal(process.env[flag],'true');}
  if(scenario==='http-promotion'||httpTransitions){
    for(const flag of ['MANAGEMENT_INVENTORY_SCHEMA_READY','MANAGEMENT_CESSATION_SCHEMA_READY','MANAGEMENT_RESTORATION_SCHEMA_READY','MANAGEMENT_SPLIT_SCHEMA_READY','MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED']){assert.equal(process.env[flag],'true',flag);}
    assert.equal(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS,tenantId);
  }else{assert.notEqual(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED,'true');}
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
  if(scenario==='http-permissions'){
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
  assert.deepEqual(await protectedState(),baseline);check('protected_accounts_subscriptions_and_clocks_unchanged');
  passed=true;
}catch(error){console.error('PAID_INVENTORY_FAILED='+JSON.stringify({stage,code:error.code||'UNCONFIRMED',sqlNumber:Number.isInteger(error.number)?error.number:null,sqlLine:Number.isInteger(error.lineNumber)?error.lineNumber:null,...proof}));process.exitCode=1;}
finally{await cleanupFixture();}


