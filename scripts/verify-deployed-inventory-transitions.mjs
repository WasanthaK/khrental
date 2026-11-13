// Deployed public HTTP and SQL acceptance. Seeded complimentary fixture only;
// no real payment, credential-login, UI or provider-write acceptance claim.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {BILLING_ACCOUNT,BILLING_PRICE,hash} from '/app/src/api/managementBilling/contract.js';
import {createAuthRecord,issueAuthSession,revokeAccessToken} from '/app/src/api/auth/index.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';
const id=process.env.INVENTORY_FIXTURE_ID,store=createBillingStore();
const foreign=randomUUID(),property=randomUUID(),foreignProperty=randomUUID(),actor=randomUUID(),auth=randomUUID();
const proof={checks:[],scope:'deployed HTTP and SQL; seeded complimentary fixture',providerWriteAcceptance:false,credentialLoginAcceptance:false,uiAcceptance:false};
let token,created=false,stage='preflight';
const check=name=>{proof.checks.push(name);console.log('INVENTORY_CHECK='+name);};
try{
  assert.match(id||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  for(const key of ['MANAGEMENT_BILLING_SCHEMA_READY','MANAGEMENT_INVENTORY_SCHEMA_READY','MANAGEMENT_CESSATION_SCHEMA_READY','MANAGEMENT_RESTORATION_SCHEMA_READY','MANAGEMENT_SPLIT_SCHEMA_READY','MANAGEMENT_RECOVERY_SCHEMA_READY','MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED']){assert.equal(process.env[key],'true',key);}
  assert.equal(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS,id);
  const protectedIds=['80a4b392-13f8-484d-81fa-a110a6ef75f0','2383f4fc-e107-4ac7-9e13-39db501f40ec'];
  assert.ok(!protectedIds.includes(id));
  assert.equal(String(process.env.MANAGEMENT_RECOVERY_TENANT_IDS).toLowerCase(),protectedIds[0]);
  const protectedHashes=await Promise.all(protectedIds.map(async key=>hash(await store.account(key))));
  stage='create_private_fixture';
  const email=`r5-stock-${id}@example.invalid`;
  await store.locked(id,async q=>{
    assert.equal((await q('SELECT id FROM dbo.tenants WHERE id=@id',{id})).length,0,'Never replay an existing fixture');
    for(const tenant of [id,foreign]){await q("INSERT dbo.tenants(id,name,slug,status,[plan]) VALUES(@tenant,'R5 isolated stock acceptance',@slug,'active','development-testing')",{tenant,slug:'r5-stock-'+tenant});}
    await q("INSERT dbo.app_users(id,tenant_id,name,email,role,user_type,auth_id,status) VALUES(@actor,@id,'R5 stock fixture administrator',@email,'admin','admin',@auth,'active')",{id,actor,email,auth});
    await q("INSERT dbo.tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@id,@actor,'admin','active',1)",{id,actor});
    for(const [p,tenant] of [[property,id],[foreignProperty,foreign]]){
      await q("INSERT dbo.properties(id,tenant_id,name,status,propertytype,country_code,createdat,updatedat) VALUES(@p,@tenant,'Unpublished synthetic stock','available','house','LK',SYSUTCDATETIME(),SYSUTCDATETIME())",{p,tenant});
      await q('UPDATE dbo.public_listing_preferences SET opted_out=1,opted_out_at=SYSUTCDATETIME() WHERE property_id=@p AND tenant_id=@tenant',{p,tenant});
      assert.equal((await q('SELECT property_id FROM dbo.public_listing_preferences WHERE property_id=@p AND tenant_id=@tenant AND opted_out=1',{p,tenant})).length,1);
    }
    await q("INSERT dbo.management_billing_accounts(tenant_id,stripe_account_id,stripe_price_id,market,inventory_json,comp_type,comp_expires_at) VALUES(@id,@account,@price,'LK','[]','fixed',DATEADD(day,1,SYSUTCDATETIME()))",{id,account:BILLING_ACCOUNT,price:BILLING_PRICE});
  });created=true;
  const record=await createAuthRecord({authId:auth,appUserId:actor,email,role:'admin',password:randomBytes(32).toString('base64url'),metadata:{acceptance_fixture:id}});
  token=(await issueAuthSession(record)).accessToken;
  const baseline=await store.account(id),foreignBefore=hash(await store.read('SELECT * FROM dbo.properties WHERE tenant_id=@id',{id:foreign}));
  const api=async(method,path,body,tenant=id)=>{
    const response=await fetch('https://app.quixo.homes/api/'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'x-tenant-id':tenant,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();return {status:response.status,data};
  };
  const call=async(path,body,status=200)=>{const r=await api('POST','management-billing/'+path,body);assert.equal(r.status,status,`${path}: ${r.data.code||r.data.error||r.status}`);return r.data.data;};
  const rows=async(table)=>store.read(`SELECT * FROM dbo.${table} WHERE tenant_id=@id`,{id});
  const inventoryCount=async()=> (await store.inventory(id)).length;
  const staged=p=>({kind:'property',payload:{id:p,name:'Private staged acceptance home',propertytype:'house',country_code:'LK',rentalvalues:{listingCategory:'residential'},availability:'inactive',description:'Synthetic acceptance record; never published.'}});
  stage='staging_and_atomic_import';
  const a=randomUUID(),b=randomUUID(),rollback=randomUUID(),records=[staged(a),staged(b)];
  await call('stock/prepare',{records,reason:'Prepare isolated acceptance batch.'});
  assert.equal((await rows('management_inventory_staging')).length,2);assert.equal(await inventoryCount(),1);check('batch_staging_does_not_activate_stock');
  const beforeReplay=hash(await rows('management_billing_audit'));
  await call('stock/prepare',{records,reason:'Replay identical acceptance batch.'});
  assert.equal(hash(await rows('management_billing_audit')),beforeReplay);check('identical_staging_replay_has_no_duplicate_audit');
  await call('stock/prepare',{records:[staged(rollback),staged(property)],reason:'Conflicting batch must roll back.'},409);
  assert.equal((await rows('management_inventory_staging')).length,2);check('conflicting_batch_rolls_back_all_rows');
  await call('stock/withdraw',{ids:[a,b],reason:'Withdraw unused acceptance additions.'});
  assert.ok((await rows('management_inventory_staging')).every(r=>r.status==='withdrawn'));check('withdrawal_preserves_private_history');
  await call('stock/prepare',{records:[staged(a)],reason:'Withdrawn identities cannot be replayed.'},409);check('withdrawn_identity_cannot_be_reactivated_by_replay');
  stage='workspace_isolation';
  assert.equal((await api('GET','management-billing/status',null,foreign)).status,403);check('foreign_workspace_header_denied');
  await call('stock/cessation-preview',{propertyId:foreignProperty,unitId:null},404);check('foreign_property_cessation_denied');
  await call('stock/restoration-preview',{propertyId:foreignProperty,unitId:null},409);check('foreign_property_restore_denied');
  stage='cessation_restoration_transitions';
  const preview=await call('stock/cessation-preview',{propertyId:property,unitId:null});assert.equal(preview.eligible,true);
  const cessation={requestId:randomUUID(),propertyId:property,unitId:null,inventoryHash:preview.inventoryHash,reason:'Cease synthetic home without provider obligation.'};
  await call('stock/cessation',cessation);assert.equal(await inventoryCount(),0);check('final_complimentary_stock_cessation_reaches_zero');
  const auditBefore=hash(await rows('management_billing_audit'));
  await call('stock/cessation',cessation);assert.equal(hash(await rows('management_billing_audit')),auditBefore);check('cessation_replay_is_idempotent');
  const restorePreview=await call('stock/restoration-preview',{propertyId:property,unitId:null});
  const restoration={requestId:randomUUID(),propertyId:property,unitId:null,inventoryHash:restorePreview.inventoryHash,reason:'Restore same retained synthetic home.'};
  await call('stock/restore',restoration);assert.equal(await inventoryCount(),1);check('restoration_retains_original_property_identity');
  const restoreAudit=hash(await rows('management_billing_audit'));
  await call('stock/restore',restoration);assert.equal(hash(await rows('management_billing_audit')),restoreAudit);check('restoration_replay_is_idempotent');
  const controls=await rows('management_inventory_controls');assert.equal(controls.length,1);assert.ok(controls[0].restored_at);check('cessation_episode_retained_after_restoration');
  stage='split_and_transition_guards';
  const units=[1,2].map(n=>({id:randomUUID(),propertyid:property,unitnumber:'Acceptance unit '+n,availability:'inactive'}));
  const splitPreview=await call('stock/split-preview',{propertyId:property,units});
  const split={requestId:randomUUID(),propertyId:property,units,inventoryHash:splitPreview.inventoryHash,reason:'Split synthetic home into two private units.'};
  await call('stock/split',split);assert.equal(await inventoryCount(),2);assert.equal((await rows('property_units')).length,2);check('split_atomically_activates_exact_two_units');
  const splitAudit=hash(await rows('management_billing_audit'));
  await call('stock/split',split);assert.equal(hash(await rows('management_billing_audit')),splitAudit);check('split_replay_has_no_duplicate_units_or_audit');
  await call('stock/split-preview',{propertyId:property,units:[1,2].map(n=>({id:randomUUID(),propertyid:property,unitnumber:'Nested '+n}))},409);check('nested_split_denied');
  const unitPreview=await call('stock/cessation-preview',{propertyId:property,unitId:units[0].id});
  await call('stock/cessation',{requestId:randomUUID(),propertyId:property,unitId:units[0].id,inventoryHash:unitPreview.inventoryHash,reason:'Cease only one split unit.'});
  assert.equal(await inventoryCount(),1);check('unit_cessation_preserves_sibling');
  const unitRestore=await call('stock/restoration-preview',{propertyId:property,unitId:units[0].id});
  await call('stock/restore',{requestId:randomUUID(),propertyId:property,unitId:units[0].id,inventoryHash:unitRestore.inventoryHash,reason:'Restore same split unit identity.'});
  assert.equal(await inventoryCount(),2);check('unit_restoration_preserves_split_identity');
  stage='stale_role_and_expired_authority';
  await store.locked(id,q=>q("UPDATE dbo.tenant_memberships SET role='staff' WHERE tenant_id=@id AND app_user_id=@actor",{id,actor}));
  await call('stock/prepare',{records:[staged(randomUUID())],reason:'Stale administrator session must fail.'},403);check('persisted_role_demotion_denies_stale_session');
  await store.locked(id,q=>q("UPDATE dbo.tenant_memberships SET role='admin' WHERE tenant_id=@id AND app_user_id=@actor; UPDATE dbo.management_billing_accounts SET comp_expires_at=DATEADD(second,-1,SYSUTCDATETIME()) WHERE tenant_id=@id",{id,actor}));
  const templatesBefore=hash(await rows('agreement_templates'));
  const expired=await api('POST','mssql/agreement-templates',{id:randomUUID(),name:'Expired fixture must not persist',content:'<p>Synthetic acceptance only.</p>'});
  assert.equal(expired.status,403);assert.equal(expired.data.code,'MANAGEMENT_READ_ONLY');
  assert.equal(hash(await rows('agreement_templates')),templatesBefore);check('seeded_expired_complimentary_write_denied_without_mutation');
  const after=await store.account(id);assert.equal(after.stripe_customer_id,null);assert.equal(after.stripe_subscription_id,null);assert.equal(after.quantity,baseline.quantity);assert.equal(after.paid_through,baseline.paid_through);
  assert.equal(hash(await store.read('SELECT * FROM dbo.properties WHERE tenant_id=@id',{id:foreign})),foreignBefore);
  assert.deepEqual(await Promise.all(protectedIds.map(async key=>hash(await store.account(key)))),protectedHashes);check('protected_and_foreign_records_unchanged');
  assert.equal((await rows('management_billing_commands')).filter(r=>r.status==='pending').length,0);
  assert.equal((await store.read('SELECT property_id FROM dbo.public_listing_preferences WHERE property_id=@property AND tenant_id=@id AND opted_out=1',{property,id})).length,1);check('fixture_remains_unpublished_with_no_pending_commands');
  proof.passed=true;
}catch(error){console.error('INVENTORY_FAILED='+JSON.stringify({stage,code:error.code||'UNCONFIRMED',message:error.message,checks:proof.checks}));process.exitCode=1;}
finally{
  try{
    if(token){await revokeAccessToken(token);}
    if(created){await store.locked(id,async q=>{
      await q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@id; UPDATE dbo.app_users SET status='inactive',active=0 WHERE id=@actor AND tenant_id=@id; UPDATE dbo.tenants SET status='inactive' WHERE id IN(@id,@foreign)",{id,actor,foreign});
    });}
    proof.fixtureClosed=true;if(proof.passed){console.log('INVENTORY_PASS='+JSON.stringify(proof));}
  }catch{console.error('INVENTORY_CLEANUP_FAILED');process.exitCode=1;}
  await closeMssqlPool();
}
