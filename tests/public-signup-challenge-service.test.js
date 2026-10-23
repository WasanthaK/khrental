import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePublicSignupDetails,
  beginPublicSignupChallenge,
  completePublicSignupChallengeDelivery
} from '../src/api/auth/publicSignupChallengeService.js';

const service = readFileSync(
  new URL('../src/api/auth/publicSignupChallengeService.js', import.meta.url), 'utf8'
);
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('server-only signup details normalize email but never accept control characters', () => {
  assert.deepEqual(normalizePublicSignupDetails({
    email: '  Person@Example.Invalid ', name: '  Example Person  '
  }), { email: 'person@example.invalid', name: 'Example Person' });
  for (const candidate of [
    { email: '', name: 'Name' },
    { email: 'not-an-email', name: 'Name' },
    { email: 'foo@example.invalid\ncc:victim@example.invalid', name: 'Name' },
    { email: 'foo@example.invalid', name: '' },
    { email: 'foo@example.invalid', name: 'A\nB' },
    { email: 'foo@example.invalid', name: 'A'.repeat(256) }
  ]) {
    assert.equal(normalizePublicSignupDetails(candidate), null);
  }
});

test('invalid challenge details are suppressed without accessing SQL', async () => {
  assert.equal(await beginPublicSignupChallenge({
    email: 'not valid', name: 'Test'
  }), null);
});

test('delivery finalization refuses malformed identifiers or missing boolean state', async () => {
  await assert.rejects(completePublicSignupChallengeDelivery({
    challengeId: 'insecure-id', providerAccepted: true
  }), TypeError);
  await assert.rejects(completePublicSignupChallengeDelivery({
    challengeId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', providerAccepted: 'true'
  }), TypeError);
});

test('challenge issuance is a serializable, server-only ledger operation', () => {
  assert.match(service, /transaction|tx\.begin\(sql\.ISOLATION_LEVEL\.SERIALIZABLE\)/);
  assert.match(service, /dbo\.app_users WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(service, /dbo\.auth_users WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(service, /dbo\.public_signup_challenges WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(service, /DATEADD\(minute, -2, SYSUTCDATETIME\(\)\)/);
  assert.match(service, /DATEADD\(minute, 30, SYSUTCDATETIME\(\)\)/);
  assert.match(service, /SET revoked_at = SYSUTCDATETIME\(\)/);
  assert.match(service, /providerAccepted !== true && providerAccepted !== false/);
  assert.match(service, /SET sent_at = CASE WHEN @accepted = 1/);
  assert.doesNotMatch(service, /INSERT INTO dbo\.(?:app_users|auth_users|tenant_memberships|tenants)/);
  assert.doesNotMatch(service, /console\.(?:log|warn|error|info)/);
  assert.ok(!server.includes('beginPublicSignupChallenge('));
  assert.ok(!server.includes('completePublicSignupChallengeDelivery('));
});
