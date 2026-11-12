// Public HTTP against a temporary server-owned scope; seeded billing dates are
// explicit test data, not claims of naturally elapsed Stripe grace.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {BILLING_ACCOUNT,BILLING_PRICE,hash} from '/app/src/api/managementBilling/contract.js';
import {createAuthRecord,issueAuthSession,revokeAccessToken} from '/app/src/api/auth/index.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const target=JSON.parse(process.env.HTTP_ACCEPTANCE_TARGET||'{}'),store=createBillingStore();
const proof={fixtureId:target.id,scope:'public invoice/payment and maintenance HTTP + deployed SQL; synthetic records and seeded billing states',checks:[]};
let stage='preflight',token,actorId,created=false;
const check=(name)=>{proof.checks.push(name);console.log('HTTP_CHECK='+name);};
const main=async()=>{
  assert.match(target.id||'',/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(process.env.MANAGEMENT_BILLING_SCHEMA_READY,'true');
  assert.equal(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED,'true');
  assert.equal(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS,target.id);
  const protectedId='80A4B392-13F8-484D-81FA-A110A6EF75F0';
  assert.notEqual(target.id.toLowerCase(),protectedId.toLowerCase());
  assert.deepEqual(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).split(',').map(x=>x.trim().toLowerCase()),[protectedId.toLowerCase()]);
  const controlHash=hash(await store.account(protectedId));
  const dedicatedId='2383f4fc-e107-4ac7-9e13-39db501f40ec',dedicatedHash=hash(await store.account(dedicatedId));
  await store.locked(target.id,async q=>{
    assert.equal((await q('SELECT id FROM dbo.tenants WHERE id=@id',{id:target.id})).length,0,'Existing fixture must be inspected, not rerun');
    await q("INSERT INTO dbo.tenants(id,name,slug,status,[plan]) VALUES(@id,'R5 financial maintenance acceptance',@slug,'active','development-testing')",{id:target.id,slug:`r5-http-${target.id}`});
    await q(`INSERT INTO dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,market,inventory_json,subscription_status,initial_payment_verified,grace_started_at)
      VALUES(@id,@account,@price,'LK','[]','past_due',1,DATEADD(DAY,-8,SYSUTCDATETIME()))`,{id:target.id,account:BILLING_ACCOUNT,price:BILLING_PRICE});
  });created=true;
  stage='persisted_fixture_session';
  actorId=randomUUID();const authId=randomUUID(),email=`r5-http-${target.id}@example.invalid`;
  await store.locked(target.id,async q=>{
    await q("INSERT INTO dbo.app_users(id,tenant_id,name,email,role,user_type,auth_id,status) VALUES(@actor,@id,'R5 HTTP fixture administrator',@email,'admin','admin',@auth,'active')",{actor:actorId,id:target.id,email,auth:authId});
    await q("INSERT INTO dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@id,@actor,'admin','active',1)",{id:target.id,actor:actorId});
  });
  const record=await createAuthRecord({authId,appUserId:actorId,email,role:'admin',password:randomBytes(32).toString('base64url'),metadata:{acceptance_fixture:target.id}});
  token=(await issueAuthSession(record)).accessToken;
  const api=async(method,path,body,tenant=target.id)=>{
    const response=await fetch('https://app.quixo.homes/api/'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{Authorization:`Bearer ${token}`,'x-tenant-id':tenant,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();return {status:response.status,data};
  };
  const propertyId=randomUUID(),renteeId=randomUUID(),agreementId=randomUUID(),maintenanceId=randomUUID();
  Object.assign(proof,{propertyId,renteeId,agreementId,maintenanceId});
  await store.locked(target.id,async q=>{
    const params={id:target.id,propertyId,renteeId,agreementId,maintenanceId,actor:actorId,email:`r5-fixture-rentee-${target.id}@example.invalid`};
    stage='fixture_properties';
    await q("INSERT INTO properties(id,tenant_id,name,status) VALUES(@propertyId,@id,'Synthetic R5 acceptance property','available')",params);
    stage='fixture_app_users';
    await q("INSERT INTO app_users(id,tenant_id,name,email,role,user_type) VALUES(@renteeId,@id,'Synthetic R5 acceptance renter',@email,'rentee','rentee')",params);
    stage='fixture_tenant_memberships';
    await q("INSERT INTO tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@id,@renteeId,'rentee','active',1)",params);
    stage='fixture_agreements';
    await q("INSERT INTO agreements(id,tenant_id,renteeid,propertyid,status,rentamount,startdate) VALUES(@agreementId,@id,@renteeId,@propertyId,'active',100,'2035-11-01')",params);
    stage='fixture_maintenance_requests';
    await q("INSERT INTO maintenance_requests(id,tenant_id,propertyid,title,description,status,assignedto) VALUES(@maintenanceId,@id,@propertyId,'Synthetic R5 acceptance request','Not a customer request','pending',@actor)",params);
  });
  const tables=['invoices','invoice_components','payments','payment_receipts','tenancy_billing_adjustments','maintenance_requests','maintenance_lifecycle_events','maintenance_request_comments','maintenance_request_images','notifications','billing_lifecycle_events'];
  const snapshot=async()=>{
    const rows={};for(const table of tables){rows[table]=await store.read(`SELECT * FROM dbo.${table} WHERE tenant_id=@id ORDER BY id`,{id:target.id});}return hash(rows);
  };
  const denied=async(name,method,path,body)=>{
    stage=name;const before=await snapshot(),response=await api(method,path,{...body,tenantId:protectedId,MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED:false});
    assert.equal(response.status,403,`${name}: HTTP ${response.status}`);assert.equal(response.data.code,'MANAGEMENT_READ_ONLY',name);assert.equal(await snapshot(),before,name);check(name);
  };
  const state=async(statement)=>store.locked(target.id,q=>q('UPDATE dbo.management_billing_accounts SET '+statement+' WHERE tenant_id=@id',{id:target.id}));
  stage='monthly_draft';
  await denied('expired_monthly_generation_denied','POST','billing/monthly-invoices',{billingPeriod:'2035-11'});
  await state("subscription_status='active',paid_through=DATEADD(DAY,1,SYSUTCDATETIME()),grace_started_at=NULL");
  let response=await api('POST','billing/monthly-invoices',{billingPeriod:'2035-11',notes:'Synthetic acceptance draft only'});
  assert.equal(response.status,200);assert.equal(response.data.data.created.length,1);check('seeded_paid_monthly_draft_allowed');
  const invoice=(await store.read("SELECT * FROM invoices WHERE tenant_id=@id AND billingperiod='2035-11'",{id:target.id}))[0];
  assert.equal(invoice.status,'draft');proof.invoiceId=invoice.id;
  const component=(await store.read('SELECT id FROM invoice_components WHERE tenant_id=@id AND invoice_id=@invoiceId ORDER BY id',{id:target.id,invoiceId:invoice.id}))[0];assert.ok(component);
  const path=`billing/invoices/${invoice.id}`;
  await state("paid_through=DATEADD(DAY,-1,SYSUTCDATETIME())");
  for(const [name,method,suffix,body] of [
    ['expired_draft_edit_denied','PATCH','/draft',{notes:'Must not persist'}],
    ['expired_component_add_denied','POST','/draft/components',{componentType:'other',description:'Denied fixture charge',amount:10}],
    ['expired_component_edit_denied','PATCH',`/draft/components/${component.id}`,{description:'Must not persist',amount:11}],
    ['expired_component_delete_denied','DELETE',`/draft/components/${component.id}`,{}]
  ]){await denied(name,method,path+suffix,body);}
  await denied('expired_adjustment_denied','POST',`billing/agreements/${agreementId}/billing-adjustments`,{billingPeriod:'2035-12',componentType:'other',description:'Denied fixture adjustment',amount:10});
  // Issued state is seeded solely to reach payment guards; do not dispatch an invoice.
  await store.locked(target.id,q=>q("UPDATE invoices SET status='pending' WHERE tenant_id=@id AND id=@invoiceId",{id:target.id,invoiceId:invoice.id}));
  for(const [name,suffix,body] of [
    ['expired_payment_verification_denied','verify-payment',{approved:true}],
    ['expired_manual_payment_denied','manual-payment',{amount:10,paymentMethod:'cash'}],
    ['expired_reminder_record_denied','reminder',{}]
  ]){await denied(name,'POST',path+'/'+suffix,body);}
  response=await api('GET',path+'/account');assert.equal(response.status,200);check('expired_invoice_history_read_allowed');
  const requestPath=`maintenance-lifecycle/requests/${maintenanceId}`;
  for(const [name,suffix,body,status] of [
    ['expired_maintenance_create_denied','maintenance-lifecycle/requests',{propertyId,title:'Denied fixture request',description:'Must not persist'},'pending'],
    ['expired_maintenance_assign_denied',requestPath+'/assign',{staffUserId:actorId},'pending'],
    ['expired_maintenance_start_denied',requestPath+'/start',{},'pending'],
    ['expired_maintenance_complete_denied',requestPath+'/complete',{completionCost:10},'in_progress'],
    ['expired_maintenance_cancel_denied',requestPath+'/cancel',{reason:'Fixture denial'},'pending'],
    ['expired_maintenance_comment_denied',requestPath+'/comments',{comment:'Must not persist'},'pending']
  ]){
    await store.locked(target.id,q=>q('UPDATE maintenance_requests SET status=@status WHERE tenant_id=@id AND id=@maintenanceId',{id:target.id,maintenanceId,status}));
    await denied(name,'POST',suffix,body);
  }
  response=await api('GET',requestPath);assert.equal(response.status,200);check('expired_maintenance_history_read_allowed');
  await store.locked(target.id,q=>q("UPDATE invoices SET status='draft' WHERE tenant_id=@id AND id=@invoiceId",{id:target.id,invoiceId:invoice.id}));
  for(const [label,change] of [
    ['current_grace',"subscription_status='past_due',grace_started_at=SYSUTCDATETIME()"],
    ['fixed_complimentary',"grace_started_at=DATEADD(DAY,-8,SYSUTCDATETIME()),comp_type='fixed',comp_expires_at=DATEADD(MINUTE,5,SYSUTCDATETIME())"],
    ['seeded_paid',"subscription_status='active',paid_through=DATEADD(DAY,1,SYSUTCDATETIME()),grace_started_at=NULL,comp_type=NULL,comp_expires_at=NULL"]
  ]){
    stage=label;await state(change);
    response=await api('PATCH',path+'/draft',{notes:label});assert.equal(response.status,200);
    assert.equal((await store.read('SELECT notes FROM invoices WHERE tenant_id=@id AND id=@invoiceId',{id:target.id,invoiceId:invoice.id}))[0].notes,label);
    response=await api('POST',requestPath+'/comments',{comment:label});assert.equal(response.status,201);check(label+'_invoice_edit_and_maintenance_comment_allowed');
  }
  assert.equal((await store.read('SELECT id FROM payments WHERE tenant_id=@id',{id:target.id})).length,0);
  assert.equal((await store.read('SELECT id FROM payment_receipts WHERE tenant_id=@id',{id:target.id})).length,0);
  assert.equal(hash(await store.account(protectedId)),controlHash);assert.equal(hash(await store.account(dedicatedId)),dedicatedHash);
  Object.assign(proof,{passed:true,protectedBillingFixturesUnchanged:true,stripeWrites:0,seededGraceDates:true,seededPaidState:true,naturalSevenDayGrace:false,syntheticRentalRecords:true,successfulPaymentAccepted:false,externalDispatchRoutesTested:false,
    credentialLoginAccepted:false,persistedSessionAuthority:true,fullRouteMatrixAccepted:false});
};
try{await main();}catch(error){console.error('HTTP_FAILED='+JSON.stringify({stage,code:error.code||'UNCONFIRMED',sqlNumber:error.number,sqlMessage:stage.startsWith('fixture_')?error.message:undefined,...proof}));process.exitCode=1;}
finally{
  try{
    if(token){await revokeAccessToken(token);}
    if(created){await store.locked(target.id,async q=>{
      await q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@id; UPDATE dbo.app_users SET status='inactive',active=0 WHERE tenant_id=@id; UPDATE dbo.agreements SET status='draft' WHERE tenant_id=@id",{id:target.id});
      await q("UPDATE dbo.tenants SET status='inactive' WHERE id=@id",{id:target.id});
    });}
    proof.fixtureClosed=true;
    if(proof.passed){console.log('HTTP_PASS='+JSON.stringify(proof));}
  }catch{console.error('HTTP_CLEANUP_FAILED='+JSON.stringify({fixtureId:target.id}));process.exitCode=1;}
  await closeMssqlPool();
}
