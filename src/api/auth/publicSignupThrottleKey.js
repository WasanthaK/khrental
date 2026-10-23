// B04 S3b2: pure privacy-preserving rate-limit key derivation.
// A later governed SQL-backed limiter must use these keys atomically.
// This module is NOT an in-memory or active HTTP rate limiter.
import { createHmac } from 'node:crypto';

const MIN_SECRET_LENGTH = 32;
const SCOPE_PATTERN = /^(challenge-email|challenge-ip|redeem-ip)$/;

export const hashPublicSignupThrottleKey = ({ secret, scope, identifier }) => {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_LENGTH) {
    throw new Error('PUBLIC_SIGNUP_THROTTLE_SECRET must be configured securely.');
  }
  if (typeof scope !== 'string' || !SCOPE_PATTERN.test(scope)) {
    throw new TypeError('Unknown public signup throttle scope.');
  }
  if (typeof identifier !== 'string' || identifier.length < 1 ||
      identifier.length > 320 || identifier !== identifier.trim() ||
      /[\r\n]/.test(identifier)) {
    throw new TypeError('Invalid public signup throttle identifier.');
  }
  const normalized = scope === 'challenge-email'
    ? identifier.toLowerCase()
    : identifier;
  return createHmac('sha256', secret)
    .update('quixo-public-signup-v1\0' + scope + '\0' + normalized, 'utf8')
    .digest('hex');
};
