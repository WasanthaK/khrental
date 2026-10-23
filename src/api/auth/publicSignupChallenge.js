// B04 S3a: pure primitives; no endpoint is mounted and no signup feature is enabled.
// The raw token is returned to the caller for one-time email delivery only.
// Persist only the SHA-256 hash in the pending-verification table.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

export const createPublicSignupChallengeToken = () => {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashPublicSignupChallengeToken(token) };
};

export const hashPublicSignupChallengeToken = token => {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new TypeError('Invalid signup verification token');
  }
  return createHash('sha256').update(token, 'ascii').digest('hex');
};

export const verifyPublicSignupChallengeTokenHash = (token, tokenHash) => {
  if (typeof tokenHash !== 'string' || !HASH_PATTERN.test(tokenHash)) return false;
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return false;
  const actual = Buffer.from(hashPublicSignupChallengeToken(token), 'hex');
  return timingSafeEqual(actual, Buffer.from(tokenHash, 'hex'));
};
