import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {isPlatformAdmin} from '../src/api/mssql/platformAdminRouter.js';
import {createSqlPublicSignupLimiter} from '../src/api/auth/publicSignupSqlLimiter.js';

// Called only inside the mandatory disposable Docker SQL acceptance harness.
// Mailbox proof below is a synthetic SQL fixture, never genuine inbox receipt.
export const verifySecurityReviewSql = async pool => {
  assert.equal(pool.config.server,'127.0.0.1');
  const query=async(statement,params={})=>{
    const request=pool.request();for(const [k,v] of Object.entries(params)){request.input(k,v);}
    return (await request.query(statement)).recordset||[];
  };
  const one=async(statement,params)=>(await query(statement,params))[0]||null;
  await pool.request().batch(fs.readFileSync('migrations/20260920_02_create_platform_admins.sql','utf8'));
  const id=crypto.randomUUID(),authId=crypto.randomUUID(),authRow=crypto.randomUUID(),challenge=crypto.randomUUID();
  const email=`security-${crypto.randomBytes(8).toString('hex')}@example.invalid`;
  const key=crypto.randomBytes(32).toString('hex');
  const credentialKey=crypto.createHash('sha256').update('credential-fixture'+key).digest('hex');
  const params={id,authId,authRow,email,challenge,key,credentialKey,tokenHash:crypto.randomBytes(32).toString('hex')};
  const user={id,auth_id:authId,email};
  const check=()=>isPlatformAdmin(user,{query:one,env:{PLATFORM_BOOTSTRAP_OWNER_EMAIL:email}});
  try{
    await query(`INSERT INTO dbo.app_users(id,auth_id,email,name,role,user_type,status)
      VALUES(@id,@authId,@email,N'Synthetic security fixture',N'authenticated',N'seeker',N'active');
      INSERT INTO dbo.auth_users(id,auth_id,app_user_id,email,password_hash,password_algorithm,metadata)
      VALUES(@authRow,@authId,@id,@email,N'not-a-real-credential',N'scrypt',N'{}');
      INSERT INTO dbo.platform_admins(app_user_id,status) VALUES(@id,N'active');`,params);
    assert.equal(await check(),false,'Email-only registry seed cannot authorize an unverified account');
    await query(`UPDATE dbo.auth_users SET metadata=N'{"global_email_verified":true}' WHERE id=@authRow`,params);
    assert.equal(await check(),false,'An old forged verification flag without consumed mail evidence is insufficient');
    await query(`INSERT INTO dbo.public_signup_challenges
      (id,email_normalized,display_name,token_hash,issued_at,expires_at,sent_at,consumed_at)
      VALUES(@challenge,@email,N'Synthetic security proof',@tokenHash,SYSUTCDATETIME(),
        DATEADD(hour,1,SYSUTCDATETIME()),SYSUTCDATETIME(),SYSUTCDATETIME())`,params);
    assert.equal(await check(),true,'Bound persisted verification and active registry permit platform access');
    await query("UPDATE dbo.platform_admins SET status='revoked' WHERE app_user_id=@id",params);
    assert.equal(await check(),false,'Configured bootstrap cannot override a revoked registry');
    await query('DELETE FROM dbo.platform_admins WHERE app_user_id=@id',params);
    assert.equal(await check(),true,'Explicit configured bootstrap works only after bound verification');
    // Construct the valid revoked/unconsumed fixture state. Production's
    // finished-once constraint correctly forbids consumed AND revoked.
    await query('UPDATE dbo.public_signup_challenges SET consumed_at=NULL,revoked_at=SYSUTCDATETIME() WHERE id=@challenge',params);
    assert.equal(await check(),false,'Revoked proof cannot authorize bootstrap');
    const limiter=createSqlPublicSignupLimiter({getPool:async()=>pool});
    const results=await Promise.all(Array.from({length:12},()=>limiter.consume({scope:'manual-email-user',key,max:5,windowSeconds:60})));
    assert.equal(results.filter(Boolean).length,5,'Shared SQL quota admits exactly five concurrent sends across callers');
    assert.equal(await limiter.consume({scope:'manual-email-user',key,max:5,windowSeconds:60}),false);
    const credentialResults=await Promise.all(Array.from({length:16},()=>limiter.consume({scope:'credential-signin-email',key:credentialKey,max:10,windowSeconds:900})));
    assert.equal(credentialResults.filter(Boolean).length,10,'Shared SQL admits exactly ten concurrent credential attempts');
    console.log('PASS: real SQL verified platform authority, historical/forged email denial, revoked bootstrap denial and atomic concurrent manual-email (5) and credential (10) quotas; synthetic mailbox proof');
  }finally{
    await query(`DELETE FROM dbo.public_signup_rate_limits WHERE bucket_hash IN (@key,@credentialKey);
      DELETE FROM dbo.public_signup_challenges WHERE id=@challenge;
      DELETE FROM dbo.platform_admins WHERE app_user_id=@id;
      DELETE FROM dbo.auth_users WHERE id=@authRow;
      DELETE FROM dbo.app_users WHERE id=@id;`,params);
  }
};
