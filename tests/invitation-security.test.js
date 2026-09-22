import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicSignupRequiresInvitation } from '../src/api/auth/invitations.js';
import { invitationStatusInternals } from '../src/api/auth/invitationStatus.js';
import {
  buildEmailDeliveryLog,
  sendViaSendGrid
} from '../src/api/email/sendGridDelivery.js';
import {
  createInvitationExpiry,
  generateInvitationToken,
  getInvitationState,
  hashInvitationToken,
  isInvitationUsable,
  normalizeInvitationEmail
} from '../src/api/auth/invitationTokens.js';

const invitationServiceSource = readFileSync(
  new URL('../src/services/invitationService.js', import.meta.url),
  'utf8'
);
const invitationStatusSource = readFileSync(
  new URL('../src/api/auth/invitationStatus.js', import.meta.url),
  'utf8'
);
const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

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
  assert.equal(createInvitationExpiry(now).toISOString(), '2026-09-16T10:00:00.000Z');
});

test('invitation TTL is bounded to one hour through seven days', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');
  assert.equal(createInvitationExpiry(now, 0).toISOString(), '2026-09-15T11:00:00.000Z');
  assert.equal(createInvitationExpiry(now, 999).toISOString(), '2026-09-22T10:00:00.000Z');
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

test('normal public signup must not claim an existing app-user record', () => {
  assert.equal(publicSignupRequiresInvitation(null), false);
  assert.equal(publicSignupRequiresInvitation(undefined), false);
  assert.equal(publicSignupRequiresInvitation({ id: 'existing-app-user' }), true);
});

test('shared invitation service uses explicit KH Rentals APIs without compatibility fallback', () => {
  assert.doesNotMatch(invitationServiceSource, /platformClient/);
  assert.doesNotMatch(invitationServiceSource, /isMssqlApiEnabled/);
  assert.doesNotMatch(invitationServiceSource, /appUserService/);
  assert.match(invitationServiceSource, /\/api\/platform\/auth\/invite/);
  assert.match(invitationServiceSource, /\/api\/mssql\/app-users\/\$\{encodeURIComponent\(userId\)\}/);
});

test('canonical invitation status distinguishes pending, expired, revoked and registered', () => {
  const now = new Date('2026-09-22T00:00:00.000Z');
  const derive = invitationStatusInternals.deriveInvitationStatus;
  assert.equal(derive({ user: {}, invitation: null, now }), 'not_invited');
  assert.equal(derive({ user: {}, invitation: { expires_at: '2026-09-23T00:00:00.000Z' }, now }), 'pending');
  assert.equal(derive({ user: {}, invitation: { expires_at: '2026-09-21T23:59:59.000Z' }, now }), 'expired');
  assert.equal(derive({ user: {}, invitation: { expires_at: '2026-09-23T00:00:00.000Z', revoked_at: '2026-09-21T00:00:00.000Z' }, now }), 'revoked');
  assert.equal(derive({ user: { auth_id: 'auth-user' }, invitation: null, now }), 'registered');
});

test('canonical invitation status projection never selects invitation token material', () => {
  assert.doesNotMatch(invitationStatusSource, /token_hash/);
  assert.doesNotMatch(invitationStatusSource, /SELECT[\s\S]*\btoken\b/i);
});

test('email delivery log is allow-listed and excludes sensitive message fields', () => {
  const record = buildEmailDeliveryLog('email_provider_accepted', {
    requestId: 'req-1',
    providerMessageId: 'message-123',
    providerStatus: 202,
    to: 'person@example.com',
    subject: 'Secret subject',
    html: '<p>secret body</p>',
    token: 'invite-secret',
    apiKey: 'SG.secret'
  });
  const serialized = JSON.stringify(record);
  assert.match(serialized, /message-123/);
  assert.doesNotMatch(serialized, /person@example\.com|Secret subject|secret body|invite-secret|SG\.secret/);
});

test('SendGrid acceptance captures x-message-id without exposing request content', async () => {
  const result = await sendViaSendGrid({
    apiKey: 'test-key',
    sender: { email: 'sender@example.com', name: 'KH Rentals' },
    to: 'recipient@example.com',
    subject: 'Invitation',
    html: '<p>private invitation</p>',
    fetchImpl: async () => ({
      ok: true,
      status: 202,
      headers: { get: (name) => name.toLowerCase() === 'x-message-id' ? 'provider-abc' : null }
    })
  });
  assert.equal(result.providerStatus, 202);
  assert.equal(result.providerMessageId, 'provider-abc');
});

test('SendGrid rejection never reads or propagates the provider response body', async () => {
  let bodyRead = false;
  await assert.rejects(
    () => sendViaSendGrid({
      apiKey: 'test-key',
      sender: { email: 'sender@example.com' },
      to: 'recipient@example.com',
      subject: 'Invitation',
      html: '<p>private invitation</p>',
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: async () => { bodyRead = true; return 'provider private detail'; }
      })
    }),
    (error) => error?.code === 'EMAIL_PROVIDER_REJECTED' && error?.providerStatus === 400
  );
  assert.equal(bodyRead, false);
});

test('server send-email response no longer echoes recipient or subject', () => {
  assert.doesNotMatch(serverSource, /res\.json\(\{ \.\.\.result, to, subject/);
  assert.match(serverSource, /email_provider_accepted/);
  assert.match(serverSource, /providerMessageId/);
});
