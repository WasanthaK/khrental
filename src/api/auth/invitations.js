import crypto from 'node:crypto';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import {
  createPasswordCredential,
  ensureAuthSchema,
  findAuthRecordByEmail
} from './index.js';
import {
  createInvitationExpiry,
  generateInvitationToken,
  getInvitationState,
  hashInvitationToken,
  normalizeInvitationEmail
} from './invitationTokens.js';

const createInvitationError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const normalizeRole = (value) => String(value || '').trim().toLowerCase();
const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const requireInvitationSchema = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes("invalid object name 'dbo.user_invitations'") || message.includes("invalid object name 'user_invitations'")) {
    throw createInvitationError(
      503,
      'Secure invitation storage is not available. Apply the Stage 3A invitation migration first.',
      'INVITATION_SCHEMA_REQUIRED'
    );
  }
  throw error;
};

const loadInvitationTarget = async (tenantId, appUserId) => {
  return runSingleQuery(`
    SELECT TOP 1
      au.id,
      au.tenant_id,
      au.auth_id,
      au.email,
      au.name,
      au.role AS app_user_role,
      au.user_type,
      au.status AS app_user_status,
      tm.id AS membership_id,
      tm.role AS membership_role,
      tm.status AS membership_status
    FROM dbo.app_users au
    LEFT JOIN dbo.tenant_memberships tm
      ON tm.tenant_id = @tenantId
     AND tm.app_user_id = au.id
    WHERE au.id = @appUserId
      AND (au.tenant_id = @tenantId OR tm.id IS NOT NULL)
  `, { tenantId, appUserId });
};

const deriveInvitationRole = (target) => {
  const membershipRole = normalizeRole(target?.membership_role);
  if (membershipRole) {
    return membershipRole;
  }
  return normalizeRole(target?.app_user_role || target?.user_type || 'rentee');
};

const validateTargetForInvitation = async (target) => {
  if (!target) {
    throw createInvitationError(404, 'The invitation target was not found in the active organization.', 'INVITATION_TARGET_NOT_FOUND');
  }

  if (normalizeStatus(target.app_user_status || 'active') !== 'active') {
    throw createInvitationError(409, 'The invitation target is not active.', 'INVITATION_TARGET_INACTIVE');
  }

  if (target.membership_id && normalizeStatus(target.membership_status || 'active') !== 'active') {
    throw createInvitationError(409, 'The target membership is inactive and must be reviewed before inviting.', 'INVITATION_MEMBERSHIP_INACTIVE');
  }

  if (target.auth_id) {
    throw createInvitationError(409, 'This user already has a linked account.', 'ACCOUNT_ALREADY_CLAIMED');
  }

  const existingAuth = await runSingleQuery(`
    SELECT TOP 1 id
    FROM dbo.auth_users
    WHERE app_user_id = @appUserId
       OR email = @email
  `, {
    appUserId: target.id,
    email: normalizeInvitationEmail(target.email)
  });

  if (existingAuth) {
    throw createInvitationError(409, 'This user already has an authentication account.', 'ACCOUNT_ALREADY_CLAIMED');
  }
};

export const createUserInvitation = async ({
  tenantId,
  appUserId,
  createdBy = null,
  ttlHours = 24
}) => {
  if (!tenantId || !appUserId) {
    throw createInvitationError(400, 'tenantId and appUserId are required.', 'INVITATION_TARGET_REQUIRED');
  }

  await ensureAuthSchema();
  const target = await loadInvitationTarget(tenantId, appUserId);
  await validateTargetForInvitation(target);

  const email = normalizeInvitationEmail(target.email);
  const intendedRole = deriveInvitationRole(target);
  const userType = intendedRole === 'rentee'
    ? 'rentee'
    : normalizeRole(target.user_type || 'staff');
  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = createInvitationExpiry(new Date(), ttlHours);

  try {
    await runQuery(`
      UPDATE dbo.user_invitations
      SET revoked_at = SYSUTCDATETIME(),
          updatedat = SYSUTCDATETIME()
      WHERE tenant_id = @tenantId
        AND app_user_id = @appUserId
        AND accepted_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > SYSUTCDATETIME();

      INSERT INTO dbo.user_invitations (
        tenant_id,
        app_user_id,
        email,
        intended_role,
        user_type,
        token_hash,
        expires_at,
        created_by
      )
      VALUES (
        @tenantId,
        @appUserId,
        @email,
        @intendedRole,
        @userType,
        @tokenHash,
        @expiresAt,
        @createdBy
      );

      UPDATE dbo.app_users
      SET invited = 1,
          updatedat = SYSUTCDATETIME()
      WHERE id = @appUserId;
    `, {
      tenantId,
      appUserId,
      email,
      intendedRole,
      userType,
      tokenHash,
      expiresAt,
      createdBy
    });
  } catch (error) {
    requireInvitationSchema(error);
  }

  return {
    token: rawToken,
    expiresAt,
    target: {
      appUserId: target.id,
      email,
      name: target.name,
      intendedRole,
      userType
    }
  };
};

