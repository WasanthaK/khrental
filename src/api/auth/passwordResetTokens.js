import crypto from 'node:crypto';

export const DEFAULT_PASSWORD_RESET_TTL_MINUTES = 30;

export const normalizePasswordResetEmail = (email) => String(email || '').trim().toLowerCase();

export const generatePasswordResetToken = () => crypto.randomBytes(32).toString('base64url');

export const hashPasswordResetToken = (token) => crypto
  .createHash('sha256')
  .update(String(token || ''))
  .digest('hex');

export const createPasswordResetExpiry = (
  now = new Date(),
  ttlMinutes = DEFAULT_PASSWORD_RESET_TTL_MINUTES
) => {
  const normalizedTtlMinutes = Number.isFinite(Number(ttlMinutes))
    ? Math.max(5, Math.min(Number(ttlMinutes), 120))
    : DEFAULT_PASSWORD_RESET_TTL_MINUTES;

  return new Date(new Date(now).getTime() + normalizedTtlMinutes * 60 * 1000);
};

export const getPasswordResetState = (reset, now = new Date()) => {
  if (!reset) {
    return 'invalid';
  }

  if (reset.revoked_at || reset.revokedAt) {
    return 'revoked';
  }

  if (reset.used_at || reset.usedAt) {
    return 'used';
  }

  const expiresAt = reset.expires_at || reset.expiresAt;
  if (!expiresAt || new Date(expiresAt).getTime() <= new Date(now).getTime()) {
    return 'expired';
  }

  return 'valid';
};
