// B04 S3b2: server-only pending seeker verification challenge lifecycle.
// NOT mounted to a public route. The mandatory shared IP/email rate limiter and
// approved SendGrid provider adapter must precede exposing this service.
import { getMssqlPool, sql } from '../mssql/pool.js';
import { ensureAuthSchema } from './index.js';
import { createPublicSignupChallengeToken } from './publicSignupChallenge.js';

const fail = (code) => Object.assign(new Error('Signup verification is not available.'), {
  code, status: 503
});

const bind = (tx, values) => {
  const q = new sql.Request(tx);
  for (const [key, value] of Object.entries(values)) q.input(key, value);
  return q;
};

export const normalizePublicSignupDetails = ({ email, name } = {}) => {
  if (typeof email !== 'string' || typeof name !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  const displayName = name.trim();
  if (normalized.length < 6 || normalized.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
      displayName.length < 1 || displayName.length > 255 ||
      /[\x00-\x1f\x7f]/.test(displayName)) return null;
  return { email: normalized, name: displayName };
};

// Caller must return a uniform public response regardless of whether this
// returned a challenge. No email or user/account information may be logged.
// Null means an existing identity, invalid details or an issuance cooldown.
export const beginPublicSignupChallenge = async ({ email, name } = {}) => {
  const normalized = normalizePublicSignupDetails({ email, name });
  if (!normalized) return null;
  const { token, tokenHash } = createPublicSignupChallengeToken();
  await ensureAuthSchema();
  const pool = await getMssqlPool();
  const tx = new sql.Transaction(pool);
  let begun = false;
  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    begun = true;
    const values = { email: normalized.email };
    const app = await bind(tx, values).query(`
      SELECT TOP 1 id FROM dbo.app_users WITH (UPDLOCK, HOLDLOCK)
      WHERE email = @email
    `);
    const auth = await bind(tx, values).query(`
      SELECT TOP 1 id FROM dbo.auth_users WITH (UPDLOCK, HOLDLOCK)
      WHERE email = @email
    `);
    if (app.recordset?.length || auth.recordset?.length) {
      await tx.commit();
      begun = false;
      return null;
    }

    // This per-email cooldown is defense in depth only. It is NOT the shared
    // IP/identity rate limiter required at the public request boundary.
    const recent = await bind(tx, values).query(`
      SELECT TOP 1 id FROM dbo.public_signup_challenges WITH (UPDLOCK, HOLDLOCK)
      WHERE email_normalized = @email
        AND issued_at > DATEADD(minute, -2, SYSUTCDATETIME())
      ORDER BY issued_at DESC
    `);
    if (recent.recordset?.length) {
      await tx.commit();
      begun = false;
      return null;
    }

    await bind(tx, values).query(`
      UPDATE dbo.public_signup_challenges
      SET revoked_at = SYSUTCDATETIME()
      WHERE email_normalized = @email
        AND consumed_at IS NULL
        AND revoked_at IS NULL
    `);
    const created = await bind(tx, {
      ...values, name: normalized.name, tokenHash
    }).query(`
      INSERT INTO dbo.public_signup_challenges
        (email_normalized, display_name, token_hash, issued_at, expires_at)
      OUTPUT INSERTED.id, INSERTED.expires_at
      VALUES (@email, @name, @tokenHash, SYSUTCDATETIME(),
        DATEADD(minute, 30, SYSUTCDATETIME()))
    `);
    const row = created.recordset?.[0];
    if (!row?.id) throw fail('SIGNUP_CHALLENGE_CREATE_FAILED');
    await tx.commit();
    begun = false;
    return {
      challengeId: row.id,
      token, email: normalized.email,
      expiresAt: row.expires_at
    };
  } catch (error) {
    if (begun) {
      try { await tx.rollback(); } catch { /* failure already rolled back */ }
    }
    if (/invalid object name.*public_signup_challenges/i.test(String(error?.message || ''))) {
      throw fail('SIGNUP_SCHEMA_REQUIRED');
    }
    throw error;
  }
};

// Stripe-style provider acceptance is not delivery. Mark an email as
// provider-accepted only after the sender returns an acknowledged result;
// revoke on failure/unknown result so ambiguous requests cannot be redeemed.
// No raw token is persisted by this function.
export const completePublicSignupChallengeDelivery = async ({
  challengeId, providerAccepted
} = {}) => {
  if (typeof challengeId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)) {
    throw new TypeError('Valid challenge identifier is required.');
  }
  if (providerAccepted !== true && providerAccepted !== false) {
    throw new TypeError('Email provider acceptance status is required.');
  }
  const pool = await getMssqlPool();
  const result = await pool.request().input('challengeId', challengeId)
    .input('accepted', providerAccepted).query(`
      UPDATE dbo.public_signup_challenges
      SET sent_at = CASE WHEN @accepted = 1 THEN SYSUTCDATETIME() ELSE NULL END,
          send_count = CASE WHEN @accepted = 1 THEN send_count + 1 ELSE send_count END,
          revoked_at = CASE WHEN @accepted = 0 THEN SYSUTCDATETIME() ELSE revoked_at END
      WHERE id = @challengeId
        AND sent_at IS NULL
        AND consumed_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > SYSUTCDATETIME()
        AND send_count < 100
    `);
  return result.rowsAffected?.[0] === 1;
};
