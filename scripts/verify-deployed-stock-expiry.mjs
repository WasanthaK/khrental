// Deployed SQL acceptance only. Every fixture write is rolled back.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {sql,getMssqlPool,closeMssqlPool} from '/app/src/api/mssql/pool.js';
import {expireRentalOffers} from '/app/src/api/enquiries/offerStore.js';
import {PUBLIC_LISTING_ELIGIBILITY_SQL} from '/app/src/api/publicListings/store.js';
const id=process.env.STOCK_EXPIRY_OPERATION,checks=[];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const check=name=>{checks.push(name);console.log('STOCK_CHECK='+name);};
let pool,tx,stage='preflight',passed=false,rolledBack=false,baseline;
const execute=async(connection,statement,args={})=>{const r=new sql.Request(connection);r.timeout=15000;for(const [key,value] of Object.entries(args)){r.input(key,value);}return (await r.query(statement)).recordset||[];};
const protectedBilling=()=>execute(pool,'SELECT * FROM management_billing_accounts WHERE tenant_id IN (@a,@b) ORDER BY tenant_id',{a:'80a4b392-13f8-484d-81fa-a110a6ef75f0',b:'2383f4fc-e107-4ac7-9e13-39db501f40ec'});
try{
 assert.match(id||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(process.env.PROPERTY_RENTAL_OFFERS_SCHEMA_READY,'true');
 pool=await getMssqlPool();
 assert.equal((await execute(pool,'SELECT id FROM tenants WHERE id=@id',{id})).length,0);
 baseline=hash(await protectedBilling());
 tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 const q=(statement,args={})=>execute(tx,statement,args);
 await q('SET LOCK_TIMEOUT 10000');
 stage='fixture';
 await q("INSERT tenants(id,name,slug,status,[plan]) VALUES(@id,'ROLLBACK ONLY stock expiry proof',@slug,'active','development-testing')",{id,slug:'r5-expiry-'+id});
 const actor=randomUUID();
 await q("INSERT app_users(id,tenant_id,name,email,role,user_type,status) VALUES(@actor,@id,'Rollback-only synthetic identity',@email,'rentee','rentee','active')",{actor,id,email:'r5-expiry-'+id+'@example.invalid'});
 const fixture=async status=>{
  const property=randomUUID(),enquiry=randomUUID();
  await q("INSERT properties(id,tenant_id,name,status,propertytype,country_code,rentalvalues,createdat,updatedat) VALUES(@property,@id,'ROLLBACK ONLY synthetic stock','available','house','LK',N'{\"listingCategory\":\"residential\",\"rent\":100}',SYSUTCDATETIME(),SYSUTCDATETIME())",{property,id});
  const listing=(await q('SELECT public_id FROM public_listing_preferences WHERE property_id=@property AND tenant_id=@id',{property,id}))[0];assert.ok(listing);
  await q("UPDATE public_listing_preferences SET opted_out=0,country_code='LK' WHERE property_id=@property AND tenant_id=@id",{property,id});
  await q("INSERT property_enquiries(id,listing_public_id,tenant_id,property_id,seeker_id,seeker_name,seeker_email,country_code,listing_title,message,consent_version,request_id,payload_hash) VALUES(@enquiry,@listing,@id,@property,@actor,'Rollback fixture',@email,'LK','Rollback stock','Synthetic SQL acceptance only','fixture-only',@request,@hash)",{enquiry,listing:listing.public_id,id,property,actor,email:'r5-expiry-'+id+'@example.invalid',request:randomUUID(),hash:'0'.repeat(64)});
  await q("INSERT property_rental_offers(enquiry_id,tenant_id,property_id,application_version,status,version,currency,rent,deposit,fees,start_date,end_date,terms,offer_until,hold_until,accepted_at,consent_version) VALUES(@enquiry,@id,@property,1,@status,1,'LKR',100,0,0,CONVERT(date,SYSUTCDATETIME()),CONVERT(date,DATEADD(day,30,SYSUTCDATETIME())),'Synthetic fixture; no customer acceptance',DATEADD(day,1,SYSUTCDATETIME()),DATEADD(day,2,SYSUTCDATETIME()),CASE WHEN @status='accepted' THEN SYSUTCDATETIME() ELSE NULL END,CASE WHEN @status='accepted' THEN 'rental-offer-v1' ELSE NULL END)",{enquiry,id,property,status});
  return {property,enquiry};
 };
 const available=async f=>(await q(`SELECT p.id ${PUBLIC_LISTING_ELIGIBILITY_SQL} AND p.id=@property AND p.tenant_id=@id`,{property:f.property,id})).length===1;
 const offer=async f=>(await q('SELECT * FROM property_rental_offers WHERE enquiry_id=@enquiry',{enquiry:f.enquiry}))[0];
 const expiredEvents=async f=>(await q("SELECT COUNT(*) n FROM property_rental_offer_events WHERE enquiry_id=@enquiry AND event_type='expired'",{enquiry:f.enquiry}))[0].n;
 const expire=async f=>{await q('UPDATE property_rental_offers SET offer_until=DATEADD(day,-2,SYSUTCDATETIME()),hold_until=DATEADD(day,-1,SYSUTCDATETIME()) WHERE enquiry_id=@enquiry',{enquiry:f.enquiry});};
 stage='offered_deadline';
 const offered=await fixture('offered');
 await expire(offered);await expireRentalOffers(q,offered.property,id);
 assert.equal((await offer(offered)).status,'expired');assert.equal(await expiredEvents(offered),1);check('unaccepted_offer_expiry_audited_once');
 stage='reservation_deadline';
 const accepted=await fixture('accepted');
 assert.equal(await available(accepted),false);check('current_whole_property_hold_hides_stock');
 const before=hash(await offer(accepted));
 await expireRentalOffers(q,accepted.property,randomUUID());assert.equal(hash(await offer(accepted)),before);check('foreign_tenant_expiry_cannot_change_hold');
 await expireRentalOffers(q,randomUUID(),id);assert.equal(hash(await offer(accepted)),before);check('foreign_property_expiry_cannot_change_hold');
 await expireRentalOffers(q,accepted.property,id);assert.equal(hash(await offer(accepted)),before);check('future_hold_is_not_expired');
 await expire(accepted);assert.equal(await available(accepted),true);check('elapsed_hold_releases_stock_before_lazy_audit');
 await expireRentalOffers(q,accepted.property,id);assert.equal((await offer(accepted)).status,'expired');assert.equal(await expiredEvents(accepted),1);check('accepted_hold_expiry_audited_once');
 await expireRentalOffers(q,accepted.property,id);assert.equal(await expiredEvents(accepted),1);assert.equal((await offer(accepted)).version,2);check('expiry_replay_preserves_version_and_audit');
 stage='unsigned_agreement';
 const unsigned=await fixture('accepted'),agreement=randomUUID();
 await q("INSERT agreements(id,tenant_id,propertyid,renteeid,status,title) VALUES(@agreement,@id,@property,@actor,'draft','ROLLBACK ONLY unsigned agreement')",{agreement,id,property:unsigned.property,actor});
 await q("UPDATE property_rental_offers SET status='agreement',agreement_id=@agreement WHERE enquiry_id=@enquiry",{agreement,enquiry:unsigned.enquiry});
 const draftBefore=hash(await q('SELECT * FROM agreements WHERE id=@agreement',{agreement}));
 assert.equal(await available(unsigned),false);await expire(unsigned);await expireRentalOffers(q,unsigned.property,id);
 assert.equal((await offer(unsigned)).status,'expired');assert.equal(await available(unsigned),true);check('unsigned_agreement_hold_expiry_releases_stock');
 assert.equal(hash(await q('SELECT * FROM agreements WHERE id=@agreement',{agreement})),draftBefore);check('unsigned_agreement_content_and_status_preserved');
 stage='stock_states';
 const stock=await fixture('offered');assert.equal(await available(stock),true);check('unaccepted_offer_does_not_reserve_stock');
 await q('UPDATE public_listing_preferences SET opted_out=1 WHERE property_id=@property AND tenant_id=@id',{property:stock.property,id});assert.equal(await available(stock),false);check('opted_out_stock_hidden');
 await q('UPDATE public_listing_preferences SET opted_out=0 WHERE property_id=@property AND tenant_id=@id',{property:stock.property,id});
 for(const status of ['inactive','rented','reserved']){await q('UPDATE properties SET status=@status WHERE id=@property AND tenant_id=@id',{status,property:stock.property,id});assert.equal(await available(stock),false);}
 check('inactive_rented_reserved_whole_stock_hidden');
 passed=true;
}catch(error){console.error('STOCK_FAILED='+JSON.stringify({stage,code:error.code||'ASSERTION',number:error.number||null,checks}));process.exitCode=1;}
finally{
 if(tx){try{await tx.rollback();rolledBack=true;}catch{rolledBack=false;}}
 try{
  if(pool){assert.equal((await execute(pool,'SELECT id FROM tenants WHERE id=@id',{id})).length,0);assert.equal((await execute(pool,'SELECT id FROM properties WHERE tenant_id=@id',{id})).length,0);assert.equal((await execute(pool,'SELECT enquiry_id FROM property_rental_offers WHERE tenant_id=@id',{id})).length,0);if(baseline){assert.equal(hash(await protectedBilling()),baseline);}}
  assert.ok(rolledBack);
  console.log('STOCK_CLEANUP='+JSON.stringify({rolledBack:true,fixtureRowsAbsent:true,protectedBillingUnchanged:true}));
  if(passed){console.log('STOCK_PASS='+JSON.stringify({passed:true,checks,rolledBack:true,fixtureRowsAbsent:true,protectedBillingUnchanged:true,providerWrites:0,publicHttpAccepted:false,uiAccepted:false}));}
 }catch{console.error('STOCK_CLEANUP_FAILED');process.exitCode=1;}
 await closeMssqlPool();
}
