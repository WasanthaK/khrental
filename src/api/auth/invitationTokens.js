import crypto from 'node:crypto';

export const DEFAULT_INVITATION_TTL_HOURS = 24;

export const normalizeInvitationEmail = (email) => String(email || '').trim().toLowerCase();

export const generateInvitationToken = () => crypto.randomBytes(32).toString('base64url');

export const hashInvitationToken = (token) => crypto
  .createHash('sha256')
  .update(String(token || ''))
  .digest('hex');

export const createInvitationExpiry = (
  now = new Date(),
  ttlHours = DEFAULT_INVITATION_TTL_HOURS
) => {
  const normalizedTtlHours = Number.isFinite(Number(ttlHours))
    ? Math.max(1, Math.min(Number(ttlHours), 168))
    : DEFAULT_INVITATION_TTL_HOURS;

  return new Date(new Date(now).getTime() + normalizedTtlHours * 60 * 60 * 1000);
};

export const getInvitationState = (invitation, now = new Date()) => {
  if (!invitation) {
    return 'invalid';
  }

  if (invitation.revoked_at || invitation.revokedAt) {
    return 'revoked';
  }

  if (invitation.accepted_at || invitation.acceptedAt) {
    return 'accepted';
  }

  const expiresAt = invitation.expires_at || invitation.expiresAt;
  if (!expiresAt || new Date(expiresAt).getTime() <= new Date(now).getTime()) {
    return 'expired';
  }

  return 'valid';
};

export const isInvitationUsable = (invitation, now = new Date()) => (
  getInvitationState(invitation, now) === 'valid'
);