const loadInvitationByToken = async (token) => {
  if (!token) {
    return null;
  }

  try {
    return await runSingleQuery(`
      SELECT TOP 1
        i.id,
        i.tenant_id,
        i.app_user_id,
        i.email AS invitation_email,
        i.intended_role,
        i.user_type AS invitation_user_type,
        i.expires_at,
        i.accepted_at,
        i.revoked_at,
        au.tenant_id AS app_user_tenant_id,
        au.email AS current_email,
        au.name AS app_user_name,
        au.auth_id,
        au.role AS app_user_role,
        au.user_type AS app_user_type,
        au.status AS app_user_status,
        tm.id AS membership_id,
        tm.role AS membership_role,
        tm.status AS membership_status,
        t.name AS tenant_name
      FROM dbo.user_invitations i
      INNER JOIN dbo.app_users au
        ON au.id = i.app_user_id
      INNER JOIN dbo.tenants t
        ON t.id = i.tenant_id
      LEFT JOIN dbo.tenant_memberships tm
        ON tm.tenant_id = i.tenant_id
       AND tm.app_user_id = i.app_user_id
      WHERE i.token_hash = @tokenHash
    `, { tokenHash: hashInvitationToken(token) });
  } catch (error) {
    requireInvitationSchema(error);
  }
};

const getInvitationAvailability = (row, now = new Date()) => {
  const state = getInvitationState(row, now);
  if (state !== 'valid') {
    return state;
  }

  if (normalizeInvitationEmail(row.invitation_email) !== normalizeInvitationEmail(row.current_email)) {
    return 'stale';
  }

  if (normalizeStatus(row.app_user_status || 'active') !== 'active' || row.auth_id) {
    return 'unavailable';
  }

  if (row.membership_id) {
    if (normalizeStatus(row.membership_status || 'active') !== 'active') {
      return 'unavailable';
    }
    if (normalizeRole(row.membership_role) !== normalizeRole(row.intended_role)) {
      return 'stale';
    }
  } else {
    if (String(row.app_user_tenant_id || '') !== String(row.tenant_id || '')) {
      return 'unavailable';
    }
    if (normalizeRole(row.app_user_role) !== normalizeRole(row.intended_role)) {
      return 'stale';
    }
  }

  return 'valid';
};

export const validateUserInvitation = async (token) => {
  const row = await loadInvitationByToken(token);
  const state = getInvitationAvailability(row);

  if (!row || state !== 'valid') {
    return { valid: false, state };
  }

  return {
    valid: true,
    state: 'valid',
    invitation: {
      name: row.app_user_name,
      email: normalizeInvitationEmail(row.invitation_email),
      intendedRole: normalizeRole(row.intended_role),
      userType: normalizeRole(row.invitation_user_type),
      tenantName: row.tenant_name,
      expiresAt: row.expires_at
    }
  };
};

const bindTransactionParams = (request, params = {}) => {
  Object.entries(params).forEach(([key, value]) => request.input(key, value));
  return request;
};

