import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../scripts/r3-b04-limiter-physical-acceptance.mjs', import.meta.url), 'utf8');

test('R3 live SQL acceptance never touches real accounts or tenant records', () => {
  assert.match(source, /PUBLIC_SIGNUP_ENABLED !== 'false'/);
  assert.match(source, /PUBLIC_SIGNUP_PILOT_APPROVED !== 'false'/);
  assert.match(source, /NODE_ENV !== 'production'/);
  assert.match(source, /hashPublicSignupThrottleKey/);
  assert.match(source, /'r3-quota-acceptance-' \+ nonce/);
  assert.match(source, /createSqlPublicSignupLimiter/);
  assert.doesNotMatch(source, /\b(?:app_users|auth_users|tenant_memberships|invoices|payments)\b/);
});

test('R3 real quota test refuses writes without exact-bucket cleanup permission', () => {
  assert.match(source, /HAS_PERMS_BY_NAME\(.+DELETE/);
  assert.match(source, /no writes attempted/);
  assert.match(source, /WHERE bucket_hash = @bucketHash/);
  assert.match(source, /DELETE FROM dbo\.public_signup_rate_limits WHERE bucket_hash = @bucketHash/);
  assert.match(source, /R3_LIMITER_SYNTHETIC_BUCKET_REMOVED=/);
  assert.match(source, /R3_LIMITER_PERSISTED_ATOMIC_LIMIT=PASS/);
});

test('R3 test scope is bounded, on the same server-side limiter and fixed window', () => {
  assert.match(source, /const LIMIT = 5;/);
  assert.match(source, /const REQUESTS = 8;/);
  assert.match(source, /const WINDOW_SECONDS = 3600;/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /scope: 'redeem-ip'/);
  assert.match(source, /const \[mode, nonce, epochString\]/);
  assert.match(source, /\^\[a-f0-9\]\{32\}\$/);
  assert.doesNotMatch(source, /public-signup\/challenge|public-signup\/redeem|sendViaSendGrid/);
});

test('production probe is syntactically valid and refuses accidental local use before DB access', () => {
  const cli = fileURLToPath(new URL('../scripts/r3-b04-limiter-physical-acceptance.mjs', import.meta.url));
  const syntax = spawnSync(process.execPath, ['--check', cli], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const denied = spawnSync(process.execPath, [cli, 'worker', '0'.repeat(32), '0'], {
    env: { ...process.env, NODE_ENV: 'test', PUBLIC_SIGNUP_ENABLED: 'false', PUBLIC_SIGNUP_PILOT_APPROVED: 'false' },
    encoding: 'utf8'
  });
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /R3_LIMITER_ACCEPTANCE_FAILED/);
});
