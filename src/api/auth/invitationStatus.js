import { runSingleQuery } from '../mssql/query.js';

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const deriveInvitationStatus = ({ user, invitation, now = new Date() }) => {
  if (user?.auth_id || invitation?.accepted_at) return 'registered';
  if (!invitation) return 'not_invited';
  if (invitation.revoked_at) return 'revoked';
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'pending';
};

/**
 * Read-only projection of the invitation ledger for UI/status use.
 * Deliberately excludes token_hash and all message content.
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

  const status = deriveInvitationStatus({ user, invitation, now });

  return {
    id: user.id,
    email: user.email,
    auth_id: user.auth_id || null,
    invited: Boolean(invitation),
    status,
    invitationId: invitation?.id || null,
    invitedAt: invitation?.createdat || null,
    expiresAt: invitation?.expires_at || null,
    acceptedAt: invitation?.accepted_at || null,
    revokedAt: invitation?.revoked_at || null
  };
};

export const invitationStatusInternals = {
  deriveInvitationStatus,
  normalizeStatus
};
