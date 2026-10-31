import {verifyRentalOffers} from './test-rental-offers-sql.mjs';
import {verifyOwnerOnboarding} from './test-owner-onboarding-sql.mjs';
import {verifyAccountEmailVerification} from './test-account-email-verification-sql.mjs';
// Actual production store + exact draft migration on disposable SQL Server only.
// Never reads production settings or creates cloud test capacity.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import sql from 'mssql';
import {createEnquiryStore} from '../src/api/enquiries/store.js';
import {parseEnquiry} from '../src/api/enquiries/contract.js';
import {inspectPropertyApplications} from './inspect-property-applications-schema.mjs';
import {createApplicationStore} from '../src/api/enquiries/applicationStore.js';
import {parseApplicationAction} from '../src/api/enquiries/applicationContract.js';
import {inspectPropertyViewings} from './inspect-property-viewings-schema.mjs';
import {createViewingStore} from '../src/api/enquiries/viewingStore.js';
import {parseViewingAction} from '../src/api/enquiries/viewingContract.js';
import {inspectPropertyEnquiries} from './inspect-property-enquiries-schema.mjs';
import {inspectEnquiryApplicationAccess} from '../src/api/enquiries/readiness.js';

const container='quixo-enquiry-proof-'+process.pid+'-'+crypto.randomBytes(3).toString('hex');
const password='Proof!'+crypto.randomBytes(18).toString('base64url')+'Aa9';
const db='enquiry_'+crypto.randomBytes(6).toString('hex');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000}).trim();
let pool,master,created=false;
const ids=Array.from({length:80},()=>crypto.randomUUID());
const tenant=ids[0],otherTenant=ids[1],seeker=ids[2],admin=ids[3],otherAdmin=ids[4];
const actor={actorId:seeker,authId:ids[5],sessionId:ids[6]};
const owner={actorId:admin,authId:ids[7],sessionId:ids[8],tenantId:tenant};
const foreignOwner={actorId:otherAdmin,authId:ids[9],sessionId:ids[10],tenantId:otherTenant};
const query=async(statement,params={})=>{
  const r=pool.request();for(const [k,v] of Object.entries(params)){r.input(k,v);}
  return (await r.query(statement)).recordset||[];
};
try {
  docker(['run','-d','--name',container,'-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer',
    '-e','MSSQL_SA_PASSWORD='+password,'-p','127.0.0.1::1433',process.env.MSSQL_TEST_IMAGE||'mcr.microsoft.com/mssql/server:2022-latest']);
  created=true;
  const port=Number(docker(['port',container,'1433/tcp']).match(/:(\d+)$/)[1]);
  const connect=database=>new sql.ConnectionPool({server:'127.0.0.1',port,user:'sa',password,database,
    options:{encrypt:false,trustServerCertificate:true},connectionTimeout:2500,requestTimeout:30000,pool:{min:0,max:8}}).connect();
  for(let i=0;i<60;i++){
    try {master=await connect('master');break;} catch {await new Promise(r=>setTimeout(r,1000));}
  }
  assert.ok(master,'Disposable SQL Server must start');
  await master.request().batch('CREATE DATABASE ['+db+']');await master.close();master=null;
  pool=await connect(db);
  // Minimal prerequisite columns have the production types and names. The NEW
  // migration and every operation under test are the exact application sources.
  await pool.request().batch(`
    CREATE TABLE tenants(id UNIQUEIDENTIFIER PRIMARY KEY,status NVARCHAR(50));
    CREATE TABLE app_users(id UNIQUEIDENTIFIER PRIMARY KEY,auth_id UNIQUEIDENTIFIER,
      tenant_id UNIQUEIDENTIFIER NULL,name NVARCHAR(255),email NVARCHAR(320),role NVARCHAR(50),
      user_type NVARCHAR(50),status NVARCHAR(50));
    CREATE TABLE auth_users(id UNIQUEIDENTIFIER PRIMARY KEY,auth_id UNIQUEIDENTIFIER,
      app_user_id UNIQUEIDENTIFIER,email NVARCHAR(320),role NVARCHAR(64),metadata NVARCHAR(MAX));
    CREATE TABLE auth_sessions(id UNIQUEIDENTIFIER PRIMARY KEY,auth_user_id UNIQUEIDENTIFIER,
      revoked_at DATETIME2 NULL,expires_at DATETIME2);
    CREATE TABLE tenant_memberships(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,
      app_user_id UNIQUEIDENTIFIER,role NVARCHAR(50),status NVARCHAR(50),is_default BIT NOT NULL DEFAULT 0);
    CREATE TABLE properties(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,status NVARCHAR(50),
      country_code CHAR(2),propertytype NVARCHAR(100),rentalvalues NVARCHAR(MAX));
    CREATE TABLE property_units(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,propertyid UNIQUEIDENTIFIER,status NVARCHAR(50),unitnumber NVARCHAR(100));
    CREATE TABLE agreements(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,propertyid UNIQUEIDENTIFIER,unitid UNIQUEIDENTIFIER NULL,status NVARCHAR(50),templateid UNIQUEIDENTIFIER NULL,renteeid UNIQUEIDENTIFIER NULL,
      rentamount DECIMAL(18,2),depositamount DECIMAL(18,2),startdate DATETIMEOFFSET,enddate DATETIMEOFFSET,title NVARCHAR(255),content NVARCHAR(MAX),terms NVARCHAR(MAX),
      needs_document_generation BIT,signature_status NVARCHAR(100),signature_completed_at DATETIMEOFFSET,signeddate DATETIMEOFFSET,
      createdat DATETIMEOFFSET DEFAULT SYSUTCDATETIME(),updatedat DATETIMEOFFSET DEFAULT SYSUTCDATETIME());
    CREATE TABLE agreement_templates(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,name NVARCHAR(255),version INT,content NVARCHAR(MAX));
    CREATE TABLE tenancy_lifecycle_events(id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),tenant_id UNIQUEIDENTIFIER,agreement_id UNIQUEIDENTIFIER,event_type NVARCHAR(100),actor_user_id UNIQUEIDENTIFIER,metadata NVARCHAR(MAX));
    CREATE TABLE tenancy_deposit_transactions(id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),tenant_id UNIQUEIDENTIFIER,agreement_id UNIQUEIDENTIFIER,transaction_type NVARCHAR(50),status NVARCHAR(50),amount DECIMAL(18,2));
    CREATE TABLE tenancy_move_in_checklists(id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),tenant_id UNIQUEIDENTIFIER,agreement_id UNIQUEIDENTIFIER,status NVARCHAR(50));
    CREATE TABLE tenancy_move_in_checklist_items(id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),tenant_id UNIQUEIDENTIFIER,checklist_id UNIQUEIDENTIFIER,is_required BIT,status NVARCHAR(50));
    CREATE TABLE public_listing_preferences(public_id UNIQUEIDENTIFIER PRIMARY KEY,property_id UNIQUEIDENTIFIER,
      tenant_id UNIQUEIDENTIFIER,country_code CHAR(2),opted_out BIT,public_headline NVARCHAR(150),location_label NVARCHAR(120));
  `);
  const migration=fs.readFileSync('migrations/20261028_01_property_enquiries.sql','utf8');
  await pool.request().batch(migration);await pool.request().batch(migration);
  assert.equal((await inspectPropertyEnquiries(pool)).satisfied,true);
  const viewingMigration=fs.readFileSync('migrations/20261028_02_property_viewings.sql','utf8');
  await pool.request().batch(viewingMigration);await pool.request().batch(viewingMigration);
  const applicationMigration=fs.readFileSync('migrations/20261028_03_property_applications.sql','utf8');
  await pool.request().batch(applicationMigration);await pool.request().batch(applicationMigration);
  await pool.request().batch(fs.readFileSync('migrations/20261029_01_rental_offers_and_holds.sql','utf8'));
  const applicationSchema=await inspectPropertyApplications(pool);
  assert.equal(applicationSchema.satisfied,true,applicationSchema.detail);
  await query('ALTER TABLE property_applications NOCHECK CONSTRAINT CK_property_applications_consent');
  assert.equal((await inspectPropertyApplications(pool)).satisfied,false);
  await query('ALTER TABLE property_applications WITH CHECK CHECK CONSTRAINT CK_property_applications_consent');
  const viewingSchema=await inspectPropertyViewings(pool);
  assert.equal(viewingSchema.satisfied,true,viewingSchema.detail);
  await query('ALTER TABLE property_viewings NOCHECK CONSTRAINT CK_property_viewings_time');
  assert.equal((await inspectPropertyViewings(pool)).satisfied,false,'Disabled viewing checks fail strict acceptance');
  await query('ALTER TABLE property_viewings WITH CHECK CHECK CONSTRAINT CK_property_viewings_time');

  // Match the restricted web identity: DML is allowed but definitions are not.
  // A fresh strict executor check remains required separately in the workflow.
  await query(`CREATE USER enquiry_readiness_probe WITHOUT LOGIN;
    GRANT SELECT,INSERT,UPDATE ON dbo.property_enquiries TO enquiry_readiness_probe;
    GRANT SELECT,INSERT ON dbo.property_enquiry_events TO enquiry_readiness_probe;
    DENY VIEW DEFINITION TO enquiry_readiness_probe;`);
  const restricted={request:()=>({query:statement=>pool.request().query(`
    EXECUTE AS USER='enquiry_readiness_probe'; BEGIN TRY
    ${statement}
    REVERT; END TRY BEGIN CATCH REVERT; THROW; END CATCH;
  `)})};
  assert.equal((await inspectPropertyEnquiries(restricted)).satisfied,false,'Restricted metadata cannot establish strict schema acceptance');
  assert.equal((await inspectEnquiryApplicationAccess(restricted)).satisfied,true,'Required runtime access works without definition rights');
  await query('REVOKE INSERT ON dbo.property_enquiry_events FROM enquiry_readiness_probe');
  assert.equal((await inspectEnquiryApplicationAccess(restricted)).satisfied,false,'Missing audit-write permission fails readiness without writing a row');
  assert.equal((await query('SELECT COUNT(*) AS n FROM property_enquiries'))[0].n,0);
  assert.equal((await query('SELECT COUNT(*) AS n FROM property_enquiry_events'))[0].n,0);
  await query('DROP USER enquiry_readiness_probe');
  console.log('ENQUIRY_APPLICATION_ACCESS_SQL=PASS restricted_definition_visibility required_dml denied_audit_write no_customer_writes');
  await query('ALTER TABLE property_enquiries NOCHECK CONSTRAINT FK_property_enquiries_seeker');
  assert.equal((await inspectPropertyEnquiries(pool)).satisfied,false,'Untrusted/disabled foreign keys must fail readiness');
  await query('ALTER TABLE property_enquiries WITH CHECK CHECK CONSTRAINT FK_property_enquiries_seeker');
  await query('DROP INDEX UX_property_enquiries_open ON property_enquiries');
  assert.equal((await inspectPropertyEnquiries(pool)).satisfied,false,'Missing duplicate-open protection must fail readiness');
  await query("CREATE UNIQUE INDEX UX_property_enquiries_open ON property_enquiries(seeker_id,listing_public_id) WHERE status IN('pending','responded')");
  assert.equal((await inspectPropertyEnquiries(pool)).satisfied,true);
  await query(`INSERT tenants VALUES(@tenant,N'active'),(@otherTenant,N'active')`,{tenant,otherTenant});
  for(const [a,role,userType,tenantId] of [[actor,'authenticated','seeker',null],[owner,'admin','staff',tenant],[foreignOwner,'admin','staff',otherTenant]]){
    const authUserId=crypto.randomUUID();
    await query(`INSERT app_users VALUES(@actorId,@authId,@tenantId,N'Synthetic Account',@email,@role,@userType,N'active');
      INSERT auth_users VALUES(@authUserId,@authId,@actorId,@email,@role,N'{"global_email_verified":true}');
      INSERT auth_sessions VALUES(@sessionId,@authUserId,NULL,DATEADD(day,1,SYSUTCDATETIME()));`,
    {...a,tenantId,authUserId,email:a.actorId+'@example.test',role,userType});
    if(tenantId){await query(`INSERT tenant_memberships(id,tenant_id,app_user_id,role,status) VALUES(NEWID(),@tenantId,@actorId,N'admin',N'active')`,{tenantId,actorId:a.actorId});}
  }
  for(let i=0;i<12;i++){
    await query(`INSERT properties VALUES(@propertyId,@tenant,N'available','LK',N'house',N'{"rent":1000,"listingCategory":"residential"}');
      INSERT public_listing_preferences VALUES(@listingId,@propertyId,@tenant,'LK',0,N'Synthetic rental',N'General location')`,
    {propertyId:ids[20+i],listingId:ids[40+i],tenant});
  }
  const store=createEnquiryStore({poolProvider:async()=>pool});
  const input=(n=0,message='May I request a viewing?')=>parseEnquiry({listingId:ids[40+n],country:'LK',requestId:crypto.randomUUID(),message,consent:true});
  const first=input();
  const concurrent=await Promise.all([store.submit(actor,first),store.submit(actor,first)]);
  assert.equal(concurrent.filter(x=>x.created).length,1);
  assert.equal(concurrent[0].receipt.id,concurrent[1].receipt.id);
  const saved=concurrent[0].receipt;
  const applications=createApplicationStore({poolProvider:async()=>pool});
  const apply=(action,version,owner=false,extra={})=>parseApplicationAction({action,version,requestId:crypto.randomUUID(),...extra},owner);
  const details={moveInDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),occupants:2,termMonths:12,statement:'Synthetic rental plans',consent:true};
  const originalApplication=apply('submit',0,false,details);
  await assert.rejects(applications.change(actor,saved.id,originalApplication),{code:'APPLICATION_VIEWING_REQUIRED'});
  assert.equal((await applications.get(actor,saved.id)).canSubmit,false);

  const sameAfterRestart=createEnquiryStore({poolProvider:async()=>pool});
  assert.equal((await sameAfterRestart.submit(actor,first)).created,false);
  await assert.rejects(store.submit(actor,parseEnquiry({listingId:first.listingId,country:first.country,
    consent:true,requestId:first.requestId,message:'Changed content'})),{code:'ENQUIRY_REQUEST_CONFLICT'});
  await assert.rejects(store.submit(actor,input()),{code:'ENQUIRY_ALREADY_OPEN'});
  assert.equal((await store.list(foreignOwner,true)).items.length,0);
  await assert.rejects(store.change(foreignOwner,saved.id,{status:'closed',response:'',version:1},true),{code:'ENQUIRY_NOT_FOUND'});
  const reply=await store.change(owner,saved.id,{status:'responded',response:'Please suggest a convenient time.',version:1},true);
  assert.equal(reply.version,2);
  await assert.rejects(store.change(owner,saved.id,{status:'closed',response:'',version:1},true),{code:'ENQUIRY_CHANGED'});
  const mine=(await store.list(actor)).items[0];
  assert.equal(mine.response,'Please suggest a convenient time.');
  assert.ok(!Object.hasOwn(mine,'seekerEmail'));assert.ok(!Object.hasOwn(mine,'propertyId'));
  const viewings=createViewingStore({poolProvider:async()=>pool});
  const start=new Date(Date.now()+86400000).toISOString();
  const end=new Date(Date.parse(start)+3600000).toISOString();
  const action=(name,version,own=false,extra={})=>parseViewingAction({action:name,version,requestId:crypto.randomUUID(),...extra},own);
  const request=action('request',0,false,{startsAt:start,endsAt:end});
  const viewingConcurrent=await Promise.allSettled([viewings.change(actor,saved.id,request),viewings.change(actor,saved.id,request)]);
  for(const result of viewingConcurrent){if(result.status==='rejected'){assert.equal(result.reason.code,'ENQUIRY_RETRY');}}
  assert.ok(viewingConcurrent.some(result=>result.status==='fulfilled'));
  assert.equal((await viewings.change(actor,saved.id,request)).version,1,'Exact replay survives retry');
  assert.equal((await query('SELECT COUNT(*) AS n FROM property_viewing_events WHERE enquiry_id=@id',{id:saved.id}))[0].n,1);
  await assert.rejects(viewings.get(foreignOwner,saved.id,true),{code:'ENQUIRY_NOT_FOUND'});
  await assert.rejects(viewings.change(actor,saved.id,{...request,payloadHash:'changed'}),{code:'VIEWING_REQUEST_CONFLICT'});
  const confirm=action('confirm',1,true,{instructions:'Synthetic private meeting point'});
  assert.equal((await viewings.change(owner,saved.id,confirm,true)).status,'confirmed');
  assert.equal((await viewings.get(actor,saved.id)).instructions,'Synthetic private meeting point');
  await assert.rejects(viewings.change(actor,saved.id,action('cancel',1)),{code:'VIEWING_CHANGED'});
  await assert.rejects(viewings.change(owner,saved.id,action('complete',2,true),true),{code:'VIEWING_CHANGED'});
  const proposed=await viewings.change(owner,saved.id,action('propose',2,true,{startsAt:start,endsAt:end,instructions:'Revised meeting point'}),true);
  assert.equal(proposed.status,'proposed');assert.equal(proposed.instructions,null);
  assert.equal((await viewings.get(actor,saved.id)).instructions,null);
  await query('UPDATE public_listing_preferences SET opted_out=1 WHERE public_id=@id',{id:first.listingId});
  await assert.rejects(viewings.change(actor,saved.id,action('accept',3)),{code:'LISTING_UNAVAILABLE'});
  await query('UPDATE public_listing_preferences SET opted_out=0 WHERE public_id=@id',{id:first.listingId});
  assert.equal((await viewings.change(actor,saved.id,action('accept',3))).status,'confirmed');
  assert.equal((await viewings.change(actor,saved.id,action('cancel',4))).status,'cancelled');
  const acceptedReplay=await viewings.change(owner,saved.id,confirm,true);
  assert.equal(acceptedReplay.status,'cancelled');assert.equal(acceptedReplay.instructions,null);
  // Rebook and establish a past completed appointment without a clock mock:
  // only the synthetic database fixture moves the saved appointment to the past.
  await viewings.change(actor,saved.id,action('request',5,false,{startsAt:start,endsAt:end}));
  await viewings.change(owner,saved.id,action('confirm',6,true),true);
  await query('UPDATE property_viewings SET starts_at=DATEADD(hour,-2,SYSUTCDATETIME()),ends_at=DATEADD(hour,-1,SYSUTCDATETIME()) WHERE enquiry_id=@id',{id:saved.id});
  assert.equal((await viewings.change(owner,saved.id,action('complete',7,true),true)).status,'completed');
  assert.deepEqual((await query('SELECT status FROM property_viewing_events WHERE enquiry_id=@id ORDER BY version',{id:saved.id})).map(x=>x.status),
    ['requested','confirmed','proposed','confirmed','cancelled','requested','confirmed','completed']);
  console.log('PROPERTY_VIEWINGS_SQL=PASS migration_rerun strict_drift scope concurrent_replay stale_version confirmation proposal privacy availability completion audit');
  assert.equal((await applications.get(actor,saved.id)).canSubmit,true);
  const concurrentApplications=await Promise.allSettled([applications.change(actor,saved.id,originalApplication),applications.change(actor,saved.id,originalApplication)]);
  assert.ok(concurrentApplications.some(x=>x.status==='fulfilled'));
  for(const result of concurrentApplications){if(result.status==='rejected'){assert.equal(result.reason.code,'ENQUIRY_RETRY');}}
  assert.equal((await applications.change(actor,saved.id,originalApplication)).application.version,1);
  assert.equal((await query('SELECT COUNT(*) AS n FROM property_application_events'))[0].n,1);
  await assert.rejects(applications.get(foreignOwner,saved.id,true),{code:'ENQUIRY_NOT_FOUND'});
  await assert.rejects(applications.change(actor,saved.id,{...originalApplication,payloadHash:'changed'}),{code:'APPLICATION_REQUEST_CONFLICT'});
  await applications.change(owner,saved.id,apply('needs_information',1,true,{note:'Clarify your preferred term.'}),true);
  await assert.rejects(applications.change(owner,saved.id,apply('accept',1,true,{note:'Stale'}),true),{code:'APPLICATION_CHANGED'});
  await query('UPDATE public_listing_preferences SET opted_out=1 WHERE public_id=@id',{id:first.listingId});
  assert.equal((await applications.get(actor,saved.id)).canSubmit,false);
  await assert.rejects(applications.change(actor,saved.id,apply('submit',2,false,details)),{code:'LISTING_UNAVAILABLE'});
  await query('UPDATE public_listing_preferences SET opted_out=0 WHERE public_id=@id',{id:first.listingId});
  await applications.change(actor,saved.id,apply('submit',2,false,{...details,termMonths:24}));
  await query('UPDATE public_listing_preferences SET opted_out=1 WHERE public_id=@id',{id:first.listingId});
  const acceptance=apply('accept',3,true,{note:'Reviewed for offer preparation.'});
  await assert.rejects(applications.change(owner,saved.id,acceptance,true),{code:'LISTING_UNAVAILABLE'});
  await query('UPDATE public_listing_preferences SET opted_out=0 WHERE public_id=@id',{id:first.listingId});
  assert.equal((await applications.change(owner,saved.id,acceptance,true)).application.status,'accepted');
  assert.equal((await query('SELECT COUNT(*) AS n FROM agreements'))[0].n,0,'Review does not create a tenancy');
  assert.equal((await applications.change(actor,saved.id,apply('withdraw',4))).application.status,'withdrawn');
  assert.equal((await applications.change(actor,saved.id,originalApplication)).application.status,'withdrawn','Old replay returns current decision');
  assert.deepEqual((await query('SELECT status FROM property_application_events ORDER BY version')).map(x=>x.status),['submitted','needs_information','submitted','accepted','withdrawn']);
  assert.equal((await query('SELECT COUNT(*) AS n FROM tenant_memberships WHERE app_user_id=@id',{id:actor.actorId}))[0].n,0);
  console.log('PROPERTY_APPLICATIONS_SQL=PASS migration_rerun strict_consent_drift completed_viewing scope concurrent_replay consent renewed_submission version availability review withdrawal audit no_membership_no_tenancy');

  assert.equal((await store.change(actor,saved.id,{version:2})).status,'withdrawn');
  await assert.rejects(store.change(owner,saved.id,{status:'responded',response:'Late reply',version:3},true),{code:'ENQUIRY_CHANGED'});
  const events=await query('SELECT version,from_status,to_status,response FROM property_enquiry_events WHERE enquiry_id=@id ORDER BY version',{id:saved.id});
  assert.deepEqual(events.map(x=>x.to_status),['pending','responded','withdrawn']);
  assert.equal(events[1].response,'Please suggest a convenient time.');
  await query('UPDATE public_listing_preferences SET opted_out=1 WHERE public_id=@id',{id:ids[41]});
  await assert.rejects(store.submit(actor,input(1)),{code:'LISTING_UNAVAILABLE'});
  await query('UPDATE public_listing_preferences SET opted_out=0 WHERE public_id=@id',{id:ids[41]});
  await assert.rejects(store.submit(actor,{...input(1),country:'BN'}),{code:'LISTING_UNAVAILABLE'});
  await query("UPDATE properties SET status='reserved' WHERE id=@id",{id:ids[21]});
  await assert.rejects(store.submit(actor,input(1)),{code:'LISTING_UNAVAILABLE'});
  await query("UPDATE properties SET status='available' WHERE id=@id",{id:ids[21]});
  // Quota survives new store instances and includes withdrawn requests.
  for(let n=1;n<10;n++){await store.submit(actor,input(n));}
  await assert.rejects(sameAfterRestart.submit(actor,input(10)),{code:'ENQUIRY_LIMIT'});
  // A verified owner in organization B rents personally from organization A.
  // Personal actor scope never grants that owner access to A's management inbox.
  const beforeMemberships=(await query('SELECT COUNT(*) AS n FROM tenant_memberships WHERE app_user_id=@id',{id:foreignOwner.actorId}))[0].n;
  const personal=await store.submit(foreignOwner,input(11));
  assert.equal((await store.list(foreignOwner)).items[0].id,personal.receipt.id);
  assert.equal((await store.list(foreignOwner,true)).items.length,0);
  assert.ok((await store.list(owner,true)).items.some(row=>row.id===personal.receipt.id));
  await assert.rejects(store.withEnquiry(owner,personal.receipt.id,false,async()=>null),{code:'ENQUIRY_NOT_FOUND'});
  await assert.rejects(store.withEnquiry(foreignOwner,saved.id,false,async()=>null),{code:'ENQUIRY_NOT_FOUND'});
  await assert.rejects(store.list({...foreignOwner,actorId:actor.actorId}),{code:'ENQUIRY_ACTOR_REQUIRED'});
  assert.equal((await query('SELECT COUNT(*) AS n FROM tenant_memberships WHERE app_user_id=@id',{id:foreignOwner.actorId}))[0].n,beforeMemberships);
  await query('UPDATE auth_users SET metadata=@metadata WHERE auth_id=@id',{id:foreignOwner.authId,metadata:JSON.stringify({global_email_verified:false})});
  await assert.rejects(store.list(foreignOwner),{code:'ENQUIRY_ACTOR_REQUIRED'});
  await query('UPDATE auth_users SET metadata=@metadata WHERE auth_id=@id',{id:foreignOwner.authId,metadata:JSON.stringify({global_email_verified:true})});
  console.log('PERSONAL_RENTAL_SQL=PASS verified_member actor_only cross_organization_inbox_denied forged_actor_denied verification_rechecked no_membership_mutation');
  await query('UPDATE auth_sessions SET revoked_at=SYSUTCDATETIME() WHERE id=@id',{id:actor.sessionId});
  await assert.rejects(store.list(actor),{code:'ENQUIRY_ACTOR_REQUIRED'});
  await assert.rejects(viewings.get(actor,saved.id),{code:'ENQUIRY_ACTOR_REQUIRED'});
  await assert.rejects(applications.get(actor,saved.id),{code:'ENQUIRY_ACTOR_REQUIRED'});
  await query("UPDATE tenant_memberships SET status='revoked' WHERE app_user_id=@id",{id:owner.actorId});
  await assert.rejects(store.list(owner,true),{code:'ENQUIRY_ACTOR_REQUIRED'});
  assert.equal((await query('SELECT COUNT(*) AS n FROM tenant_memberships WHERE app_user_id=@id',{id:actor.actorId}))[0].n,0);
  console.log('PROPERTY_ENQUIRIES_SQL=PASS migration_rerun concurrent_idempotency scope consent_audit durable_quota revocation withdrawal');
  await query("UPDATE tenant_memberships SET status='active' WHERE app_user_id=@id",{id:owner.actorId});
  await verifyRentalOffers({pool,query,owner,foreignOwner});
  await verifyOwnerOnboarding({pool,query});
  await verifyAccountEmailVerification({pool,query});
} finally {
  await pool?.close().catch(()=>{});await master?.close().catch(()=>{});
  if(created){docker(['rm','-f',container]);}
}
