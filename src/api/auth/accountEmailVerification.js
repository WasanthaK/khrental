import crypto from 'node:crypto';
import express from 'express';
import {getMssqlPool, sql} from '../mssql/pool.js';
import {createPublicSignupChallengeToken, hashPublicSignupChallengeToken} from './publicSignupChallenge.js';
import {hashPublicSignupThrottleKey} from './publicSignupThrottleKey.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure = (status, code, message) => Object.assign(new Error(message), {status, code});
const invalid = () => failure(400, 'ACCOUNT_VERIFICATION_INVALID', 'This verification link is invalid, expired or already used. Return to property setup to request another link.');

// Reuse the hash-only challenge ledger, with a distinct purpose and binding to
// the persisted identity/email/credential. Neither signup nor another account
// can redeem this digest. A password or identity change invalidates the link.
export const hashAccountEmailToken = (token, record) => {
  hashPublicSignupChallengeToken(token);
  if (!UUID.test(record?.app_user_id || '') || !UUID.test(record?.auth_id || '') ||
      !UUID.test(record?.id || '') || typeof record.email !== 'string' ||
      !record.password_hash) {throw invalid();}
  return crypto.createHash('sha256').update(JSON.stringify([
    'quixo-existing-account-email-v1', record.id.toLowerCase(),
    record.app_user_id.toLowerCase(), record.auth_id.toLowerCase(),
    record.email.trim().toLowerCase(), record.password_hash,
    record.password_salt || '', record.password_algorithm || 'scrypt', token
  ])).digest('hex');
};

export const createAccountEmailVerificationStore = ({getPool = getMssqlPool} = {}) => {
  const transaction = async work => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    let active = false;
    const query = async (statement, params = {}) => {
      const request = new sql.Request(tx);
      for (const [key, value] of Object.entries(params)) {request.input(key, value);}
      return (await request.query(statement)).recordset || [];
    };
    try {
      await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE); active = true;
      const result = await work(query);
      await tx.commit(); active = false;
      return result;
    } catch (error) {
      if (active) {await tx.rollback().catch(() => {});}
      throw error;
    }
  };
  const identity = `SELECT auth.* FROM dbo.app_users au WITH(UPDLOCK,HOLDLOCK)
    INNER JOIN dbo.auth_users auth WITH(UPDLOCK,HOLDLOCK)
      ON auth.app_user_id=au.id AND auth.auth_id=au.auth_id
      AND LOWER(auth.email)=LOWER(au.email)
    WHERE LOWER(au.email)=@email AND au.status='active'`;
  return {
    async begin(record) {
      const email = String(record?.email || '').trim().toLowerCase();
      return transaction(async query => {
        const rows = await query(identity, {email});
        const current = rows[0];
        if (rows.length !== 1 || !UUID.test(record?.appUserId || '') ||
            current.app_user_id.toLowerCase() !== record.appUserId.toLowerCase() ||
            current.auth_id.toLowerCase() !== String(record.authId).toLowerCase()) {
          throw failure(403, 'ACCOUNT_IDENTITY_REQUIRED', 'We couldn’t confirm your account. Please sign in again.');
        }
        const recent = await query(`SELECT TOP 1 id FROM dbo.public_signup_challenges WITH(UPDLOCK,HOLDLOCK)
          WHERE email_normalized=@email AND issued_at>DATEADD(minute,-2,SYSUTCDATETIME())`, {email});
        if (recent.length) {return null;}
        const {token} = createPublicSignupChallengeToken();
        const tokenHash = hashAccountEmailToken(token, current);
        await query(`UPDATE dbo.public_signup_challenges SET revoked_at=SYSUTCDATETIME()
          WHERE email_normalized=@email AND consumed_at IS NULL AND revoked_at IS NULL`, {email});
        const [created] = await query(`INSERT INTO dbo.public_signup_challenges
          (email_normalized,display_name,token_hash,issued_at,expires_at)
          OUTPUT INSERTED.id VALUES(@email,N'Existing account verification',@tokenHash,
            SYSUTCDATETIME(),DATEADD(minute,30,SYSUTCDATETIME()))`, {email, tokenHash});
        return {challengeId: created.id, token, email};
      });
    },
    async redeem({token, challengeId, expectedEmail} = {}) {
      if (!UUID.test(challengeId || '')) {throw invalid();}
      try {hashPublicSignupChallengeToken(token);} catch {throw invalid();}
      // Resolve the email outside the write transaction, then lock identity
      // before challenge in the same order as issuance. Recheck everything.
      const pool = await getPool();
      const found = await pool.request().input('id', challengeId).query(
        'SELECT email_normalized FROM dbo.public_signup_challenges WHERE id=@id');
      const email = found.recordset?.[0]?.email_normalized;
      if (!email || (expectedEmail && email !== expectedEmail)) {throw invalid();}
      return transaction(async query => {
        const records = await query(identity, {email});
        if (records.length !== 1) {throw invalid();}
        const current = records[0];
        const digest = hashAccountEmailToken(token, current);
        const rows = await query(`SELECT id FROM dbo.public_signup_challenges WITH(UPDLOCK,HOLDLOCK)
          WHERE id=@id AND email_normalized=@email AND token_hash=@digest
            AND sent_at IS NOT NULL AND consumed_at IS NULL AND revoked_at IS NULL
            AND expires_at>SYSUTCDATETIME() AND issued_at>=CAST(@createdAt AS DATETIME2(3))`,
        {id: challengeId, email, digest, createdAt: current.createdat});
        if (rows.length !== 1) {throw invalid();}
        await query(`UPDATE dbo.auth_users SET metadata=JSON_MODIFY(
          CASE WHEN ISJSON(metadata)=1 THEN metadata ELSE N'{}' END,
          '$.global_email_verified',CAST(1 AS BIT)),updatedat=SYSUTCDATETIME()
          WHERE id=@id`, {id: current.id});
        await query(`UPDATE dbo.public_signup_challenges SET consumed_at=SYSUTCDATETIME()
          WHERE id=@id`, {id: challengeId});
        // No new identity, password, session, role or membership is issued.
        return {verified: true};
      });
    }
  };
};

