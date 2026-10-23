import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPublicSignupChallengeToken,
  hashPublicSignupChallengeToken,
  verifyPublicSignupChallengeTokenHash
} from '../src/api/auth/publicSignupChallenge.js';

const migration = readFileSync(
  new URL('../migrations/20261023_01_create_public_signup_challenges.sql', import.meta.url), 'utf8'
);

test('new seeker challenge tokens are strong, URL-safe and non-repeating', () => {
  const values = Array.from({ length: 20 }, createPublicSignupChallengeToken);
  assert.equal(new Set(values.map(v => v.token)).size, 20);
  for (const { token, tokenHash } of values) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.match(tokenHash, /^[a-f0-9]{64}$/);
    assert.notEqual(token, tokenHash);
    assert.equal(tokenHash, hashPublicSignupChallengeToken(token));
    assert.equal(verifyPublicSignupChallengeTokenHash(token, tokenHash), true);
  }
});

test('reject invalid, truncated, modified and replayable-looking token inputs', () => {
  const { token, tokenHash } = createPublicSignupChallengeToken();
  assert.equal(verifyPublicSignupChallengeTokenHash(token.slice(0, -1), tokenHash), false);
  assert.equal(verifyPublicSignupChallengeTokenHash(token, 'not-a-hash'), false);
  assert.equal(verifyPublicSignupChallengeTokenHash(null, tokenHash), false);
  assert.equal(verifyPublicSignupChallengeTokenHash('A'.repeat(43), tokenHash), false);
  assert.throws(() => hashPublicSignupChallengeToken('too-short'));
  assert.throws(() => hashPublicSignupChallengeToken(null));
});

test('pending verification storage is a separate, transactional, tenantless ledger', () => {
  assert.match(migration, /SET XACT_ABORT ON;/);
  assert.match(migration, /BEGIN TRANSACTION;/);
  assert.match(migration, /ROLLBACK TRANSACTION;/);
  assert.match(migration, /OBJECT_ID\(N'dbo\.public_signup_challenges', N'U'\)/);
  assert.match(migration, /token_hash CHAR\(64\).*NOT NULL/);
  assert.match(migration, /UQ_public_signup_challenges_token_hash UNIQUE \(token_hash\)/);
  assert.match(migration, /email_normalized NVARCHAR\(320\) NOT NULL/);
  for (const field of ['expires_at', 'consumed_at', 'revoked_at', 'sent_at', 'send_count', 'verify_attempts']) {
    assert.match(migration, new RegExp('\\b' + field + '\\b'));
  }
  assert.doesNotMatch(migration, /\btenant_id\s+(?:UNIQUEIDENTIFIER|NVARCHAR)/i);
  assert.doesNotMatch(migration, /\b(?:password|credential_hash|password_salt)\s+(?:VARBINARY|NVARCHAR|VARCHAR)/i);
  assert.doesNotMatch(migration, /\bINSERT\s+INTO\s+(?:dbo\.)?(?:app_users|auth_users|tenant_memberships)\b/i);
});
