// B04 S3b (foundation): redeem one verified email challenge into exactly one
// tenantless global seeker identity. NOT mounted by any public route.
import crypto from 'node:crypto';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { createPasswordCredential, ensureAuthSchema } from './index.js';
import { hashPublicSignupChallengeToken } from './publicSignupChallenge.js';

const fail = (status, code, message) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const request = (transaction, params = {}) => {
  const bound = new sql.Request(transaction);
  for (const [key, value] of Object.entries(params)) bound.input(key, value);
  return bound;
};

const unavailable = () => fail(400, 'SIGNUP_VERIFICATION_UNAVAILABLE',
  'This verification link is invalid, expired, or already used.');

const isUniqueConflict = error => [2601, 2627].includes(
  Number(error?.number ?? error?.originalError?.info?.number)
);

// Caller must establish the real user-facing verification flow and bounded
// abuse controls separately. This service never accepts a tenant, role,
// app-user ID, Stripe ID or organization ID from the browser.
export const redeemPublicSignupChallenge = async ({ token, password } = {}) => {
  let tokenHash;
  try {
    tokenHash = hashPublicSignupChallengeToken(token);
  } catch {
    throw unavailable();
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw fail(400, 'SIGNUP_PASSWORD_INVALID', 'Password length must be 12 to 256 characters.');
  }

  // Perform expensive scrypt BEFORE locking the challenge row.
  const credential = await createPasswordCredential(password);
  await ensureAuthSchema();
  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);
  const authId = crypto.randomUUID();
  let begun = false;

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    begun = true;

    const selected = await request(transaction, { tokenHash }).query(`
      SELECT TOP 1 id, email_normalized, display_name, expires_at,
        sent_at, consumed_at, revoked_at, verify_attempts
      FROM dbo.public_signup_challenges WITH (UPDLOCK, HOLDLOCK)
      WHERE token_hash = @tokenHash
    `);
    const challenge = selected.recordset?.[0];
    if (!challenge || !challenge.sent_at || challenge.consumed_at || challenge.revoked_at ||
        !challenge.expires_at || new Date(challenge.expires_at).getTime() <= Date.now() ||
        Number(challenge.verify_attempts) >= 10) {
      throw unavailable();
    }

    const email = String(challenge.email_normalized || '');
    const name = String(challenge.display_name || '').trim();
    if (!email || email !== email.trim().toLowerCase() || email.length > 320 ||
        !name || name.length > 255) {
      throw unavailable();
    }

    // Both registries must be empty. Never attach a password to a preexisting
    // unclaimed renter/invited app user even if there is no auth_users row.
    const appUserMatches = await request(transaction, { email }).query(`
      SELECT TOP 1 id FROM dbo.app_users WITH (UPDLOCK, HOLDLOCK)
      WHERE email = @email
    `);
    const authMatches = await request(transaction, { email }).query(`
      SELECT TOP 1 id FROM dbo.auth_users WITH (UPDLOCK, HOLDLOCK)
      WHERE email = @email
    `);
    if (appUserMatches.recordset?.length || authMatches.recordset?.length) {
      throw fail(409, 'SIGNUP_IDENTITY_ALREADY_EXISTS',
        'This address has an existing account or invitation. Use sign-in or the invitation workflow.');
    }

    const appCreated = await request(transaction, { authId, email, name }).query(`
      INSERT INTO dbo.app_users (
        tenant_id, auth_id, email, name, role, user_type, status, invited, active
      )
      OUTPUT INSERTED.id
      VALUES (
        NULL, @authId, @email, @name,
        N'authenticated', N'seeker', N'active', 0, 1
      )
    `);
    const appUserId = appCreated.recordset?.[0]?.id;
    if (!appUserId) {
      throw fail(503, 'SIGNUP_TRANSACTION_FAILED', 'Registration could not be completed.');
    }

    const metadata = JSON.stringify({
      name, role: 'authenticated', user_type: 'seeker',
      global_email_verified: true
    });
    const authCreated = await request(transaction, {
      authId, appUserId, email, metadata, ...credential
    }).query(`
      INSERT INTO dbo.auth_users (
        auth_id, app_user_id, email, password_hash, password_salt,
        password_algorithm, role, metadata
      )
      OUTPUT INSERTED.id
      VALUES (
        @authId, @appUserId, @email, @passwordHash, @passwordSalt,
        @passwordAlgorithm, N'authenticated', @metadata
      )
    `);
    if (authCreated.recordset?.length !== 1) {
      throw fail(503, 'SIGNUP_TRANSACTION_FAILED', 'Registration could not be completed.');
    }

    const consumed = await request(transaction, {
      challengeId: challenge.id
    }).query(`
      UPDATE dbo.public_signup_challenges
      SET consumed_at = SYSUTCDATETIME()
      WHERE id = @challengeId
        AND consumed_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > SYSUTCDATETIME()
        AND verify_attempts < 10
    `);
    if (consumed.rowsAffected?.[0] !== 1) throw unavailable();

    await transaction.commit();
    begun = false;

    return {
      appUserId,
      authId,
      email,
      role: 'authenticated',
      userType: 'seeker',
      tenantId: null
    };
  } catch (error) {
    if (begun) {
      try { await transaction.rollback(); } catch { /* SQL may have rolled back */ }
    }
    if (isUniqueConflict(error)) {
      throw fail(409, 'SIGNUP_IDENTITY_ALREADY_EXISTS',
        'This address has an existing account or invitation. Use sign-in or the invitation workflow.');
    }
    // Missing migration is an operator dependency. Never attempt automatic DDL.
    if (/invalid object name.*public_signup_challenges/i.test(String(error?.message || ''))) {
      throw fail(503, 'SIGNUP_SCHEMA_REQUIRED',
        'Public registration has not been enabled.');
    }
    throw error;
  }
};
