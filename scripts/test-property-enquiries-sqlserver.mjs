// Actual production store + exact draft migration on disposable SQL Server only.
// Never reads production settings or creates cloud test capacity.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import sql from 'mssql';
import {createEnquiryStore} from '../src/api/enquiries/store.js';
import {parseEnquiry} from '../src/api/enquiries/contract.js';

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
      app_user_id UNIQUEIDENTIFIER,role NVARCHAR(50),status NVARCHAR(50));
    CREATE TABLE properties(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,status NVARCHAR(50),
      country_code CHAR(2),propertytype NVARCHAR(100),rentalvalues NVARCHAR(MAX));
    CREATE TABLE property_units(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,propertyid UNIQUEIDENTIFIER,status NVARCHAR(50));
    CREATE TABLE agreements(id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER,propertyid UNIQUEIDENTIFIER,unitid UNIQUEIDENTIFIER NULL,status NVARCHAR(50));
    CREATE TABLE public_listing_preferences(public_id UNIQUEIDENTIFIER PRIMARY KEY,property_id UNIQUEIDENTIFIER,
      tenant_id UNIQUEIDENTIFIER,country_code CHAR(2),opted_out BIT,public_headline NVARCHAR(150),location_label NVARCHAR(120));
  `);
  const migration=fs.readFileSync('migrations/drafts/20261028_01_property_enquiries.sql','utf8');
  await pool.request().batch(migration);await pool.request().batch(migration);
  await query(`INSERT tenants VALUES(@tenant,N'active'),(@otherTenant,N'active')`,{tenant,otherTenant});
  for(const [a,role,userType,tenantId] of [[actor,'authenticated','seeker',null],[owner,'admin','staff',tenant],[foreignOwner,'admin','staff',otherTenant]]){
    const authUserId=crypto.randomUUID();
    await query(`INSERT app_users VALUES(@actorId,@authId,@tenantId,N'Synthetic Account',@email,@role,@userType,N'active');
      INSERT auth_users VALUES(@authUserId,@authId,@actorId,@email,@role,N'{"global_email_verified":true}');
      INSERT auth_sessions VALUES(@sessionId,@authUserId,NULL,DATEADD(day,1,SYSUTCDATETIME()));`,
    {...a,tenantId,authUserId,email:a.actorId+'@example.test',role,userType});
    if(tenantId){await query(`INSERT tenant_memberships VALUES(NEWID(),@tenantId,@actorId,N'admin',N'active')`,{tenantId,actorId:a.actorId});}
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
  await query('UPDATE auth_sessions SET revoked_at=SYSUTCDATETIME() WHERE id=@id',{id:actor.sessionId});
  await assert.rejects(store.list(actor),{code:'ENQUIRY_ACTOR_REQUIRED'});
  await query("UPDATE tenant_memberships SET status='revoked' WHERE app_user_id=@id",{id:owner.actorId});
  await assert.rejects(store.list(owner,true),{code:'ENQUIRY_ACTOR_REQUIRED'});
  assert.equal((await query('SELECT COUNT(*) AS n FROM tenant_memberships WHERE app_user_id=@id',{id:actor.actorId}))[0].n,0);
  console.log('PROPERTY_ENQUIRIES_SQL=PASS migration_rerun concurrent_idempotency scope consent_audit durable_quota revocation withdrawal');
} finally {
  await pool?.close().catch(()=>{});await master?.close().catch(()=>{});
  if(created){docker(['rm','-f',container]);}
}
