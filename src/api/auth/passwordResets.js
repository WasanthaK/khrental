import { getMssqlPool, sql } from '../mssql/pool.js';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import {
  createPasswordCredential,
  ensureAuthSchema,
  findAuthRecordByEmail
} from './index.js';
import {
  createPasswordResetExpiry,
  generatePasswordResetToken,
  getPasswordResetState,
  hashPasswordResetToken,
  normalizePasswordResetEmail
} from './passwordResetTokens.js';

const createPasswordResetError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const requirePasswordResetSchema = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes("invalid object name 'dbo.password_reset_tokens'") || message.includes("invalid object name 'password_reset_tokens'")) {
    throw createPasswordResetError(
      503,
      'Password recovery storage is not available. Apply the password reset migration first.',
      'PASSWORD_RESET_SCHEMA_REQUIRED'
    );
  }
  throw error;
};

export const createPasswordResetRequest = async ({ email, ttlMinutes = 30 }) => {
  const normalizedEmail = normalizePasswordResetEmail(email);
  if (!normalizedEmail) {
    throw createPasswordResetError(400, 'Email is required.', 'PASSWORD_RESET_EMAIL_REQUIRED');
  }

  await ensureAuthSchema();
  const record = await findAuthRecordByEmail(normalizedEmail);

  // Deliberately do not reveal whether the account exists.
  if (!record) {
    return { requested: true, accountFound: false };
  }

  const token = generatePasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = createPasswordResetExpiry(new Date(), ttlMinutes);

  try {
    await runQuery(`
      UPDATE dbo.password_reset_tokens
      SET revoked_at = SYSUTCDATETIME(),
          updatedat = SYSUTCDATETIME()
      WHERE auth_user_id = @authUserId
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > SYSUTCDATETIME();

      INSERT INTO dbo.password_reset_tokens (
        auth_user_id,
        email,
        token_hash,
        expires_at
      )
      VALUES (
        @authUserId,
        @email,
        @tokenHash,
        @expiresAt
      );
    `, {
      authUserId: record.id,
      email: normalizedEmail,
      tokenHash,
      expiresAt
    });
  } catch (error) {
    requirePasswordResetSchema(error);
  }

  return {
    requested: true,
    accountFound: true,
    token,
    expiresAt,
    email: normalizedEmail
  };
};

export const revokePasswordResetToken = async (token) => {
  if (!token) return;
  try {
    await runQuery(`
      UPDATE dbo.password_reset_tokens
      SET revoked_at = COALESCE(revoked_at, SYSUTCDATETIME()),
          updatedat = SYSUTCDATETIME()
      WHERE token_hash = @tokenHash
        AND used_at IS NULL;
    `, { tokenHash: hashPasswordResetToken(token) });
  } catch (error) {
    requirePasswordResetSchema(error);
  }
};

const loadResetByToken = async (token) => {
  if (!token) return null;

  try {
    return await runSingleQuery(`
      SELECT TOP 1
        pr.id,
        pr.auth_user_id,
        pr.email AS reset_email,
        pr.expires_at,
        pr.used_at,
        pr.revoked_at,
        au.email AS current_email
      FROM dbo.password_reset_tokens pr
      INNER JOIN dbo.auth_users au
        ON au.id = pr.auth_user_id
      WHERE pr.token_hash = @tokenHash
    `, { tokenHash: hashPasswordResetToken(token) });
  } catch (error) {
    requirePasswordResetSchema(error);
  }
};

export const validatePasswordResetToken = async (token) => {
  const row = await loadResetByToken(token);
  const state = getPasswordResetState(row);

  if (!row || state !== 'valid') {
    return { valid: false, state };
  }

  if (normalizePasswordResetEmail(row.reset_email) !== normalizePasswordResetEmail(row.current_email)) {
    return { valid: false, state: 'stale' };
  }

  return {
    valid: true,
    state: 'valid',
    reset: {
      email: normalizePasswordResetEmail(row.reset_email),
      expiresAt: row.expires_at
    }
  };
};

