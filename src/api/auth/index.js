import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { runQuery, runSingleQuery } from '../mssql/query.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_DAYS = Math.max(Number(process.env.AUTH_SESSION_TTL_DAYS) || 30, 1);
const PASSWORD_KEY_LENGTH = 64;
let schemaPromise = null;

const parseMetadata = (value) => {
  if (!value) {
    return {};
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return {};
  }
};

const mapAuthRecord = (row) => row ? ({
  id: row.id,
  authId: row.auth_id,
  appUserId: row.app_user_id || null,
  email: row.email,
  passwordHash: row.password_hash,
  passwordSalt: row.password_salt || null,
  passwordAlgorithm: row.password_algorithm || 'scrypt',
  role: row.role || 'authenticated',
  metadata: parseMetadata(row.metadata),
  createdAt: row.createdat,
  updatedAt: row.updatedat,
  lastLoginAt: row.last_login_at || null
}) : null;

export const ensureAuthSchema = async () => {
  if (!schemaPromise) {
    schemaPromise = runQuery(`
      IF OBJECT_ID('dbo.auth_users', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.auth_users (
          id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_auth_users PRIMARY KEY DEFAULT NEWID(),
          auth_id UNIQUEIDENTIFIER NOT NULL,
          app_user_id UNIQUEIDENTIFIER NULL,
          email NVARCHAR(320) NOT NULL,
          password_hash NVARCHAR(256) NOT NULL,
          password_salt NVARCHAR(128) NULL,
          password_algorithm NVARCHAR(32) NOT NULL CONSTRAINT DF_auth_users_password_algorithm DEFAULT 'scrypt',
          role NVARCHAR(64) NOT NULL CONSTRAINT DF_auth_users_role DEFAULT 'authenticated',
          metadata NVARCHAR(MAX) NULL,
          createdat DATETIME2 NOT NULL CONSTRAINT DF_auth_users_createdat DEFAULT SYSUTCDATETIME(),
          updatedat DATETIME2 NOT NULL CONSTRAINT DF_auth_users_updatedat DEFAULT SYSUTCDATETIME(),
          last_login_at DATETIME2 NULL,
          CONSTRAINT UQ_auth_users_auth_id UNIQUE (auth_id),
          CONSTRAINT UQ_auth_users_email UNIQUE (email)
        );
      END;

      IF OBJECT_ID('dbo.auth_sessions', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.auth_sessions (
          id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_auth_sessions PRIMARY KEY DEFAULT NEWID(),
          auth_user_id UNIQUEIDENTIFIER NOT NULL,
          token_hash CHAR(64) NOT NULL,
          expires_at DATETIME2 NOT NULL,
          createdat DATETIME2 NOT NULL CONSTRAINT DF_auth_sessions_createdat DEFAULT SYSUTCDATETIME(),
          last_seen_at DATETIME2 NULL,
          revoked_at DATETIME2 NULL,
          CONSTRAINT UQ_auth_sessions_token_hash UNIQUE (token_hash),
          CONSTRAINT FK_auth_sessions_auth_users FOREIGN KEY (auth_user_id)
            REFERENCES dbo.auth_users(id) ON DELETE CASCADE
        );
        CREATE INDEX IX_auth_sessions_active
          ON dbo.auth_sessions(token_hash, expires_at, revoked_at);
      END;
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
};

export const createPasswordCredential = async (password) => {
  const normalizedPassword = String(password || '');
  if (!normalizedPassword) {
    throw new Error('Password is required.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scrypt(normalizedPassword, salt, PASSWORD_KEY_LENGTH);
  return {
    passwordHash: Buffer.from(derivedKey).toString('hex'),
    passwordSalt: salt,
    passwordAlgorithm: 'scrypt'
  };
};

export const verifyPasswordCredential = async (record, password) => {
  if (!record?.passwordHash) {
    return false;
  }

  if (record.passwordAlgorithm === 'legacy-sha256') {
    const candidate = crypto.createHash('sha256').update(String(password || '')).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(record.passwordHash, 'hex'));
  }

  if (!record.passwordSalt) {
    return false;
  }
  const candidate = Buffer.from(await scrypt(String(password || ''), record.passwordSalt, PASSWORD_KEY_LENGTH));
  const expected = Buffer.from(record.passwordHash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
};

export const findAuthRecordByEmail = async (email) => {
  await ensureAuthSchema();
  const row = await runSingleQuery(
    'SELECT TOP 1 * FROM dbo.auth_users WHERE email = @email',
    { email: String(email || '').trim().toLowerCase() }
  );
  return mapAuthRecord(row);
};

export const findAuthRecordByAuthId = async (authId) => {
  await ensureAuthSchema();
  const row = await runSingleQuery(
    'SELECT TOP 1 * FROM dbo.auth_users WHERE auth_id = @authId',
    { authId }
  );
  return mapAuthRecord(row);
};

export const createAuthRecord = async ({ authId, appUserId, email, role, metadata, password }) => {
  await ensureAuthSchema();
  const credential = await createPasswordCredential(password);
  const rows = await runQuery(`
    INSERT INTO dbo.auth_users (
      auth_id, app_user_id, email, password_hash, password_salt, password_algorithm, role, metadata
    )
    OUTPUT INSERTED.*
    VALUES (
      @authId, @appUserId, @email, @passwordHash, @passwordSalt, @passwordAlgorithm, @role, @metadata
    )
  `, {
    authId,
    appUserId: appUserId || null,
    email: String(email || '').trim().toLowerCase(),
    role: role || 'authenticated',
    metadata: JSON.stringify(metadata || {}),
    ...credential
  });
  return mapAuthRecord(rows[0]);
};

export const updateAuthRecord = async (record, { password, metadata, appUserId } = {}) => {
  await ensureAuthSchema();
  const updates = [];
  const params = { id: record.id };

  if (password) {
    Object.assign(params, await createPasswordCredential(password));
    updates.push('password_hash = @passwordHash', 'password_salt = @passwordSalt', 'password_algorithm = @passwordAlgorithm');
  }
  if (metadata && typeof metadata === 'object') {
    params.metadata = JSON.stringify({ ...(record.metadata || {}), ...metadata });
    updates.push('metadata = @metadata');
  }
  if (appUserId !== undefined) {
    params.appUserId = appUserId || null;
    updates.push('app_user_id = @appUserId');
  }
  if (updates.length === 0) {
    return record;
  }

  updates.push('updatedat = SYSUTCDATETIME()');
  const rows = await runQuery(
    `UPDATE dbo.auth_users SET ${updates.join(', ')} OUTPUT INSERTED.* WHERE id = @id`,
    params
  );
  return mapAuthRecord(rows[0]);
};

const hashAccessToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

export const issueAuthSession = async (record) => {
  await ensureAuthSchema();
  const accessToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await runQuery(`
    INSERT INTO dbo.auth_sessions (auth_user_id, token_hash, expires_at)
    VALUES (@authUserId, @tokenHash, @expiresAt)
  `, {
    authUserId: record.id,
    tokenHash: hashAccessToken(accessToken),
    expiresAt
  });

  return { accessToken, expiresAt };
};

export const authenticateAccessToken = async (accessToken) => {
  if (!accessToken) {
    return null;
  }
  await ensureAuthSchema();

  const row = await runSingleQuery(`
    SELECT TOP 1
      u.*,
      s.id AS session_id,
      s.expires_at AS session_expires_at
    FROM dbo.auth_sessions s
    INNER JOIN dbo.auth_users u ON u.id = s.auth_user_id
    WHERE s.token_hash = @tokenHash
      AND s.revoked_at IS NULL
      AND s.expires_at > SYSUTCDATETIME()
  `, { tokenHash: hashAccessToken(accessToken) });

  if (!row) {
    return null;
  }
  await runQuery(
    'UPDATE dbo.auth_sessions SET last_seen_at = SYSUTCDATETIME() WHERE id = @sessionId',
    { sessionId: row.session_id }
  );
  return {
    record: mapAuthRecord(row),
    sessionId: row.session_id,
    expiresAt: row.session_expires_at
  };
};

export const markSuccessfulLogin = async (record) => {
  await ensureAuthSchema();
  await runQuery(
    'UPDATE dbo.auth_users SET last_login_at = SYSUTCDATETIME(), updatedat = SYSUTCDATETIME() WHERE id = @id',
    { id: record.id }
  );
};

export const revokeAccessToken = async (accessToken) => {
  if (!accessToken) {
    return;
  }
  await ensureAuthSchema();
  await runQuery(
    'UPDATE dbo.auth_sessions SET revoked_at = SYSUTCDATETIME() WHERE token_hash = @tokenHash AND revoked_at IS NULL',
    { tokenHash: hashAccessToken(accessToken) }
  );
};

export const extractBearerToken = (req) => {
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const extractStorageCookieToken = (req) => {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.find((cookie) => cookie.trim().startsWith('khrental_storage_session='));
  return entry ? decodeURIComponent(entry.trim().slice('khrental_storage_session='.length)) : null;
};

export const setStorageSessionCookie = (res, session) => {
  const maxAge = Math.max(Number(session?.expires_at) - Math.floor(Date.now() / 1000), 0);
  const parts = [
    `khrental_storage_session=${encodeURIComponent(session?.access_token || '')}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/storage',
    `Max-Age=${maxAge}`
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  res.append('Set-Cookie', parts.join('; '));
};

export const clearStorageSessionCookie = (res) => {
  const parts = ['khrental_storage_session=', 'HttpOnly', 'SameSite=Strict', 'Path=/storage', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  res.append('Set-Cookie', parts.join('; '));
};

const PUBLIC_CREDENTIAL_ENDPOINTS = new Set([
  'POST /api/platform/auth/sign-in',
  'POST /api/platform/auth/sign-up',
  'POST /api/platform/auth/reset-password',
  'GET /api/platform/auth/reset-password/validate',
  'POST /api/platform/auth/reset-password/redeem',
  'GET /api/platform/auth/invitations/validate',
  'POST /api/platform/auth/invitations/redeem'
]);

const normalizeRequestPath = (req) => String(req?.originalUrl || req?.url || req?.path || '')
  .split('?')[0]
  .replace(/\/+$/, '') || '/';

export const isPublicCredentialRequest = (req) => {
  const method = String(req?.method || 'GET').toUpperCase();
  return PUBLIC_CREDENTIAL_ENDPOINTS.has(`${method} ${normalizeRequestPath(req)}`);
};

export const createSessionAuthMiddleware = ({ allowStorageCookie = false } = {}) => async (req, res, next) => {
  try {
    // Credential-establishment and recovery endpoints are intentionally
    // anonymous. An expired/stale Authorization header must never prevent a
    // user from signing in, registering, redeeming an invitation, or resetting
    // a password. Authentication/authorization remains mandatory on all other
    // routes through their normal guards.
    if (isPublicCredentialRequest(req)) {
      next();
      return;
    }

    const accessToken = extractBearerToken(req) || (allowStorageCookie ? extractStorageCookieToken(req) : null);
    if (!accessToken) {
      next();
      return;
    }

    const authenticated = await authenticateAccessToken(accessToken);
    if (!authenticated) {
      res.status(401).json({ error: 'The session is invalid or expired.', code: 'INVALID_SESSION' });
      return;
    }

    req.authSession = { ...authenticated, accessToken };
    req.authIdentity = {
      authId: authenticated.record.authId,
      userId: authenticated.record.appUserId,
      email: authenticated.record.email
    };
    next();
  } catch (error) {
    next(error);
  }
};