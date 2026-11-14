// Seeded synthetic hold, actual deployed HTTP withdrawal. Acceptance fields
// are schema-required synthetic fixture data, not participant consent. No real
// agreement, signature, payment, email or provider operation is performed.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {sql,getMssqlPool,closeMssqlPool} from '/app/src/api/mssql/pool.js';
import {createAuthRecord,revokeAccessToken} from '/app/src/api/auth/index.js';
const operation=process.env.RESERVATION_HTTP_OPERATION;
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const checks=[],actor=randomUUID(),authId=randomUUID(),property=randomUUID(),enquiry=randomUUID();
let pool,token,listing,baseline,created=false,passed=false,cleanup=true,stage='preflight';
const execute=async(connection,statement,args={})=>{const r=new sql.Request(connection);r.timeout=15000;for(const [k,v] of Object.entries(args)){r.input(k,v);}return (await r.query(statement)).recordset||[];};
const q=(statement,args={})=>execute(pool,statement,args);
const check=name=>{checks.push(name);console.log('RESERVATION_CHECK='+name);};
const protectedState=async()=>hash(await q('SELECT * FROM management_billing_accounts WHERE tenant_id IN (@a,@b) ORDER BY tenant_id',{a:'80a4b392-13f8-484d-81fa-a110a6ef75f0',b:'2383f4fc-e107-4ac7-9e13-39db501f40ec'}));
const snapshot=async()=>hash({offer:await q('SELECT * FROM property_rental_offers WHERE enquiry_id=@enquiry',{enquiry}),events:await q('SELECT * FROM property_rental_offer_events WHERE enquiry_id=@enquiry ORDER BY id',{enquiry})});
const http=async(path,{body,authorized=false,tenant=operation}={})=>{
 assert.ok(path.startsWith('/api/public-listings')||path==='/api/owner-enquiries/'+enquiry+'/offer');
 const r=await fetch('https://app.quixo.homes'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(authorized?{Authorization:'Bearer '+token,'x-tenant-id':tenant}:{}),...(body?{'Content-Type':'application/json',Origin:'https://app.quixo.homes'}:{})},...(body?{body:JSON.stringify(body)}:{})});
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
  await run("INSERT property_rental_offers(enquiry_id,tenant_id,property_id,application_version,status,version,currency,rent,deposit,fees,start_date,end_date,terms,offer_until,hold_until,accepted_at,consent_version) VALUES(@enquiry,@id,@property,1,'accepted',1,'LKR',100,0,0,CONVERT(date,SYSUTCDATETIME()),CONVERT(date,DATEADD(day,30,SYSUTCDATETIME())),'Seeded synthetic hold; no participant acceptance, tenancy or payment',DATEADD(hour,1,SYSUTCDATETIME()),DATEADD(hour,2,SYSUTCDATETIME()),SYSUTCDATETIME(),'rental-offer-v1')",{enquiry,id:operation,property});
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
 assert.equal(await protectedState(),baseline);check('protected_billing_unchanged');passed=true;
}catch(error){console.error('RESERVATION_FAILED='+JSON.stringify({stage,code:error.code||'ASSERTION',number:error.number||null,checks}));process.exitCode=1;}
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
  if(baseline){assert.equal(await protectedState(),baseline);}
 }catch{cleanup=false;}}
 console.log('RESERVATION_CLEANUP='+JSON.stringify({verified:cleanup,created,fixtureInactive:created&&cleanup,sessionRevoked:!!token&&cleanup}));
 if(!cleanup){console.error('RESERVATION_CLEANUP_FAILED');process.exitCode=1;}
 if(passed&&cleanup){console.log('RESERVATION_PASS='+JSON.stringify({passed:true,checks,fixtureInactive:true,sessionRevoked:true,protectedBillingUnchanged:true,providerWrites:0,seededHold:true,participantAcceptance:false,uiAccepted:false}));}
 await closeMssqlPool();
}