export const redeemUserInvitation = async ({ token, password }) => {
  if (!token) {
    throw createInvitationError(400, 'Invitation token is required.', 'INVITATION_TOKEN_REQUIRED');
  }

  if (String(password || '').length < 8) {
    throw createInvitationError(400, 'Password must be at least 8 characters long.', 'PASSWORD_TOO_SHORT');
  }

  await ensureAuthSchema();
  const credential = await createPasswordCredential(password);
  const authId = crypto.randomUUID();
  const tokenHash = hashInvitationToken(token);
  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const lockedResult = await bindTransactionParams(new sql.Request(transaction), { tokenHash }).query(`
      SELECT TOP 1
        i.id,
        i.tenant_id,
        i.app_user_id,
        i.email AS invitation_email,
        i.intended_role,
        i.user_type AS invitation_user_type,
        i.expires_at,
        i.accepted_at,
        i.revoked_at,
        au.tenant_id AS app_user_tenant_id,
        au.email AS current_email,
        au.name AS app_user_name,
        au.auth_id,
        au.role AS app_user_role,
        au.user_type AS app_user_type,
        au.status AS app_user_status,
        tm.id AS membership_id,
        tm.role AS membership_role,
        tm.status AS membership_status
      FROM dbo.user_invitations i WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN dbo.app_users au WITH (UPDLOCK, HOLDLOCK)
        ON au.id = i.app_user_id
      LEFT JOIN dbo.tenant_memberships tm
        ON tm.tenant_id = i.tenant_id
       AND tm.app_user_id = i.app_user_id
      WHERE i.token_hash = @tokenHash
    `);

    const invitation = lockedResult.recordset?.[0] || null;
    const state = getInvitationAvailability(invitation);
    if (state !== 'valid') {
      throw createInvitationError(
        400,
        state === 'expired'
          ? 'This invitation has expired.'
          : state === 'accepted'
            ? 'This invitation has already been used.'
            : state === 'revoked'
              ? 'This invitation has been revoked.'
              : 'This invitation is no longer valid.',
        state === 'expired'
          ? 'INVITATION_EXPIRED'
          : state === 'accepted'
            ? 'INVITATION_ALREADY_ACCEPTED'
            : state === 'revoked'
              ? 'INVITATION_REVOKED'
              : 'INVITATION_INVALID'
      );
    }

    const email = normalizeInvitationEmail(invitation.invitation_email);
    const intendedRole = normalizeRole(invitation.intended_role);
    const userType = normalizeRole(invitation.invitation_user_type);

    const existingAuthResult = await bindTransactionParams(new sql.Request(transaction), {
      email,
      appUserId: invitation.app_user_id
    }).query(`
      SELECT TOP 1 id
      FROM dbo.auth_users WITH (UPDLOCK, HOLDLOCK)
      WHERE email = @email
         OR app_user_id = @appUserId
    `);

    if (existingAuthResult.recordset?.length) {
      throw createInvitationError(409, 'This account has already been claimed.', 'ACCOUNT_ALREADY_CLAIMED');
    }

    const metadata = JSON.stringify({
      name: invitation.app_user_name,
      role: intendedRole,
      user_type: userType,
      invited: true
    });

    await bindTransactionParams(new sql.Request(transaction), {
      authId,
      appUserId: invitation.app_user_id,
      email,
      role: intendedRole,
      metadata,
      passwordHash: credential.passwordHash,
      passwordSalt: credential.passwordSalt,
      passwordAlgorithm: credential.passwordAlgorithm
    }).query(`
      INSERT INTO dbo.auth_users (
        auth_id,
        app_user_id,
        email,
        password_hash,
        password_salt,
        password_algorithm,
        role,
        metadata
      )
      VALUES (
        @authId,
        @appUserId,
        @email,
        @passwordHash,
        @passwordSalt,
        @passwordAlgorithm,
        @role,
        @metadata
      );
    `);

    if (!invitation.membership_id) {
      await bindTransactionParams(new sql.Request(transaction), {
        tenantId: invitation.tenant_id,
        appUserId: invitation.app_user_id,
        role: intendedRole
      }).query(`
        UPDATE dbo.tenant_memberships
        SET is_default = 0,
            updatedat = SYSUTCDATETIME()
        WHERE app_user_id = @appUserId;

        INSERT INTO dbo.tenant_memberships (
          id,
          tenant_id,
          app_user_id,
          role,
          status,
          is_default,
          createdat,
          updatedat
        )
        VALUES (
          NEWID(),
          @tenantId,
          @appUserId,
          @role,
          'active',
          1,
          SYSUTCDATETIME(),
          SYSUTCDATETIME()
        );
      `);
    }

    await bindTransactionParams(new sql.Request(transaction), {
      appUserId: invitation.app_user_id,
      authId,
      invitationId: invitation.id
    }).query(`
      UPDATE dbo.app_users
      SET auth_id = @authId,
          invited = 1,
          updatedat = SYSUTCDATETIME()
      WHERE id = @appUserId
        AND auth_id IS NULL;

      IF @@ROWCOUNT <> 1
        THROW 51001, 'The invitation target was claimed concurrently.', 1;

      UPDATE dbo.user_invitations
      SET accepted_at = SYSUTCDATETIME(),
          updatedat = SYSUTCDATETIME()
      WHERE id = @invitationId
        AND accepted_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > SYSUTCDATETIME();

      IF @@ROWCOUNT <> 1
        THROW 51002, 'The invitation was redeemed concurrently.', 1;
    `);

    await transaction.commit();

    const record = await findAuthRecordByEmail(email);
    if (!record) {
      throw createInvitationError(500, 'The account was created but could not be loaded.', 'INVITATION_ACCOUNT_LOAD_FAILED');
    }

    return {
      record,
      invitation: {
        tenantId: invitation.tenant_id,
        appUserId: invitation.app_user_id,
        intendedRole,
        userType
      }
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (_rollbackError) {
      // The transaction may already be closed after a database-level failure.
    }

    requireInvitationSchema(error);
  }
};

export const publicSignupRequiresInvitation = (existingAppUser) => Boolean(existingAppUser);
