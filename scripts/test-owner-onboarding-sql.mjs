import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createOwnerTestingWorkspace} from '../src/api/platform/ownerOnboarding.js';

export const verifyOwnerOnboarding=async({pool,query})=>{
  // Match existing production foundation columns; no production schema mutation.
  await pool.request().batch(`ALTER TABLE tenants ADD name NVARCHAR(200),slug NVARCHAR(200),[plan] NVARCHAR(50),createdat DATETIMEOFFSET,updatedat DATETIMEOFFSET;`);
  await pool.request().batch(`CREATE UNIQUE INDEX UX_owner_test_slug ON tenants(slug) WHERE slug IS NOT NULL;
    ALTER TABLE tenant_memberships ADD createdat DATETIMEOFFSET,updatedat DATETIMEOFFSET;
    CREATE TABLE tenant_settings(tenant_id UNIQUEIDENTIFIER PRIMARY KEY,feature_flags_json NVARCHAR(MAX),createdat DATETIMEOFFSET,updatedat DATETIMEOFFSET);`);
  const actorId=crypto.randomUUID(),authId=crypto.randomUUID(),otherActor=crypto.randomUUID(),otherAuth=crypto.randomUUID();
  for(const [id,auth]of [[actorId,authId],[otherActor,otherAuth]]){
    await query(`INSERT INTO app_users(id,auth_id,email,status,role,user_type)VALUES(@id,@auth,'synthetic-'+CONVERT(NVARCHAR(36),@id)+'@example.test','active','authenticated','seeker');
      INSERT INTO auth_users(id,auth_id,app_user_id,email,role,metadata)SELECT NEWID(),@auth,id,email,'authenticated','{"global_email_verified":true}' FROM app_users WHERE id=@id;`,{id,auth});
  }
  const input={name:'Synthetic owner workspace',country:'BN',requestId:crypto.randomUUID()};
  const create=(actor=actorId,auth=authId,command=input)=>createOwnerTestingWorkspace({actorId:actor,authId:auth,input:command,getPool:async()=>pool});
  const results=await Promise.all(Array.from({length:4},()=>create()));
  assert.equal(new Set(results.map(x=>x.id.toLowerCase())).size,1,'Concurrent retries create exactly one organization');
  const id=results[0].id;
  const rows=await query(`SELECT t.status,t.[plan],m.app_user_id,m.role,m.is_default,s.feature_flags_json
    FROM tenants t JOIN tenant_memberships m ON m.tenant_id=t.id JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.id=@id`,{id});
  assert.equal(rows.length,1);assert.equal(rows[0].role,'admin');assert.equal(rows[0].plan,'development-testing');assert.equal(rows[0].is_default,false);
  assert.equal(rows[0].app_user_id.toLowerCase(),actorId);assert.equal(JSON.parse(rows[0].feature_flags_json).ownerSetup.country,'BN');
  assert.equal((await query('SELECT COUNT(*) n FROM tenant_memberships WHERE app_user_id=@actorId',{actorId}))[0].n,1);
  assert.equal((await query('SELECT role,tenant_id FROM app_users WHERE id=@actorId',{actorId}))[0].role,'authenticated','Never promotes the global identity');
  await assert.rejects(create(otherActor,otherAuth),{code:'OWNER_SETUP_CONFLICT'});
  await assert.rejects(create(actorId,otherAuth),{code:'OWNER_IDENTITY_REQUIRED'});
  await assert.rejects(create(actorId,authId,{...input,name:'Changed'}),{code:'OWNER_SETUP_CHANGED'});
  const before=(await query('SELECT COUNT(*) n FROM tenants'))[0].n;
  await pool.request().batch("CREATE TRIGGER owner_fixture_failure ON tenant_settings AFTER INSERT AS BEGIN THROW 51000,'Synthetic transactional failure',1; END;");
  await assert.rejects(create(actorId,authId,{...input,requestId:crypto.randomUUID()}));
  await pool.request().batch('DROP TRIGGER owner_fixture_failure;');
  assert.equal((await query('SELECT COUNT(*) n FROM tenants'))[0].n,before,'Partial workspace creation rolls back');
  console.log('OWNER_ONBOARDING_SQL=PASS concurrent_replay identity_binding own_membership no_global_promotion no_default_switch payload_conflict atomic_rollback');
};
