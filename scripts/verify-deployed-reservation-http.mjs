// Seeded synthetic hold, actual deployed HTTP reservation transitions. Acceptance fields
// are schema-required synthetic fixture data, not participant consent. No real
// agreement, signature, payment, email or provider operation is performed.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {sql,getMssqlPool,closeMssqlPool} from '/app/src/api/mssql/pool.js';
import {createAuthRecord,revokeAccessToken} from '/app/src/api/auth/index.js';
const operation=process.env.RESERVATION_HTTP_OPERATION;
const scenario=process.env.RESERVATION_HTTP_SCENARIO||'withdrawal',expiry=scenario==='natural_expiry',cancel=scenario==='unsigned_cancellation';
const agreement=randomUUID();let draftBaseline,expiryTiming;
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const checks=[],actor=randomUUID(),authId=randomUUID(),property=randomUUID(),enquiry=randomUUID();
let pool,token,listing,baseline,created=false,passed=false,cleanup=true,stage='preflight';
const execute=async(connection,statement,args={})=>{const r=new sql.Request(connection);r.timeout=15000;for(const [k,v] of Object.entries(args)){r.input(k,v);}return (await r.query(statement)).recordset||[];};
const q=(statement,args={})=>execute(pool,statement,args);
const check=name=>{checks.push(name);console.log('RESERVATION_CHECK='+name);};
const protectedState=async()=>hash(await q('SELECT * FROM management_billing_accounts WHERE tenant_id IN (@a,@b) ORDER BY tenant_id',{a:'80a4b392-13f8-484d-81fa-a110a6ef75f0',b:'2383f4fc-e107-4ac7-9e13-39db501f40ec'}));
const snapshot=async()=>hash({offer:await q('SELECT * FROM property_rental_offers WHERE enquiry_id=@enquiry',{enquiry}),events:await q('SELECT * FROM property_rental_offer_events WHERE enquiry_id=@enquiry ORDER BY id',{enquiry})});
const http=async(path,{body,method=body?'POST':'GET',authorized=false,tenant=operation}={})=>{
 assert.ok(path.startsWith('/api/public-listings')||path==='/api/owner-enquiries/'+enquiry+'/offer'||path==='/api/mssql/agreements/'+agreement);
 const r=await fetch('https://app.quixo.homes'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(authorized?{Authorization:'Bearer '+token,'x-tenant-id':tenant}:{}),...(body?{'Content-Type':'application/json',Origin:'https://app.quixo.homes'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();return {status:r.status,data,cache:r.headers.get('cache-control')};
};
const publicState=async visible=>{
 const root='/api/public-listings/'+listing;
 const detail=await http(root+'?country=LK');assert.equal(detail.status,visible?200:404);assert.match(detail.cache||'',/no-store/);
 const availability=await http(root+'/enquiry-status?country=LK');assert.equal(availability.status,visible?200:404);assert.match(availability.cache||'',/no-store/);
 const catalog=await http('/api/public-listings?country=LK');assert.equal(catalog.status,200);assert.match(catalog.cache||'',/no-store/);assert.ok(Array.isArray(catalog.data.data));
 assert.equal(catalog.data.data.some(row=>String(row.id).toLowerCase()===listing.toLowerCase()),visible);
 if(visible){assert.equal(detail.data.data.title,'TEST ONLY — no rental available');assert.ok(!JSON.stringify(detail.data).includes('@example.invalid'));}
};
try{
 assert.ok(['withdrawal','natural_expiry','unsigned_cancellation'].includes(scenario));
 assert.match(operation||'',/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(process.env.PROPERTY_RENTAL_OFFERS_SCHEMA_READY,'true');
 assert.equal(process.env.PROPERTY_ENQUIRIES_ENABLED,'true');
 assert.notEqual(process.env.MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED,'true');
 assert.ok(!Object.hasOwn(process.env,'PUBLIC_LISTING_PILOT_PUBLIC_ID'),'Do not alter a pilot boundary');
 pool=await getMssqlPool();assert.equal((await q('SELECT id FROM tenants WHERE id=@id',{id:operation})).length,0);
 baseline=await protectedState();
 stage='private_fixture';
 const tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{
  const run=(statement,args={})=>execute(tx,statement,args),email='reservation-'+operation+'@example.invalid';
  await run("INSERT tenants(id,name,slug,status,[plan]) VALUES(@id,'TEST ONLY reservation HTTP acceptance',@slug,'active','development-testing')",{id:operation,slug:'r5-reservation-'+operation});
  await run("INSERT app_users(id,tenant_id,name,email,role,user_type,auth_id,status,active,invited,createdat,updatedat) VALUES(@actor,@id,'Synthetic reservation operator',@email,'admin','admin',@authId,'active',1,0,SYSUTCDATETIME(),SYSUTCDATETIME()); INSERT tenant_memberships(tenant_id,app_user_id,role,status,is_default) VALUES(@id,@actor,'admin','active',1)",{actor,id:operation,email,authId});
  await run("INSERT properties(id,tenant_id,name,status,propertytype,country_code,rentalvalues,createdat,updatedat) VALUES(@property,@id,'TEST ONLY — no rental available','available','house','LK',N'{\"listingCategory\":\"residential\",\"rent\":100}',SYSUTCDATETIME(),SYSUTCDATETIME()); UPDATE public_listing_preferences SET opted_out=1,public_headline='TEST ONLY — no rental available',location_label='Synthetic acceptance fixture',country_code='LK' WHERE property_id=@property AND tenant_id=@id",{property,id:operation});
  listing=String((await run('SELECT public_id FROM public_listing_preferences WHERE property_id=@property AND tenant_id=@id',{property,id:operation}))[0].public_id);
  await run("INSERT property_enquiries(id,listing_public_id,tenant_id,property_id,seeker_id,seeker_name,seeker_email,country_code,listing_title,message,consent_version,request_id,payload_hash) VALUES(@enquiry,@listing,@id,@property,@actor,'Synthetic fixture',@email,'LK','TEST ONLY — no rental available','Seeded fixture; no customer enquiry or consent','fixture-only',@request,@hash)",{enquiry,listing,id:operation,property,actor,email,request:randomUUID(),hash:'0'.repeat(64)});
  await run("INSERT property_rental_offers(enquiry_id,tenant_id,property_id,application_version,status,version,currency,rent,deposit,fees,start_date,end_date,terms,offer_until,hold_until,accepted_at,consent_version) VALUES(@enquiry,@id,@property,1,'accepted',1,'LKR',100,0,0,CONVERT(date,SYSUTCDATETIME()),CONVERT(date,DATEADD(day,30,SYSUTCDATETIME())),'Seeded synthetic hold; no participant acceptance, tenancy or payment',DATEADD(second,@offerSeconds,SYSUTCDATETIME()),DATEADD(second,@holdSeconds,SYSUTCDATETIME()),SYSUTCDATETIME(),'rental-offer-v1')",{enquiry,id:operation,property,offerSeconds:expiry?30:3600,holdSeconds:expiry?90:7200});
  if(expiry||cancel){
   await run("INSERT agreements(id,tenant_id,propertyid,renteeid,status,title) VALUES(@agreement,@id,@property,@actor,'draft','TEST ONLY unsigned reservation fixture'); UPDATE property_rental_offers SET status='agreement',agreement_id=@agreement WHERE enquiry_id=@enquiry",{agreement,id:operation,property,actor,enquiry});
  }
  if(cancel){
   await run("UPDATE a SET rentamount=o.rent,depositamount=o.deposit,startdate=o.start_date,enddate=o.end_date FROM agreements a JOIN property_rental_offers o ON o.agreement_id=a.id WHERE a.id=@agreement AND o.enquiry_id=@enquiry",{agreement,enquiry});
   await run("INSERT rental_offer_agreement_links(agreement_id,enquiry_id,accepted_version,application_version,unit_id,rent,deposit,start_date,end_date) SELECT @agreement,enquiry_id,1,application_version,unit_id,rent,deposit,start_date,end_date FROM property_rental_offers WHERE enquiry_id=@enquiry",{agreement,enquiry});
  }
  await tx.commit();created=true;
 }catch(error){await tx.rollback().catch(()=>{});throw error;}
 const email='reservation-'+operation+'@example.invalid';
 const record=await createAuthRecord({authId,appUserId:actor,email,role:'admin',password:randomBytes(32).toString('base64url'),metadata:{acceptance_fixture:operation}});
 token=randomBytes(32).toString('base64url');
 await q('INSERT auth_sessions(auth_user_id,token_hash,expires_at) VALUES(@id,@hash,DATEADD(MINUTE,5,SYSUTCDATETIME()))',{id:record.id,hash:hash(token)});
 // The hold is committed before opting in, so the fixture starts hidden.
 await q('UPDATE public_listing_preferences SET opted_out=0 WHERE property_id=@property AND tenant_id=@id',{property,id:operation});
 stage='held_public_state';await publicState(false);check('seeded_hold_hidden_from_catalog_detail_and_enquiry');
 const path='/api/owner-enquiries/'+enquiry+'/offer';
 if(expiry){
  stage='unsigned_baseline';
  draftBaseline=hash(await q('SELECT * FROM agreements WHERE id=@agreement AND tenant_id=@id',{agreement,id:operation}));
  const clock=(await q('SELECT SYSUTCDATETIME() AS now,hold_until,status,version FROM property_rental_offers WHERE enquiry_id=@enquiry',{enquiry}))[0];
  assert.equal(clock.status,'agreement');assert.equal(clock.version,1);assert.ok(clock.now<clock.hold_until);
  expiryTiming={initialSqlTime:clock.now.toISOString(),holdUntil:clock.hold_until.toISOString()};
  check('unsigned_draft_hold_is_current');
  stage='natural_deadline';
  const until=Date.now()+120000;
  let elapsed;
  while(Date.now()<until){
   elapsed=(await q('SELECT SYSUTCDATETIME() AS now,hold_until FROM property_rental_offers WHERE enquiry_id=@enquiry',{enquiry}))[0];
   assert.equal(elapsed.hold_until.toISOString(),expiryTiming.holdUntil,'Deadline must never be rewritten');
   if(elapsed.now>=elapsed.hold_until){break;}
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
  assert.ok(elapsed.now>=elapsed.hold_until,'SQL deadline did not elapse within the bounded wait');
  expiryTiming.expiredSqlTime=elapsed.now.toISOString();
  console.log('RESERVATION_TIMING='+JSON.stringify(expiryTiming));
  check('short_deadline_elapsed_by_sql_time_without_backdating');
  stage='expiry_public_release';await publicState(true);check('natural_expiry_restores_catalog_detail_and_enquiry');
  const unchanged=(await q('SELECT status,version FROM property_rental_offers WHERE enquiry_id=@enquiry',{enquiry}))[0];
  assert.equal(unchanged.status,'agreement');assert.equal(unchanged.version,1);check('public_release_does_not_require_lazy_audit');
  stage='lazy_expiry';
  const read=await http(path,{authorized:true});assert.equal(read.status,200);assert.equal(read.data.data.offer.status,'expired');assert.equal(read.data.data.offer.version,2);
  assert.equal(read.data.data.agreement.status,'draft');check('authorized_read_records_expiry');
  assert.equal(hash(await q('SELECT * FROM agreements WHERE id=@agreement AND tenant_id=@id',{agreement,id:operation})),draftBaseline);check('unsigned_draft_preserved_without_signing');
  const afterExpiry=await snapshot();
  const retry=await http(path,{authorized:true});assert.equal(retry.status,200);assert.equal(retry.data.data.offer.version,2);assert.equal(await snapshot(),afterExpiry);
  const events=await q('SELECT event_type,version,actor_id FROM property_rental_offer_events WHERE enquiry_id=@enquiry',{enquiry});
  assert.equal(events.length,1);assert.equal(events[0].event_type,'expired');assert.equal(events[0].version,2);assert.equal(events[0].actor_id,null);
  check('repeat_read_preserves_single_system_expiry_audit');
  const denied=await http(path,{authorized:true,body:{action:'withdraw',version:2,requestId:randomUUID()}});
  assert.equal(denied.status,409);assert.equal(denied.data.code,'RENTAL_OFFER_CHANGED');assert.equal(await snapshot(),afterExpiry);check('expired_hold_cannot_be_withdrawn_again');
 }else if(cancel){
  const agreementPath='/api/mssql/agreements/'+agreement;
  const draftRows=()=>q('SELECT * FROM agreements WHERE id=@agreement AND tenant_id=@id',{agreement,id:operation});
  const beforeDraft=await draftRows(),beforeOffer=await snapshot();
  draftBaseline=hash(beforeDraft);
  const unchanged=async()=>{assert.equal(hash(await draftRows()),draftBaseline);assert.equal(await snapshot(),beforeOffer);};
  const body={status:'cancelled',notes:'TEST ONLY unsigned draft cancellation'};
  stage='cancel_anonymous_denial';
  const anonymous=await http(agreementPath,{method:'PUT',body});assert.ok([401,403].includes(anonymous.status));await unchanged();check('anonymous_cancellation_denied_without_writes');
  stage='cancel_foreign_scope_denial';
  const foreign=await http(agreementPath,{method:'PUT',body,authorized:true,tenant:randomUUID()});assert.equal(foreign.status,403);await unchanged();check('foreign_workspace_cancellation_denied_without_writes');
  stage='cancel_unsigned_draft';
  const result=await http(agreementPath,{method:'PUT',body,authorized:true});assert.equal(result.status,200,'Cancellation HTTP status '+result.status+'; code '+String(result.data.code||'none'));assert.equal(result.data.data.status,'cancelled');
  const cancelledRows=await draftRows();
  const preserved=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['status','notes','updatedat'].includes(key.toLowerCase())));
  assert.deepEqual(preserved(cancelledRows[0]),preserved(beforeDraft[0]));
  draftBaseline=hash(cancelledRows);check('unsigned_cancellation_preserves_document_and_identity');
  stage='cancel_preserves_hold';await publicState(false);assert.equal(await snapshot(),beforeOffer);check('draft_cancellation_does_not_release_reservation');
  const read=await http(path,{authorized:true});assert.equal(read.status,200);assert.equal(read.data.data.agreement.status,'cancelled');assert.equal(read.data.data.offer.status,'agreement');assert.equal(read.data.data.canReplaceAgreement,true);assert.equal(await snapshot(),beforeOffer);check('cancelled_draft_and_replacement_option_read_back');
  stage='cancel_then_withdraw';
  const withdrawal={action:'withdraw',version:1,requestId:randomUUID()};
  const released=await http(path,{authorized:true,body:withdrawal});assert.equal(released.status,200);assert.equal(released.data.data.offer.status,'withdrawn');assert.equal(released.data.data.offer.version,2);assert.equal(released.data.data.canReplaceAgreement,false);check('explicit_withdrawal_releases_cancelled_draft_hold');
  await publicState(true);check('cancel_then_withdraw_restores_public_stock');
  const after=await snapshot();const retry=await http(path,{authorized:true,body:withdrawal});
  assert.equal(retry.status,200);assert.equal(await snapshot(),after);assert.equal(hash(await draftRows()),draftBaseline);
  const events=await q('SELECT event_type,version,actor_id FROM property_rental_offer_events WHERE enquiry_id=@enquiry',{enquiry});
  assert.equal(events.length,1);assert.equal(events[0].event_type,'withdraw');assert.equal(events[0].version,2);assert.equal(String(events[0].actor_id).toLowerCase(),actor);
  assert.equal((await q('SELECT agreement_id FROM rental_offer_agreement_links WHERE agreement_id=@agreement AND enquiry_id=@enquiry',{agreement,enquiry})).length,1);
  check('retry_preserves_cancelled_history_link_and_single_withdrawal_audit');
 }else{
 const before=await snapshot();
 stage='anonymous_denial';assert.equal((await http(path,{body:{action:'withdraw',version:1,requestId:randomUUID()}})).status,401);assert.equal(await snapshot(),before);check('anonymous_withdrawal_denied_without_writes');
 stage='foreign_scope_denial';assert.equal((await http(path,{authorized:true,tenant:randomUUID(),body:{action:'withdraw',version:1,requestId:randomUUID()}})).status,403);assert.equal(await snapshot(),before);check('foreign_workspace_withdrawal_denied_without_writes');
 stage='stale_denial';const stale=await http(path,{authorized:true,body:{action:'withdraw',version:0,requestId:randomUUID()}});assert.equal(stale.status,409);assert.equal(stale.data.code,'OFFER_CHANGED');assert.equal(await snapshot(),before);check('stale_withdrawal_denied_without_writes');
 stage='withdraw';const body={action:'withdraw',version:1,requestId:randomUUID()};
 const result=await http(path,{authorized:true,body});assert.equal(result.status,200);assert.equal(result.data.data.offer.status,'withdrawn');assert.equal(result.data.data.offer.version,2);check('authenticated_http_withdrawal_recorded');
 stage='released_public_state';await publicState(true);check('withdrawal_restores_catalog_detail_and_enquiry');
 const after=await snapshot();
 stage='retry';const retry=await http(path,{authorized:true,body});assert.equal(retry.status,200);assert.equal(retry.data.data.offer.version,2);assert.equal(retry.data.data.offer.status,'withdrawn');assert.equal(await snapshot(),after);check('exact_retry_preserves_withdrawn_state_and_audit');
 stage='terminal_denial';const terminal=await http(path,{authorized:true,body:{action:'withdraw',version:2,requestId:randomUUID()}});assert.equal(terminal.status,409);assert.equal(terminal.data.code,'RENTAL_OFFER_CHANGED');assert.equal(await snapshot(),after);check('new_terminal_withdrawal_denied_without_writes');
 const events=await q('SELECT event_type,actor_id,version FROM property_rental_offer_events WHERE enquiry_id=@enquiry',{enquiry});assert.equal(events.length,1);assert.equal(events[0].event_type,'withdraw');assert.equal(events[0].version,2);assert.equal(String(events[0].actor_id).toLowerCase(),actor);check('one_authorized_withdrawal_audit');
 }
 assert.equal(await protectedState(),baseline);check('protected_billing_unchanged');passed=true;
}catch(error){console.error('RESERVATION_FAILED='+JSON.stringify({stage,code:error.code||'ASSERTION',number:error.number||null,...(stage==='cancel_unsigned_draft'?{diagnostic:String(error.message||'').slice(0,250)}:{}),checks}));process.exitCode=1;}
finally{
 if(created){
  try{await q("UPDATE public_listing_preferences SET opted_out=1 WHERE tenant_id=@id; UPDATE properties SET status='inactive' WHERE tenant_id=@id; UPDATE property_rental_offers SET status='withdrawn' WHERE tenant_id=@id AND status IN('accepted','agreement','offered'); UPDATE property_enquiries SET status='closed' WHERE tenant_id=@id; UPDATE tenant_memberships SET status='inactive' WHERE tenant_id=@id; UPDATE app_users SET status='inactive',active=0 WHERE tenant_id=@id; UPDATE tenants SET status='inactive' WHERE id=@id",{id:operation});}catch{cleanup=false;}
 }
 if(token){try{await revokeAccessToken(token);}catch{cleanup=false;}}
 if(pool){try{
  if(created){
   assert.equal((await q("SELECT id FROM tenants WHERE id=@id AND status='active'",{id:operation})).length,0);
   assert.equal((await q("SELECT id FROM app_users WHERE tenant_id=@id AND (status='active' OR active=1)",{id:operation})).length,0);
   assert.equal((await q("SELECT id FROM tenant_memberships WHERE tenant_id=@id AND status='active'",{id:operation})).length,0);
   assert.equal((await q('SELECT public_id FROM public_listing_preferences WHERE tenant_id=@id AND opted_out=0',{id:operation})).length,0);
   assert.equal((await q("SELECT enquiry_id FROM property_rental_offers WHERE tenant_id=@id AND status IN('accepted','agreement','offered')",{id:operation})).length,0);
   await publicState(false);
  }
  if(token){assert.equal((await q('SELECT id FROM auth_sessions WHERE token_hash=@hash AND revoked_at IS NULL',{hash:hash(token)})).length,0);}
  if(draftBaseline){assert.equal(hash(await q('SELECT * FROM agreements WHERE id=@agreement AND tenant_id=@id',{agreement,id:operation})),draftBaseline);}
  if(baseline){assert.equal(await protectedState(),baseline);}
 }catch{cleanup=false;}}
 console.log('RESERVATION_CLEANUP='+JSON.stringify({verified:cleanup,created,fixtureInactive:created&&cleanup,sessionRevoked:!!token&&cleanup}));
 if(!cleanup){console.error('RESERVATION_CLEANUP_FAILED');process.exitCode=1;}
 if(passed&&cleanup){console.log('RESERVATION_PASS='+JSON.stringify({passed:true,scenario,checks,fixtureInactive:true,sessionRevoked:true,protectedBillingUnchanged:true,providerWrites:0,seededHold:true,participantAcceptance:false,uiAccepted:false}));}
 await closeMssqlPool();
}
