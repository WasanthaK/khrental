import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createOwnerTestingWorkspace,saveOwnerProgress,getOwnerOnboardingContext} from '../src/api/platform/ownerOnboarding.js';

export const verifyOwnerOnboarding=async({pool,query})=>{
  // Match existing production foundation columns; no production schema mutation.
  await pool.request().batch(`ALTER TABLE tenants ADD name NVARCHAR(200),slug NVARCHAR(200),[plan] NVARCHAR(50),createdat DATETIMEOFFSET,updatedat DATETIMEOFFSET;`);
  await pool.request().batch(`CREATE UNIQUE INDEX UX_owner_test_slug ON tenants(slug) WHERE slug IS NOT NULL;
    ALTER TABLE tenant_memberships ADD createdat DATETIMEOFFSET,updatedat DATETIMEOFFSET;
    ALTER TABLE auth_users ADD createdat DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
    CREATE TABLE tenant_settings(tenant_id UNIQUEIDENTIFIER PRIMARY KEY,feature_flags_json NVARCHAR(MAX),createdat DATETIMEOFFSET,updatedat DATETIMEOFFSET);
    CREATE TABLE public_signup_challenges(email_normalized NVARCHAR(320),sent_at DATETIME2(3),consumed_at DATETIME2(3),revoked_at DATETIME2(3));
    CREATE TABLE user_invitations(app_user_id UNIQUEIDENTIFIER,email NVARCHAR(320),accepted_at DATETIME2,revoked_at DATETIME2);`);
  const actorId=crypto.randomUUID(),authId=crypto.randomUUID(),otherActor=crypto.randomUUID(),otherAuth=crypto.randomUUID();
  for(const [id,auth]of [[actorId,authId],[otherActor,otherAuth]]){
    await query(`INSERT INTO app_users(id,auth_id,email,status,role,user_type)VALUES(@id,@auth,'synthetic-'+CONVERT(NVARCHAR(36),@id)+'@example.test','active','authenticated','seeker');
      INSERT INTO auth_users(id,auth_id,app_user_id,email,role,metadata)SELECT NEWID(),@auth,id,email,'authenticated','{"global_email_verified":true}' FROM app_users WHERE id=@id;`,{id,auth});
    await query(`INSERT INTO public_signup_challenges(email_normalized,sent_at,consumed_at)
      SELECT LOWER(email),SYSUTCDATETIME(),SYSUTCDATETIME() FROM app_users WHERE id=@id`,{id});
  }
  const input={name:'Synthetic owner workspace',country:'BN',requestId:crypto.randomUUID()};
  const persisted=(await query('SELECT * FROM auth_users WHERE auth_id=@authId',{authId}))[0];
  const record={id:persisted.id,authId,appUserId:actorId,email:persisted.email};
  const user={id:actorId,auth_id:authId,email:persisted.email};
  await saveOwnerProgress({record,input,query});
  const readRecord=async()=>({...record,metadata:JSON.parse((await query('SELECT metadata FROM auth_users WHERE id=@id',{id:record.id}))[0].metadata)});
  assert.equal((await getOwnerOnboardingContext({record:await readRecord(),user,tenantContext:{memberships:[]},query})).name,input.name,'A fresh server read restores the owner draft');
  assert.equal((await readRecord()).metadata.global_email_verified,true,'Draft update preserves verification metadata');
  const create=(actor=actorId,auth=authId,command=input)=>createOwnerTestingWorkspace({actorId:actor,authId:auth,input:command,getPool:async()=>pool});
  const results=await Promise.all(Array.from({length:4},()=>create()));
  assert.equal(new Set(results.map(x=>x.id.toLowerCase())).size,1,'Concurrent retries create exactly one organization');
  const id=results[0].id;
  const tenantContext={tenantId:id,membership:{tenant_id:id,role:'admin',status:'active'}};
  assert.equal((await getOwnerOnboardingContext({record:await readRecord(),user,tenantContext,query})).step,'property');
  await query('INSERT INTO properties(id,tenant_id)VALUES(NEWID(),@id)',{id});
  assert.equal((await getOwnerOnboardingContext({record:await readRecord(),user,tenantContext,query})).step,'complete','Existing properties complete first-property continuation');
  const rows=await query(`SELECT t.status,t.[plan],m.app_user_id,m.role,m.is_default,s.feature_flags_json
    FROM tenants t JOIN tenant_memberships m ON m.tenant_id=t.id JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.id=@id`,{id});
  assert.equal(rows.length,1);assert.equal(rows[0].role,'admin');assert.equal(rows[0].plan,'development-testing');assert.equal(rows[0].is_default,false);
  assert.equal(rows[0].app_user_id.toLowerCase(),actorId);assert.equal(JSON.parse(rows[0].feature_flags_json).ownerSetup.country,'BN');
  assert.equal((await query('SELECT COUNT(*) n FROM tenant_memberships WHERE app_user_id=@actorId',{actorId}))[0].n,1);
  assert.equal((await query('SELECT role,tenant_id FROM app_users WHERE id=@actorId',{actorId}))[0].role,'authenticated','Never promotes the global identity');
  await assert.rejects(create(otherActor,otherAuth),{code:'OWNER_SETUP_CONFLICT'});
  await assert.rejects(create(actorId,otherAuth),{code:'OWNER_IDENTITY_REQUIRED'});
  await assert.rejects(create(actorId,authId,{...input,name:'Changed'}),{code:'OWNER_SETUP_CHANGED'});
  await query('UPDATE public_signup_challenges SET consumed_at=NULL WHERE email_normalized=(SELECT LOWER(email) FROM app_users WHERE id=@id)',{id:otherActor});
  await assert.rejects(create(otherActor,otherAuth,{...input,requestId:crypto.randomUUID()}),{code:'OWNER_VERIFICATION_REQUIRED'});
  await query("UPDATE public_signup_challenges SET consumed_at='2001-01-01' WHERE email_normalized=(SELECT LOWER(email) FROM app_users WHERE id=@id)",{id:otherActor});
  await assert.rejects(create(otherActor,otherAuth,{...input,requestId:crypto.randomUUID()}),{code:'OWNER_VERIFICATION_REQUIRED'});
  await query('DELETE FROM public_signup_challenges WHERE email_normalized=(SELECT LOWER(email) FROM app_users WHERE id=@id)',{id:otherActor});
  await query('INSERT INTO user_invitations(app_user_id,email,accepted_at) SELECT id,email,SYSUTCDATETIME() FROM app_users WHERE id=@id',{id:otherActor});
  assert.equal((await create(otherActor,otherAuth,{...input,requestId:crypto.randomUUID()})).testing,true,'Accepted invitation for this credential can establish verified ownership');
  const before=(await query('SELECT COUNT(*) n FROM tenants'))[0].n;
  await pool.request().batch("CREATE TRIGGER owner_fixture_failure ON tenant_settings AFTER INSERT AS BEGIN THROW 51000,'Synthetic transactional failure',1; END;");
  await assert.rejects(create(actorId,authId,{...input,requestId:crypto.randomUUID()}));
  await pool.request().batch('DROP TRIGGER owner_fixture_failure;');
  assert.equal((await query('SELECT COUNT(*) n FROM tenants'))[0].n,before,'Partial workspace creation rolls back');
  console.log('OWNER_ONBOARDING_SQL=PASS concurrent_replay identity_binding durable_verification no_metadata_only_claim no_prior_credential_reuse accepted_invitation own_membership no_global_promotion no_default_switch payload_conflict atomic_rollback');
};
