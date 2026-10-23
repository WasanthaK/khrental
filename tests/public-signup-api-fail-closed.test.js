import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createPublicSignupRouter } from '../src/api/auth/publicSignupRegistrationRouter.js';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const authSource = readFileSync(new URL('../src/api/auth/index.js', import.meta.url), 'utf8');

const withHttp = async (router, run) => {
  const app = express();
  app.use(express.json());
  app.use('/api/public-signup', router);
  const http = await new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  const origin = 'http://127.0.0.1:' + http.address().port;
  const post = async (path, body = {}, headers = {}) => {
    const response = await fetch(origin + '/api/public-signup' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  try { await run(post); }
  finally { await new Promise(resolve => http.close(resolve)); }
};

const createHarness = () => {
  const calls = [];
  const result = {
    authId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    appUserId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    role: 'authenticated', userType: 'seeker', tenantId: null,
    email: 'synthetic@example.invalid'
  };
  const rateLimiter = {
    durable: true,
    async consume(value) { calls.push({ kind: 'quota', ...value }); return true; }
  };
  const adapters = {
    enabled: true, limiter: rateLimiter,
    clientAddress(req) { return req.socket.remoteAddress; },
    throttleSecret: '0123456789abcdef'.repeat(4),
    async beginChallenge(details) {
      calls.push({ kind: 'issue', details });
      return { challengeId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
        token: 'a'.repeat(43), email: details.email };
    },
    async finishDelivery(value) { calls.push({ kind: 'finish', ...value }); return true; },
    async sendEmail(value) { calls.push({ kind: 'send', to: value.to }); return { success: true }; },
    makeEmail(value) { calls.push({ kind: 'mail', token: value.token }); return { subject: 'Test' }; },
    async redeem(value) { calls.push({ kind: 'redeem', ...value }); return result; },
    async findAuth(email) {
      calls.push({ kind: 'lookup' });
      assert.equal(email, result.email);
      return { role: 'authenticated', authId: result.authId, appUserId: result.appUserId };
    },
    async createSession() {
      calls.push({ kind: 'session' });
      return { access_token: 'local-synthetic-token', token_type: 'bearer' };
    }
  };
  return { calls, adapters };
};

test('feature switch OFF returns 404 before any side effects', async () => {
  const harness = createHarness();
  const router = createPublicSignupRouter({ ...harness.adapters, enabled: false });
  await withHttp(router, async post => {
    for (const path of ['/challenge', '/redeem']) {
      const result = await post(path, { email: 'synthetic@example.invalid' });
      assert.equal(result.status, 404);
      assert.equal(result.body.code, 'PUBLIC_SIGNUP_DISABLED');
      assert.match(result.headers.get('cache-control'), /no-store/);
    }
  });
  assert.equal(harness.calls.length, 0);
});

test('feature switch alone cannot open API without a durable limiter and trusted IP', async () => {
  const harness = createHarness();
  const cases = [
    { limiter: null },
    { limiter: { durable: false, consume: async () => true } },
    { clientAddress: null },
    { throttleSecret: '' }
  ];
  for (const values of cases) {
    await withHttp(createPublicSignupRouter({ ...harness.adapters, ...values }), async post => {
      const result = await post('/challenge');
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'PUBLIC_SIGNUP_NOT_READY');
    });
  }
  assert.equal(harness.calls.length, 0);
});

test('challenge is rate-limited before sending, rejects client tenant and role claims', async () => {
  const harness = createHarness();
  await withHttp(createPublicSignupRouter(harness.adapters), async post => {
    const out = await post('/challenge', {
      email: ' SYNTHETIC@EXAMPLE.INVALID ', name: 'Synthetic Seeker',
      tenantId: 'foreign-tenant', role: 'admin', priceId: 'forged'
    }, { 'x-forwarded-for': '203.0.113.66' });
    assert.equal(out.status, 200);
    assert.equal(out.body.data.accepted, true);
    assert.deepEqual(harness.calls.find(x=>x.kind==='issue').details,
      { email: 'synthetic@example.invalid', name: 'Synthetic Seeker' });
    assert.equal(harness.calls.filter(x=>x.kind==='send').length, 1);
    assert.equal(harness.calls.find(x=>x.kind==='finish').providerAccepted, true);
    assert.equal(harness.calls.filter(x=>x.kind==='quota').length, 2);
    assert.equal(harness.calls.find(x=>x.kind==='quota').scope, 'challenge-ip');
    assert.match(harness.calls.find(x=>x.kind==='quota').key, /^[0-9a-f]{64}$/);
    assert.ok(harness.calls.filter(x=>x.kind==='quota').every(x=>!x.key.includes('203.0.113.66')));
  });
});

test('failed or ambiguous provider acknowledgment revokes the issued challenge', async () => {
  const harness = createHarness();
  harness.adapters.sendEmail = async () => { throw new Error('Sensitive SendGrid address and key not for clients'); };
  await withHttp(createPublicSignupRouter(harness.adapters), async post => {
    const out = await post('/challenge', { email: 'synthetic@example.invalid', name: 'Example' });
    assert.equal(out.status, 200);
    assert.equal(out.body.data.accepted, true);
    assert.equal(harness.calls.find(x=>x.kind==='finish').providerAccepted, false);
    assert.ok(!JSON.stringify(out.body).includes('SendGrid'));
  });
});

test('rate limiting denies request before any identity transaction or provider mail', async () => {
  const harness = createHarness();
  harness.adapters.limiter.consume = async () => false;
  await withHttp(createPublicSignupRouter(harness.adapters), async post => {
    for (const path of ['/challenge','/redeem']) {
      const out = await post(path, {email:'synthetic@example.invalid', password:'forged'});
      assert.equal(out.status, 429);
    }
  });
  assert.equal(harness.calls.filter(x=>x.kind==='send'||x.kind==='redeem').length, 0);
});

test('post-verification session is scoped to linked tenantless seeker only', async () => {
  const harness = createHarness();
  await withHttp(createPublicSignupRouter(harness.adapters), async post => {
    const out = await post('/redeem', {
      token: 'opaque-test-value', password: 'SyntheticStrongPassword#123',
      role: 'global_admin', tenantId: 'foreign-tenant'
    });
    assert.equal(out.status, 201);
    assert.deepEqual(out.body.data.user, {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      role: 'authenticated', user_type: 'seeker'
    });
    assert.equal(harness.calls.find(x=>x.kind==='session').kind, 'session');
    assert.equal(harness.calls.find(x=>x.kind==='redeem').token, 'opaque-test-value');
    assert.equal(Object.hasOwn(out.body.data.user, 'tenantId'), false);
  });
});

test('current production server has no new signup route or anonymous credential bypass', () => {
  assert.doesNotMatch(serverSource, /createPublicSignupRouter\(/);
  assert.doesNotMatch(serverSource, /app\.use\(['"]\/api\/public-signup/);
  assert.doesNotMatch(authSource, /POST \/api\/public-signup\/redeem/);
});