export const createAccountEmailVerificationRouter = ({enabled, pilotEmail = null, authenticate, limiter,
  clientAddress, throttleSecret, mail, finishDelivery, store = createAccountEmailVerificationStore()} = {}) => {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!['/account-challenge', '/account-redeem'].includes(req.path)) {return next('router');}
    if (!enabled) {return res.status(404).json({error: 'Verification is unavailable.'});}
    if (!mail?.makeEmail || !mail?.sendEmail || limiter?.durable !== true ||
        typeof limiter?.consume !== 'function' || typeof clientAddress !== 'function' ||
        typeof authenticate !== 'function' || typeof finishDelivery !== 'function') {
      return res.status(503).json({error: 'Verification is temporarily unavailable. Please try again.'});
    }
    next();
  });
  const consume = async (req, scope, identifier, max) => {
    const address = clientAddress(req);
    if (!address) {throw failure(503, 'VERIFICATION_NOT_READY', 'Verification is temporarily unavailable.');}
    return limiter.consume({scope, key: hashPublicSignupThrottleKey({secret: throttleSecret,
      scope, identifier: identifier || address}), max, windowSeconds: 3600});
  };
  const respond = (res, error) => {
    // No raw SQL/provider errors, email, token, auth record or credentials.
    const expected = ['ACCOUNT_VERIFICATION_INVALID', 'ACCOUNT_IDENTITY_REQUIRED', 'VERIFICATION_NOT_READY'].includes(error?.code);
    res.status(expected ? error.status : 503).json({error: expected ? error.message :
      'Verification is temporarily unavailable. Please try again.', ...(expected ? {code: error.code} : {})});
  };
  router.post('/account-challenge', authenticate, async (req, res) => {
    try {
      const record = req.authSession?.record;
      if (!record?.appUserId) {return res.status(401).json({error: 'Please sign in to verify your email.'});}
      if (pilotEmail && String(record.email).trim().toLowerCase() !== pilotEmail) {
        return res.status(403).json({error: 'Account verification is unavailable for this account.'});
      }
      if (!['LK', 'BN'].includes(req.body?.country) || Object.keys(req.body || {}).some(k => k !== 'country')) {
        return res.status(400).json({error: 'Choose a property country.'});
      }
      if (!await consume(req, 'challenge-ip', null, 12) ||
          !await consume(req, 'challenge-email', String(record.email).trim().toLowerCase(), 4)) {
        return res.status(429).json({error: 'Too many requests. Please try again later.'});
      }
      const issued = await store.begin(record);
      if (!issued) {return res.status(429).json({error: 'Please wait two minutes before requesting another verification email.'});}
      let accepted = false;
      try {
        const result = await mail.sendEmail({to: issued.email, ...mail.makeEmail({token: issued.token,
          accountChallenge: issued.challengeId, ownerCountry: req.body.country})});
        accepted = result?.success === true && result?.simulated !== true;
      } catch { /* Revoke uncertain delivery; never log provider/recipient data. */ }
      const finalized = await finishDelivery({challengeId: issued.challengeId, providerAccepted: accepted});
      if (!accepted || !finalized) {
        return res.status(503).json({error: 'We couldn’t confirm sending your verification email. Please try again in two minutes.'});
      }
      res.json({data: {accepted: true, message: 'Verification email requested. Check your inbox and spam folder. Your workspace details are saved in this tab.'}});
    } catch (error) {respond(res, error);}
  });
  router.post('/account-redeem', async (req, res) => {
    try {
      if (!req.body || Object.keys(req.body).some(k => !['token', 'challengeId'].includes(k))) {throw invalid();}
      if (!await consume(req, 'redeem-ip', null, 12)) {
        return res.status(429).json({error: 'Too many requests. Please try again later.'});
      }
      res.json({data: await store.redeem({...req.body, ...(pilotEmail ? {expectedEmail: pilotEmail} : {})})});
    } catch (error) {respond(res, error);}
  });
  return router;
};