const bindTransactionParams = (request, params = {}) => {
  Object.entries(params).forEach(([key, value]) => request.input(key, value));
  return request;
};

export const redeemPasswordReset = async ({ token, password }) => {
  if (!token) {
    throw createPasswordResetError(400, 'Password reset token is required.', 'PASSWORD_RESET_TOKEN_REQUIRED');
  }

  if (String(password || '').length < 8) {
    throw createPasswordResetError(400, 'Password must be at least 8 characters long.', 'PASSWORD_TOO_SHORT');
  }

  await ensureAuthSchema();
  const credential = await createPasswordCredential(password);
  const tokenHash = hashPasswordResetToken(token);
  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const lockedResult = await bindTransactionParams(new sql.Request(transaction), { tokenHash }).query(`
      SELECT TOP 1
        pr.id,
        pr.auth_user_id,
        pr.email AS reset_email,
        pr.expires_at,
        pr.used_at,
        pr.revoked_at,
        au.email AS current_email
      FROM dbo.password_reset_tokens pr WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN dbo.auth_users au WITH (UPDLOCK, HOLDLOCK)
        ON au.id = pr.auth_user_id
      WHERE pr.token_hash = @tokenHash
    `);

    const reset = lockedResult.recordset?.[0] || null;
    const state = getPasswordResetState(reset);

    if (!reset || state !== 'valid') {
      throw createPasswordResetError(
        400,
        state === 'expired'
          ? 'This password reset link has expired.'
          : state === 'used'
            ? 'This password reset link has already been used.'
            : state === 'revoked'
              ? 'This password reset link has been replaced by a newer request.'
              : 'This password reset link is invalid.',
        state === 'expired'
          ? 'PASSWORD_RESET_EXPIRED'
          : state === 'used'
            ? 'PASSWORD_RESET_USED'
            : state === 'revoked'
              ? 'PASSWORD_RESET_REVOKED'
              : 'PASSWORD_RESET_INVALID'
      );
    }

    if (normalizePasswordResetEmail(reset.reset_email) !== normalizePasswordResetEmail(reset.current_email)) {
      throw createPasswordResetError(400, 'This password reset link is no longer valid.', 'PASSWORD_RESET_STALE');
    }

    await bindTransactionParams(new sql.Request(transaction), {
      authUserId: reset.auth_user_id,
      passwordHash: credential.passwordHash,
      passwordSalt: credential.passwordSalt,
      passwordAlgorithm: credential.passwordAlgorithm,
      resetId: reset.id
    }).query(`
      UPDATE dbo.auth_users
      SET password_hash = @passwordHash,
          password_salt = @passwordSalt,
          password_algorithm = @passwordAlgorithm,
          updatedat = SYSUTCDATETIME()
      WHERE id = @authUserId;

      IF @@ROWCOUNT <> 1
        THROW 51021, 'The authentication account could not be updated.', 1;

      UPDATE dbo.password_reset_tokens
      SET used_at = SYSUTCDATETIME(),
          updatedat = SYSUTCDATETIME()
      WHERE id = @resetId
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > SYSUTCDATETIME();

      IF @@ROWCOUNT <> 1
        THROW 51022, 'The password reset token was used concurrently.', 1;

      UPDATE dbo.password_reset_tokens
      SET revoked_at = SYSUTCDATETIME(),
          updatedat = SYSUTCDATETIME()
      WHERE auth_user_id = @authUserId
        AND id <> @resetId
        AND used_at IS NULL
        AND revoked_at IS NULL;

      UPDATE dbo.auth_sessions
      SET revoked_at = COALESCE(revoked_at, SYSUTCDATETIME())
      WHERE auth_user_id = @authUserId;
    `);

    await transaction.commit();

    return {
      success: true,
      email: normalizePasswordResetEmail(reset.reset_email)
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (_rollbackError) {
      // Transaction may already be closed after a database-level failure.
    }

    requirePasswordResetSchema(error);
  }
};
