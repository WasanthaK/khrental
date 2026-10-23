import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createSqlPublicSignupLimiter } from '../src/api/auth/publicSignupSqlLimiter.js';
import { hashPublicSignupThrottleKey } from '../src/api/auth/publicSignupThrottleKey.js';

const source = readFileSync(new URL('../src/api/auth/publicSignupSqlLimiter.js', import.meta.url), 'utf8');
const schema = readFileSync(
  new URL('../migrations/20261024_01_create_public_signup_rate_limits.sql', import.meta.url),
  'utf8'
);
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('existing-SQL shared limiter has serializable transaction and lock on unique bucket', () => {
  assert.match(source, /transaction\.begin\(sql\.ISOLATION_LEVEL\.SERIALIZABLE\)/);
  assert.match(source, /WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(source, /@windowStart <= DATEADD\(second, -@windowSeconds, @now\)/);
  assert.match(source, /request_count = @used \+ 1/);
  assert.match(source, /WHERE bucket_hash = @bucketHash/);
  assert.match(source, /await transaction\.commit\(\)/);
  assert.match(source, /await transaction\.rollback\(\)/);
  assert.doesNotMatch(source, /new Map|process\.env\.PUBLIC_SIGNUP_ENABLED/);
  assert.doesNotMatch(server, /createSqlPublicSignupLimiter\(/);
});

test('additive SQL schema is tenantless and constrained and does not apply itself', () => {
  assert.match(schema, /OBJECT_ID\(N'dbo\.public_signup_challenges', N'U'\)/);
  assert.match(schema, /CREATE TABLE dbo\.public_signup_rate_limits/);
  assert.match(schema, /PRIMARY KEY \(bucket_hash\)/);
  assert.match(schema, /Latin1_General_100_BIN2/);
  assert.match(schema, /CK_public_signup_rate_limits_count/);
  assert.match(schema, /IX_public_signup_rate_limits_updated/);
  assert.match(schema, /SET XACT_ABORT ON/);
  assert.match(schema, /ROLLBACK TRANSACTION/);
  assert.doesNotMatch(schema, /\b(?:DROP|TRUNCATE|DELETE|EXEC|UPDATE|MERGE)\b/i);
  assert.doesNotMatch(schema, /\b(?:tenant_id|app_user_id|auth_id|password|email_normalized)\b/);
});

test('invalid inputs fail before SQL connection, without leaking IP or email', async () => {
  let hits = 0;
  const limiter = createSqlPublicSignupLimiter({ getPool: async () => {
    hits++;
    throw new Error('SQL pool must not be touched');
  } });
  const valid = {
    key: randomBytes(32).toString('hex'),
    scope: 'challenge-ip', max: 12, windowSeconds: 3600
  };
  for (const bad of [
    { ...valid, key: 'user@example.invalid' },
    { ...valid, key: 'a'.repeat(63) },
    { ...valid, key: 'A'.repeat(64) },
    { ...valid, scope: 'tenant-admin' },
    { ...valid, max: 0 },
    { ...valid, max: 1001 },
    { ...valid, max: 2.5 },
    { ...valid, windowSeconds: 0 },
    { ...valid, windowSeconds: 86401 },
    { ...valid, windowSeconds: Infinity }
  ]) {
    await assert.rejects(limiter.consume(bad), e => e.code === 'PUBLIC_SIGNUP_LIMITER_NOT_READY');
  }
  assert.equal(hits, 0);

  const digested = hashPublicSignupThrottleKey({
    secret: 'synthetic-32-byte-or-more-global-secret',
    scope: 'challenge-email', identifier: 'new.seeker@example.invalid'
  });
  assert.match(digested, /^[a-f0-9]{64}$/);
  await assert.rejects(limiter.consume({
    ...valid, key: digested, scope: 'challenge-email'
  }), e => e.status === 503 && !e.message.includes('SQL pool must not'));
  assert.equal(hits, 1);
});

test('invalid dependency is rejected before route can be enabled', () => {
  assert.throws(() => createSqlPublicSignupLimiter({ getPool: null }),
    e => e.code === 'PUBLIC_SIGNUP_LIMITER_NOT_READY');
});
