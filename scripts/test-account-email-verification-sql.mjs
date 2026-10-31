import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {createAccountEmailVerificationStore} from '../src/api/auth/accountEmailVerification.js';
import {createOwnerTestingWorkspace} from '../src/api/platform/ownerOnboarding.js';

export const verifyAccountEmailVerification=async({pool,query})=>{
  // Previous owner fixture uses only a partial ledger. Replace it in this
  // disposable database with the EXACT already-deployed migration.
  await pool.request().batch('DROP TABLE dbo.public_signup_challenges;');
  await pool.request().batch(await fs.readFile(new URL('../migrations/20261023_01_create_public_signup_challenges.sql',import.meta.url),'utf8'));
  await pool.request().batch(`ALTER TABLE auth_users ADD password_hash NVARCHAR(256),password_salt NVARCHAR(128),password_algorithm NVARCHAR(32),updatedat DATETIME2;`);
  const appUserId=crypto.randomUUID(),authId=crypto.randomUUID(),authRow=crypto.randomUUID();
  const email='synthetic-existing-'+appUserId+'@example.test';
  await query(`INSERT app_users(id,auth_id,email,name,role,user_type,status) VALUES(@appUserId,@authId,@email,N'Synthetic existing owner','admin','admin','active');
    INSERT auth_users(id,auth_id,app_user_id,email,role,metadata,password_hash,password_salt,password_algorithm)
    VALUES(@authRow,@authId,@appUserId,@email,'admin',N'{"existingPreference":"kept"}','synthetic-credential','synthetic-salt','scrypt');`,{appUserId,authId,authRow,email});
  const store=createAccountEmailVerificationStore({getPool:async()=>pool});
  const record={appUserId,authId,email};
  const issue=async()=>{
    await query('UPDATE public_signup_challenges SET issued_at=DATEADD(minute,-3,SYSUTCDATETIME()) WHERE email_normalized=@email',{email});
    return store.begin(record);
  };
  const accepted=async value=>query('UPDATE public_signup_challenges SET sent_at=SYSUTCDATETIME(),send_count=1 WHERE id=@id',{id:value.challengeId});
  const before=(await query('SELECT password_hash,password_salt,password_algorithm,role,auth_id,app_user_id,email FROM auth_users WHERE id=@id',{id:authRow}))[0];
  const first=await issue();assert.ok(first?.token);assert.equal(await store.begin(record),null,'Cooldown cannot send again');
  await assert.rejects(store.begin({...record,appUserId:crypto.randomUUID()}),{code:'ACCOUNT_IDENTITY_REQUIRED'});
  await assert.rejects(store.redeem(first),{code:'ACCOUNT_VERIFICATION_INVALID'},'Unsent proof is denied');
  await accepted(first);
  await assert.rejects(store.redeem({...first,expectedEmail:'other@example.test'}),{code:'ACCOUNT_VERIFICATION_INVALID'});
  const second=await issue();await accepted(second);
  await assert.rejects(store.redeem(first),{code:'ACCOUNT_VERIFICATION_INVALID'},'Resend invalidates old token');
  const attempts=await Promise.allSettled(Array.from({length:4},()=>store.redeem(second)));
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1,'Concurrent redemption consumes exactly once');
  assert.deepEqual((await query('SELECT password_hash,password_salt,password_algorithm,role,auth_id,app_user_id,email FROM auth_users WHERE id=@id',{id:authRow}))[0],before);
  const metadata=JSON.parse((await query('SELECT metadata FROM auth_users WHERE id=@id',{id:authRow}))[0].metadata);
  assert.equal(metadata.global_email_verified,true);assert.equal(metadata.existingPreference,'kept');
  assert.equal((await query('SELECT COUNT(*) n FROM tenant_memberships WHERE app_user_id=@appUserId',{appUserId}))[0].n,0);
  const workspace=await createOwnerTestingWorkspace({actorId:appUserId,authId,
    input:{name:'Verified existing owner workspace',country:'LK',requestId:crypto.randomUUID()},getPool:async()=>pool});
  assert.equal(workspace.testing,true,'Durable existing-account verification supports the real owner store');
  assert.equal((await query('SELECT role FROM app_users WHERE id=@appUserId',{appUserId}))[0].role,'admin');
  const changed=await issue();await accepted(changed);
  await query("UPDATE auth_users SET password_hash='changed-synthetic-credential' WHERE id=@id",{id:authRow});
  await assert.rejects(store.redeem(changed),{code:'ACCOUNT_VERIFICATION_INVALID'},'Changed credential invalidates proof');
  const expired=await issue();await accepted(expired);
  await query('UPDATE public_signup_challenges SET expires_at=DATEADD(minute,-1,SYSUTCDATETIME()),issued_at=DATEADD(minute,-3,SYSUTCDATETIME()) WHERE id=@id',{id:expired.challengeId});
  await assert.rejects(store.redeem(expired),{code:'ACCOUNT_VERIFICATION_INVALID'});
  const rollback=await issue();await accepted(rollback);
  await query("UPDATE auth_users SET metadata=N'{}' WHERE id=@id",{id:authRow});
  await pool.request().batch("CREATE TRIGGER account_verification_failure ON auth_users AFTER UPDATE AS BEGIN THROW 51000,'Synthetic verification rollback',1; END;");
  await assert.rejects(store.redeem(rollback));
  await pool.request().batch('DROP TRIGGER account_verification_failure;');
  assert.equal((await query('SELECT consumed_at FROM public_signup_challenges WHERE id=@id',{id:rollback.challengeId}))[0].consumed_at,null);
  assert.equal((await query('SELECT metadata FROM auth_users WHERE id=@id',{id:authRow}))[0].metadata,'{}');
  assert.deepEqual(await store.redeem(rollback),{verified:true},'Retry after rolled-back failure is safe');
  console.log('ACCOUNT_EMAIL_VERIFICATION_SQL=PASS exact_ledger reciprocal_identity cooldown resend_revocation concurrent_single_use current_credential expired_unsent_denial atomic_rollback no_password_role_membership_changes');
};
