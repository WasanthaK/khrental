import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPasswordResetExpiry,
  generatePasswordResetToken,
  getPasswordResetState,
  hashPasswordResetToken,
  normalizePasswordResetEmail
} from '../src/api/auth/passwordResetTokens.js';
import { isPublicCredentialRequest } from '../src/api/auth/index.js';
import { isPasswordRecoveryPath } from '../src/services/requestContext.js';

test('password reset token is opaque, random and base64url-safe', () => {
  const first = generatePasswordResetToken();
  const second = generatePasswordResetToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.ok(first.length >= 43);
});

test('password reset persistence uses only SHA-256 token hash', () => {
  const token = generatePasswordResetToken();
  const hash = hashPasswordResetToken(token);

  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, hashPasswordResetToken(token));
  assert.notEqual(hash, token);
});

test('normalizes password reset email', () => {
  assert.equal(normalizePasswordResetEmail('  Person@Example.COM '), 'person@example.com');
});

test('default password reset expiry is 30 minutes', () => {
  const now = new Date('2026-09-16T00:00:00.000Z');
  assert.equal(
    createPasswordResetExpiry(now).toISOString(),
    '2026-09-16T00:30:00.000Z'
  );
});

test('password reset TTL is bounded from five minutes through two hours', () => {
  const now = new Date('2026-09-16T00:00:00.000Z');
  assert.equal(
    createPasswordResetExpiry(now, 0).toISOString(),
    '2026-09-16T00:05:00.000Z'
  );
  assert.equal(
    createPasswordResetExpiry(now, 999).toISOString(),
    '2026-09-16T02:00:00.000Z'
  );
});

test('password reset state rejects missing, revoked, used and expired tokens', () => {
  const now = new Date('2026-09-16T00:00:00.000Z');

  assert.equal(getPasswordResetState(null, now), 'invalid');
  assert.equal(getPasswordResetState({ expires_at: '2026-09-16T01:00:00.000Z', revoked_at: now }, now), 'revoked');
  assert.equal(getPasswordResetState({ expires_at: '2026-09-16T01:00:00.000Z', used_at: now }, now), 'used');
  assert.equal(getPasswordResetState({ expires_at: '2026-09-15T23:59:59.000Z' }, now), 'expired');
});

test('unused, unrevoked, unexpired password reset token is valid', () => {
  const now = new Date('2026-09-16T00:00:00.000Z');
  assert.equal(
    getPasswordResetState({ expires_at: '2026-09-16T00:30:00.000Z' }, now),
    'valid'
  );
});

test('browser recovery route is identified independently of its token query', () => {
  assert.equal(isPasswordRecoveryPath('/reset-password'), true);
  assert.equal(isPasswordRecoveryPath('/reset-password/'), true);
  assert.equal(isPasswordRecoveryPath('/reset-password?token=opaque-token'), true);
  assert.equal(isPasswordRecoveryPath('/login'), false);
  assert.equal(isPasswordRecoveryPath('/dashboard'), false);
});

test('password recovery API endpoints are explicitly anonymous credential endpoints', () => {
  assert.equal(isPublicCredentialRequest({
    method: 'POST',
    originalUrl: '/api/platform/auth/reset-password',
    headers: { authorization: 'Bearer stale-token' }
  }), true);

  assert.equal(isPublicCredentialRequest({
    method: 'GET',
    originalUrl: '/api/platform/auth/reset-password/validate?token=opaque-token',
    headers: { authorization: 'Bearer stale-token' }
  }), true);

  assert.equal(isPublicCredentialRequest({
    method: 'POST',
    originalUrl: '/api/platform/auth/reset-password/redeem',
    headers: { authorization: 'Bearer stale-token' }
  }), true);
});

test('other credential establishment endpoints are public but protected APIs are not', () => {
  assert.equal(isPublicCredentialRequest({ method: 'POST', originalUrl: '/api/platform/auth/sign-in' }), true);
  assert.equal(isPublicCredentialRequest({ method: 'POST', originalUrl: '/api/platform/auth/sign-up' }), true);
  assert.equal(isPublicCredentialRequest({ method: 'GET', originalUrl: '/api/platform/auth/invitations/validate?token=x' }), true);
  assert.equal(isPublicCredentialRequest({ method: 'POST', originalUrl: '/api/platform/auth/invitations/redeem' }), true);

  assert.equal(isPublicCredentialRequest({ method: 'GET', originalUrl: '/api/platform/auth/context' }), false);
  assert.equal(isPublicCredentialRequest({ method: 'POST', originalUrl: '/api/platform/query' }), false);
  assert.equal(isPublicCredentialRequest({ method: 'POST', originalUrl: '/api/platform/auth/invite' }), false);
});
