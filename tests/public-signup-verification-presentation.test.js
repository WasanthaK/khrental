import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPublicSignupChallengeToken } from '../src/api/auth/publicSignupChallenge.js';
import {
  createPublicSignupVerificationLink,
  createPublicSignupVerificationEmail
} from '../src/api/auth/publicSignupVerificationEmail.js';
import { hashPublicSignupThrottleKey } from '../src/api/auth/publicSignupThrottleKey.js';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('verification link uses a URL fragment, never a request path or query token', () => {
  const { token } = createPublicSignupChallengeToken();
  const link = createPublicSignupVerificationLink({
    token, baseUrl: 'https://app.quixo.homes', production: true
  });
  const url = new URL(link);
  assert.equal(url.origin, 'https://app.quixo.homes');
  assert.equal(url.pathname, '/verify-email');
  assert.equal(url.search, '');
  assert.equal(url.hash, '#token=' + token);
  assert.equal(url.pathname.includes(token), false);
  assert.equal(url.search.includes(token), false);

  const mail = createPublicSignupVerificationEmail({
    token, baseUrl: 'https://app.quixo.homes', production: true
  });
  assert.ok(mail.text.includes(link));
  assert.ok(mail.html.includes(link));
  assert.match(mail.subject, /Verify your Quixo\.Homes email/);
  assert.ok(!mail.subject.includes(token));
});

test('reject redirect injection, attacker origins and non-TLS production URLs', () => {
  const { token } = createPublicSignupChallengeToken();
  for (const baseUrl of [
    'http://app.quixo.homes',
    'https://attacker.example',
    'https://app.quixo.homes.attacker.example',
    'https://app.quixo.homes@attacker.example',
    'https://app.quixo.homes:4443',
    'https://app.quixo.homes/login',
    'https://app.quixo.homes/?next=https://attacker.example',
    'https://app.quixo.homes/#other',
    'file:///tmp/verify',
    '',
    null
  ]) {
    assert.throws(() => createPublicSignupVerificationLink({
      token, baseUrl, production: true
    }), e => e.code === 'PUBLIC_SIGNUP_APP_URL_REQUIRED');
  }
  assert.throws(() => createPublicSignupVerificationLink({
    token: 'not-an-opaque-token',
    baseUrl: 'https://app.quixo.homes',
    production: true
  }), /Invalid signup verification token/);
});

test('development local HTTP can be used without allowing arbitrary insecure origins', () => {
  const { token } = createPublicSignupChallengeToken();
  const local = createPublicSignupVerificationLink({
    token, baseUrl: 'http://localhost:5174', production: false
  });
  assert.equal(new URL(local).origin, 'http://localhost:5174');
  assert.throws(() => createPublicSignupVerificationLink({
    token, baseUrl: 'http://remote.example', production: false
  }), e => e.code === 'PUBLIC_SIGNUP_APP_URL_REQUIRED');
});

test('throttle HMAC keys are privacy-preserving, scoped and case-normalized', () => {
  const secret = randomBytes(32).toString('hex');
  const derive = (scope, identifier) => hashPublicSignupThrottleKey({
    secret, scope, identifier
  });
  const a = derive('challenge-email', 'Person@Example.invalid');
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, derive('challenge-email', 'person@example.invalid'));
  assert.notEqual(a, derive('challenge-ip', 'person@example.invalid'));
  assert.notEqual(a, derive('challenge-email', 'someone@example.invalid'));
  assert.notEqual(a, hashPublicSignupThrottleKey({
    secret: randomBytes(32).toString('hex'),
    scope: 'challenge-email', identifier: 'Person@Example.invalid'
  }));
  assert.ok(!a.includes('Person'));
});

test('throttle keys reject missing configuration and unsafe identifiers', () => {
  const secret = randomBytes(32).toString('hex');
  for (const options of [
    { secret: '', scope: 'challenge-ip', identifier: '192.0.2.1' },
    { secret: 'short', scope: 'challenge-ip', identifier: '192.0.2.1' },
    { secret, scope: 'unsupported', identifier: '192.0.2.1' },
    { secret, scope: 'challenge-email', identifier: ' person@example.invalid' },
    { secret, scope: 'challenge-email', identifier: 'person@example.invalid\nfoo' },
    { secret, scope: 'redeem-ip', identifier: '' }
  ]) {
    assert.throws(() => hashPublicSignupThrottleKey(options));
  }
});

test('verification helpers remain isolated from landlord routes; public signup mounts behind gated runtime', () => {
  assert.ok(!server.includes('createPublicSignupVerificationEmail('));
  assert.ok(!server.includes('hashPublicSignupThrottleKey('));
  assert.ok(server.includes("app.use('/api/public-signup', createPublicSignupRuntime())"));
  const runtime = readFileSync(new URL('../src/api/auth/publicSignupRuntime.js', import.meta.url), 'utf8');
  assert.match(runtime, /PUBLIC_SIGNUP_PILOT_APPROVED === 'true'/);
  assert.match(runtime, /PUBLIC_SIGNUP_ENABLED === 'true'/);
});
