import { runSingleQuery } from '../mssql/query.js';

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const normalizeId = (value) => String(value || '').trim().toLowerCase();
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const parseMetadata = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return {};
  }
};

const isAuthRegistrationStructurallyComplete = ({ user, auth }) => Boolean(
  user?.id &&
  user?.auth_id &&
  auth?.id &&
  auth?.auth_id &&
  auth?.app_user_id &&
  auth?.has_credential &&
  normalizeId(user.auth_id) === normalizeId(auth.auth_id) &&
  normalizeId(user.id) === normalizeId(auth.app_user_id) &&
  normalizeEmail(user.email) === normalizeEmail(auth.email)
);

const isAuthRegistrationComplete = ({ user, auth }) => {
  if (!isAuthRegistrationStructurallyComplete({ user, auth })) return false;

  const metadata = parseMetadata(auth.metadata);
  return Boolean(
    auth.last_login_at ||
    metadata.invitation_registration_verified === true
  );
};

const deriveInvitationStatus = ({ user, auth = null, invitation, now = new Date() }) => {
  if (isAuthRegistrationComplete({ user, auth })) return 'registered';

  // An accepted invitation or partial/unverified auth linkage is evidence that
  // setup was attempted, but it must never be presented as Registered until
  // account access has actually been verified by the server.
  if (invitation?.accepted_at || user?.auth_id || auth?.id) return 'setup_incomplete';

  if (!invitation) return 'not_invited';
  if (invitation.revoked_at) return 'revoked';
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'pending';
};

/**
 * Read-only projection of the invitation ledger for UI/status use.
 * Deliberately excludes invitation token material, password material and
 * message content. Registration is complete only when the app-user/auth-user
 * linkage is valid and account access has been verified by invitation setup or
 * a successful login.
 */
export const getCanonicalInvitationStatus = async ({ tenantId, appUserId, now = new Date() }) => {
  if (!tenantId || !appUserId) return null;

  const user = await runSingleQuery(`
    SELECT TOP 1
      au.id,
      au.email,
      au.auth_id
    FROM dbo.app_users au
    LEFT JOIN dbo.tenant_memberships tm
      ON tm.tenant_id = @tenantId
     AND tm.app_user_id = au.id
    WHERE au.id = @appUserId
      AND (au.tenant_id = @tenantId OR tm.id IS NOT NULL)
  `, { tenantId, appUserId });

  if (!user) return null;

  const auth = await runSingleQuery(`
    SELECT TOP 1
      a.id,
      a.auth_id,
      a.app_user_id,
      a.email,
      a.metadata,
      a.last_login_at,
      CASE
        WHEN a.password_hash IS NULL OR LTRIM(RTRIM(a.password_hash)) = '' THEN 0
        WHEN a.password_algorithm IS NULL OR LTRIM(RTRIM(a.password_algorithm)) = '' THEN 0
        WHEN LOWER(a.password_algorithm) = 'legacy-sha256' THEN 1
        WHEN a.password_salt IS NULL OR LTRIM(RTRIM(a.password_salt)) = '' THEN 0
        ELSE 1
      END AS has_credential
    FROM dbo.auth_users a
    WHERE a.app_user_id = @appUserId
       OR (@authId IS NOT NULL AND a.auth_id = @authId)
       OR LOWER(a.email) = LOWER(@email)
    ORDER BY
      CASE
        WHEN a.app_user_id = @appUserId THEN 0
        WHEN @authId IS NOT NULL AND a.auth_id = @authId THEN 1
        ELSE 2
      END,
      a.createdat DESC
  `, {
    appUserId,
    authId: user.auth_id || null,
    email: user.email
  });

  const invitation = await runSingleQuery(`
    SELECT TOP 1
      i.id,
      i.createdat,
      i.expires_at,
      i.accepted_at,
      i.revoked_at
    FROM dbo.user_invitations i
    WHERE i.tenant_id = @tenantId
      AND i.app_user_id = @appUserId
    ORDER BY i.createdat DESC, i.id DESC
  `, { tenantId, appUserId });

  const authStructureComplete = isAuthRegistrationStructurallyComplete({ user, auth });
  const registrationComplete = isAuthRegistrationComplete({ user, auth });
  const status = deriveInvitationStatus({ user, auth, invitation, now });

  return {
    id: user.id,
    email: user.email,
    auth_id: user.auth_id || null,
    invited: Boolean(invitation),
    status,
    authStructureComplete,
    registrationComplete,
    invitationId: invitation?.id || null,
    invitedAt: invitation?.createdat || null,
    expiresAt: invitation?.expires_at || null,
    acceptedAt: invitation?.accepted_at || null,
    revokedAt: invitation?.revoked_at || null
  };
};

export const invitationStatusInternals = {
  deriveInvitationStatus,
  isAuthRegistrationComplete,
  isAuthRegistrationStructurallyComplete,
  normalizeStatus
};
