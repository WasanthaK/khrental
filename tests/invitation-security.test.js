import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInvitationExpiry,
  generateInvitationToken,
  getInvitationState,
  hashInvitationToken,
  isInvitationUsable,
  normalizeInvitationEmail
} from '../src/api/auth/invitationTokens.js';

test('invitation token is opaque, random and base64url-safe', () => {
  const first = generateInvitationToken();
  const second = generateInvitationToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.ok(first.length >= 43);
});

test('only the SHA-256 hash needs to be persisted', () => {
  const token = generateInvitationToken();
  const hash = hashInvitationToken(token);

  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, hashInvitationToken(token));
  assert.notEqual(hash, token);
});

test('normalizes invitation email before persistence and comparison', () => {
  assert.equal(normalizeInvitationEmail('  Person@Example.COM '), 'person@example.com');
});

test('default invitation expiry is 24 hours', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');
  assert.equal(
    createInvitationExpiry(now).toISOString(),
    '2026-09-16T10:00:00.000Z'
  );
});

test('invitation TTL is bounded to one hour through seven days', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');
  assert.equal(
    createInvitationExpiry(now, 0).toISOString(),
    '2026-09-15T11:00:00.000Z'
  );
  assert.equal(
    createInvitationExpiry(now, 999).toISOString(),
    '2026-09-22T10:00:00.000Z'
  );
});

test('invitation state rejects missing, revoked, accepted and expired records', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');

  assert.equal(getInvitationState(null, now), 'invalid');
  assert.equal(getInvitationState({ expires_at: '2026-09-16T10:00:00.000Z', revoked_at: now }, now), 'revoked');
  assert.equal(getInvitationState({ expires_at: '2026-09-16T10:00:00.000Z', accepted_at: now }, now), 'accepted');
  assert.equal(getInvitationState({ expires_at: '2026-09-15T09:59:59.000Z' }, now), 'expired');
});

test('only an unaccepted, unrevoked, unexpired invitation is usable', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');
  const invitation = { expires_at: '2026-09-15T11:00:00.000Z' };

  assert.equal(getInvitationState(invitation, now), 'valid');
  assert.equal(isInvitationUsable(invitation, now), true);
});
