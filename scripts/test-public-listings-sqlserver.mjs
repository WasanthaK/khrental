/**
 * Disposable SQL Server proof for the NEW public listing projection.
 * Uses its exact migration file and exact exported production SELECT/WHERE predicates.
 * Does not read production credentials, connect to Azure, or enable any release flags.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sql from 'mssql';
import {PUBLIC_LISTING_SELECT_SQL,PUBLIC_LISTING_ELIGIBILITY_SQL} from '../src/api/publicListings/store.js';
import {toPublicDTO} from '../src/api/publicListings/contract.js';
import {PUBLIC_MEDIA_ELIGIBILITY_SQL} from '../src/api/publicListings/media.js';

const image=process.env.MSSQL_TEST_IMAGE||'mcr.microsoft.com/mssql/server:2022-latest';
const migration=fs.readFileSync(path.resolve('migrations/20261026_01_public_listing_preferences.sql'),'utf8');
const container='quixo-public-listing-test-'+process.pid+'-'+crypto.randomBytes(3).toString('hex');
const password='SqlCheck!'+crypto.randomBytes(16).toString('base64url')+'Aa9';
const db='quixo_public_'+crypto.randomBytes(6).toString('hex');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const id=n=>'33333333-3333-4333-8333-'+n.toString(16).padStart(12,'0');
const unitId=n=>'44444444-4444-4444-8444-'+n.toString(16).padStart(12,'0');
const agreementId=n=>'55555555-5555-4555-8555-'+n.toString(16).padStart(12,'0');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:35000}).trim();
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const connect=async(dbname='master',port)=>new sql.ConnectionPool({
  server:'127.0.0.1',port,user:'sa',password,database:dbname,
  connectionTimeout:5000,requestTimeout:30000,
  options:{encrypt:false,trustServerCertificate:true},pool:{min:0,max:5}
}).connect();
let pool,master,port,created=false;
const withInputs=(values={})=>{const req=pool.request();for(const [k,v] of Object.entries(values))req.input(k,v);return req;};
const query=(statement,inputs={})=>withInputs(inputs).query(statement);
const rows=async(country)=>(
  await query(`SELECT TOP(50) ${PUBLIC_LISTING_SELECT_SQL}
    ${PUBLIC_LISTING_ELIGIBILITY_SQL}
    AND pref.country_code=@country ORDER BY p.createdat DESC,p.id DESC`,{country})
).recordset.map(toPublicDTO).filter(Boolean);
const assertVisible=async(expectedLK,expectedBN)=>{
  const lk=await rows('LK'),bn=await rows('BN');
  assert.deepEqual(lk.map(x=>x.id.toLowerCase()).sort(),expectedLK.sort(),'Sri Lanka eligibility');
  assert.deepEqual(bn.map(x=>x.id.toLowerCase()).sort(),expectedBN.sort(),'Brunei eligibility');
  assert.ok(lk.every(x=>x.country==='LK'&&x.currency==='LKR'));
  assert.ok(bn.every(x=>x.country==='BN'&&x.currency==='BND'));
  for(const r of [...lk,...bn]){
    assert.deepEqual(Object.keys(r),['id','country','category','title','location','monthlyRent','currency','images']);
    assert.deepEqual(r.images,[]);
    assert.ok(!JSON.stringify(r).includes('SECRET BANK'));
  }
};
try{
  docker(['run','-d','--name',container,'-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer',
    '-e','MSSQL_SA_PASSWORD='+password,'-p','127.0.0.1::1433',image]);
  created=true;
  const portLine=docker(['port',container,'1433/tcp']);
  const matched=portLine.match(/:(\d+)$/);
  assert.ok(matched,'SQL Server published port');
  port=Number(matched[1]);
  let lastError;
  for(let tryNum=0;tryNum<50;tryNum++){
    try{master=await connect('master',port);break;}catch(e){lastError=e;await delay(1500);}
  }
  assert.ok(master,'Disposable SQL Server failed: '+lastError?.message);
  await master.request().batch(`CREATE DATABASE [${db}]`);
  await master.close();master=undefined;
  pool=await connect(db,port);
  // Minimal exact-column core schema matches 20260913_00_create_fresh_mssql_schema.sql.
  // This avoids applying unrelated live billing/identity schema to a disposable test.
  await pool.request().batch(`
    CREATE TABLE dbo.tenants (
      id UNIQUEIDENTIFIER PRIMARY KEY, status NVARCHAR(50) NOT NULL DEFAULT N'active'
    );
    CREATE TABLE dbo.properties (
      id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER NOT NULL,
      status NVARCHAR(50) NOT NULL DEFAULT N'available',
      propertytype NVARCHAR(100) NULL,rentalvalues NVARCHAR(MAX) NULL,images NVARCHAR(MAX) NULL,
      createdat DATETIMEOFFSET NOT NULL DEFAULT SYSUTCDATETIME(),
      bank_account_number NVARCHAR(255) NULL,
      FOREIGN KEY(tenant_id) REFERENCES dbo.tenants(id)
    );
    CREATE TABLE dbo.property_units (
      id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER NOT NULL,
      propertyid UNIQUEIDENTIFIER NOT NULL,
      status NVARCHAR(50) NOT NULL DEFAULT N'available',
      FOREIGN KEY(tenant_id) REFERENCES dbo.tenants(id),
      FOREIGN KEY(propertyid) REFERENCES dbo.properties(id)
    );
    CREATE TABLE dbo.agreements (
      id UNIQUEIDENTIFIER PRIMARY KEY,tenant_id UNIQUEIDENTIFIER NOT NULL,
      propertyid UNIQUEIDENTIFIER NOT NULL, unitid UNIQUEIDENTIFIER NULL,
      status NVARCHAR(50) NOT NULL DEFAULT N'draft'
    );
  `);
  // A preexisting tenant/property is backfilled without guessing its country.
  await pool.request().query(`INSERT INTO dbo.tenants(id,status)
    VALUES ('${A}',N'active');`);
  await pool.request().query(`INSERT INTO dbo.properties(id,tenant_id,status,propertytype,rentalvalues)
    VALUES ('${id(9)}','${A}',N'available',N'house',N'{"rent":2300}');`);
  await pool.request().batch(migration);
  await pool.request().batch(migration);
  const schema=await query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.public_listing_preferences','U') IS NULL THEN 0 ELSE 1 END AS pref,
      CASE WHEN OBJECT_ID('dbo.public_listing_read_buckets','U') IS NULL THEN 0 ELSE 1 END AS bucket,
      CASE WHEN OBJECT_ID('dbo.trg_public_listing_preferences_property_insert','TR') IS NULL THEN 0 ELSE 1 END AS trigger_exists,
      CASE WHEN COL_LENGTH('dbo.public_listing_preferences','public_headline') IS NULL THEN 0 ELSE 1 END AS public_title,
      CASE WHEN OBJECT_ID('dbo.public_listing_media','U') IS NULL THEN 0 ELSE 1 END AS public_media,
      CASE WHEN OBJECT_ID('dbo.trg_public_listing_media_source_changed','TR') IS NULL THEN 0 ELSE 1 END AS source_change_trigger
  `);
  const m=schema.recordset[0];
  for(const [k,v] of Object.entries(m))assert.equal(v,1,'SQL migration component '+k);
  // Rows registered after migration must get the default preference automatically.
  await query('INSERT INTO dbo.tenants(id,status) VALUES (@b,N\'active\')',{b:B});
  const property=async(n,tenant,status='available',type='house')=>query(`
    INSERT INTO dbo.properties(id,tenant_id,status,propertytype,rentalvalues,bank_account_number)
    VALUES(@pid,@tenant,@status,@type,N'{"rent":2300}',N'SECRET BANK')`,
    {pid:id(n),tenant,status,type});
  await property(1,A); // LK, displayed
  await property(2,B); // BN, displayed
  await property(3,A,'reserved'); // filtered
  await property(4,A); // opted out
  await property(5,A); // country missing -> filtered
  await property(6,A,'rented'); // fully rented -> filtered
  await property(7,A,'rented','apartment'); // one free unit -> displayed
  await property(8,B); // LK in different tenant -> displayed via public only
  const count=(await query('SELECT COUNT(*) AS c FROM dbo.public_listing_preferences')).recordset[0].c;
  assert.equal(count,9,'one legacy backfill plus eight new trigger rows without manual publishing');
  const legacy=(await query('SELECT country_code,opted_out FROM dbo.public_listing_preferences WHERE property_id=@pid',{pid:id(9)})).recordset;
  assert.equal(legacy.length,1,'legacy property should receive an idempotent preference record');
  assert.equal(legacy[0].country_code,null,'legacy country must not be guessed from a private address');
  assert.equal(legacy[0].opted_out,false,'legacy properties are not silently opted out');
  const setCountry=async(n,country)=>query(`
    UPDATE dbo.public_listing_preferences SET country_code=@country,location_label=N'General district'
    WHERE property_id=@pid`,{pid:id(n),country});
  for(const n of [1,3,4,6,7,8])await setCountry(n,'LK');
  await setCountry(2,'BN');
  await query('UPDATE dbo.public_listing_preferences SET opted_out=1 WHERE property_id=@pid',{pid:id(4)});
  await query('INSERT dbo.property_units(id,tenant_id,propertyid,status) VALUES (@u1,@tenant,@property,N\'occupied\'),(@u2,@tenant,@property,N\'available\')',
    {u1:unitId(1),u2:unitId(2),tenant:A,property:id(7)});
  const publicIds=Object.fromEntries((await query('SELECT CONVERT(VARCHAR(36),property_id) AS pid,CONVERT(VARCHAR(36),public_id) AS publicid FROM dbo.public_listing_preferences')).recordset.map(x=>[x.pid.toLowerCase(),x.publicid.toLowerCase()]));
  const publicOf=n=>publicIds[id(n)];
  // Public derivative manifest starts empty even though properties and source images exist.
  const initial=(await query('SELECT COUNT(*) AS count FROM dbo.public_listing_media')).recordset[0].count;
  assert.equal(initial,0,'migration never copies a private property image into public storage');
  const safeMediaId='66666666-6666-4666-8666-666666666666';
  await query(`
    INSERT INTO dbo.public_listing_media(media_id,listing_public_id,display_order,alt_text,
      source_sha256,derivative_sha256,processor_version,image_bytes,media_status)
    VALUES(@mediaId,@listingId,0,N'Illustrative living area',
      @hash,@hash,N'review-only-test',128,N'withheld')`,
    {mediaId:safeMediaId,listingId:publicOf(1),hash:'f'.repeat(64)});
  const mediaVisible=async country=>(await query(`
    SELECT m.media_id,m.listing_public_id
    ${PUBLIC_MEDIA_ELIGIBILITY_SQL}
    AND pref.country_code=@country AND m.media_status=N'ready'
    AND m.rights_confirmed=1 AND m.privacy_reviewed=1`,{country})).recordset;
  assert.equal((await mediaVisible('LK')).length,0,'not ready/rights/privacy verified defaults hidden');
  await query(`
    UPDATE dbo.public_listing_media SET media_status=N'ready',rights_confirmed=1,privacy_reviewed=1
    WHERE media_id=@mediaId`,{mediaId:safeMediaId});
  assert.equal((await mediaVisible('LK')).length,1,'only verified processed derivative is image-eligible');
  assert.equal((await mediaVisible('BN')).length,0,'wrong market never serves image');
  await query('UPDATE dbo.public_listing_preferences SET opted_out=1 WHERE property_id=@property',{property:id(1)});
  assert.equal((await mediaVisible('LK')).length,0,'opt-out immediately revokes derivative');
  await query('UPDATE dbo.public_listing_preferences SET opted_out=0 WHERE property_id=@property',{property:id(1)});
  await query("UPDATE dbo.properties SET status=N'reserved' WHERE id=@property",{property:id(1)});
  assert.equal((await mediaVisible('LK')).length,0,'reserved property derivative hidden');
  await query("UPDATE dbo.properties SET status=N'available' WHERE id=@property",{property:id(1)});
  assert.equal((await mediaVisible('LK')).length,1,'returning to available recovers eligible derivative');
  await query("UPDATE dbo.properties SET images=N'[{\\\"image_url\\\":\\\"removed\\\"}]' WHERE id=@property",{property:id(1)});
  const withdrawn=(await query('SELECT media_status,withdrawn_at FROM dbo.public_listing_media WHERE media_id=@mediaId',{mediaId:safeMediaId})).recordset[0];
  assert.equal(withdrawn.media_status,'withdrawn','changed source photo triggers hard withdrawal');
  assert.ok(withdrawn.withdrawn_at,'withdrawal time recorded');
  assert.equal((await mediaVisible('LK')).length,0,'old image cannot reappear without reconversion');

  await assertVisible([publicOf(1),publicOf(7),publicOf(8)],[publicOf(2)]);
  // A whole-property active lease immediately suppresses an otherwise "available" row.
  await query("INSERT INTO dbo.agreements(id,tenant_id,propertyid,unitid,status) VALUES(@aid,@t,@p,NULL,N'active')",
    {aid:agreementId(1),t:A,p:id(1)});
  await assertVisible([publicOf(7),publicOf(8)],[publicOf(2)]);
  // A newly active unit lease suppresses that unit, not another eligible independent unit.
  await query("INSERT INTO dbo.agreements(id,tenant_id,propertyid,unitid,status) VALUES(@aid,@t,@p,@unit,N'active')",
    {aid:agreementId(2),t:A,p:id(7),unit:unitId(2)});
  await assertVisible([publicOf(8)],[publicOf(2)]);
  // Unrenting/resolving the agreement restores visibility without a publish step.
  await query("UPDATE dbo.agreements SET status=N'ended' WHERE id IN(@a,@b)",{a:agreementId(1),b:agreementId(2)});
  await assertVisible([publicOf(1),publicOf(7),publicOf(8)],[publicOf(2)]);
  // An opt-out stays hidden even after a rented -> available transition.
  await query("UPDATE dbo.properties SET status=N'rented' WHERE id=@pid",{pid:id(4)});
  await query("UPDATE dbo.properties SET status=N'available' WHERE id=@pid",{pid:id(4)});
  await assertVisible([publicOf(1),publicOf(7),publicOf(8)],[publicOf(2)]);
  await query("UPDATE dbo.public_listing_preferences SET opted_out=0 WHERE property_id=@pid",{pid:id(4)});
  await assertVisible([publicOf(1),publicOf(4),publicOf(7),publicOf(8)],[publicOf(2)]);
  // A tenant cannot update another tenant's opt-out through its scoped WHERE.
  const cross=await query("UPDATE dbo.public_listing_preferences SET opted_out=1 WHERE property_id=@pid AND tenant_id=@tenant",{pid:id(1),tenant:B});
  assert.equal(cross.rowsAffected[0],0,'foreign tenant cannot change source property');
  await assertVisible([publicOf(1),publicOf(4),publicOf(7),publicOf(8)],[publicOf(2)]);
  // Wrong-country classification is rejected by the database, too.
  await assert.rejects(query("UPDATE dbo.public_listing_preferences SET country_code=N'XX' WHERE property_id=@pid",{pid:id(1)}));
  console.log('PUBLIC_LISTING_DISPOSABLE_SQL=PASS schema=double-applied; tenants=2; properties=9; legacy-backfill; media-withdrawal; optout; lease; vacancy; country; redaction');
}finally{
  if(pool)await pool.close().catch(()=>{});
  if(master)await master.close().catch(()=>{});
  if(created)docker(['rm','-f',container]);
}
