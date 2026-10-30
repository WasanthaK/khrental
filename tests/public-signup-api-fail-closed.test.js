import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {serializePublicSignupSession} from '../src/api/auth/publicSignupRuntime.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {guidToArray,bufferToUpperCaseGuid}=require('tedious/lib/guid-parser.js');
import { readFileSync } from 'node:fs';
import { createPublicSignupRouter, reportPublicSignupUnavailable } from '../src/api/auth/publicSignupRegistrationRouter.js';

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

test('server mounts separate default-off signup before the global parser; no legacy credential bypass', () => {
  assert.match(serverSource, /app\.use\('\/api\/public-signup', createPublicSignupRuntime\(\)\)/);
  assert.ok(serverSource.indexOf("app.use('/api/public-signup'") <
    serverSource.indexOf("app.use(express.json({"));
  assert.doesNotMatch(authSource, /POST \/api\/public-signup\/redeem/);
});

test('single-mailbox canary refuses other addresses without email or account actions', async () => {
  const harness = createHarness();
  const pilotEmail = 'synthetic@example.invalid';
  await withHttp(createPublicSignupRouter({ ...harness.adapters, pilotEmail }), async post => {
    const other = await post('/challenge', { email: 'other@example.invalid', name: 'Other' });
    assert.equal(other.status, 200);
    assert.equal(other.body.data.accepted, true);
    assert.equal(harness.calls.filter(c => c.kind === 'issue' || c.kind === 'send').length, 0);

    const allowed = await post('/challenge', { email: ' SYNTHETIC@EXAMPLE.INVALID ', name: 'Pilot' });
    assert.equal(allowed.status, 200);
    assert.equal(harness.calls.filter(c => c.kind === 'send').length, 1);

    const redeemed = await post('/redeem', { token: 'synthetic-token', password: 'SyntheticStrongPassword#123' });
    assert.equal(redeemed.status, 201);
    assert.equal(harness.calls.find(c => c.kind === 'redeem').expectedEmail, pilotEmail);
  });
});

test('unexpected redemption failures report their stage without exposing request or driver data', async t => {
  const logged = [];
  t.mock.method(console, 'error', (...parts) => logged.push(parts));
  const sensitive = 'opaque-token password salt email@example.invalid SELECT private_data';
  const cases = [
    ['redeem_client_address', 'UNCLASSIFIED', h => {h.clientAddress = () => null;}],
    ['redeem_ip_quota', 'SQL_PERMISSION', h => {h.limiter.consume = async () => {throw Object.assign(new Error(sensitive), {number:229});};}],
    ['redemption', 'SQL_WRITE_CONTRACT', h => {h.redeem = async () => {throw Object.assign(new Error(sensitive), {originalError:{info:{number:547,message:sensitive}}});};}],
    ['redemption_result', 'UNCLASSIFIED', h => {h.redeem = async () => ({role:'admin', tenantId:'private-tenant'});}],
    ['identity_readback', 'UNCLASSIFIED', h => {h.findAuth = async () => null;}],
    ['identity_readback', 'TIMEOUT', h => {h.findAuth = async () => {throw Object.assign(new Error(sensitive), {code:'ETIMEOUT'});};}],
    ['session_issue', 'CONNECTION', h => {h.createSession = async () => {throw Object.assign(new Error(sensitive), {code:'ECONNCLOSED'});};}]
  ];
  for (const [stage, category, alter] of cases) {
    logged.length = 0;
    const {adapters} = createHarness();
    alter(adapters);
    await withHttp(createPublicSignupRouter(adapters), async post => {
      const response = await post('/redeem', {token:sensitive, password:sensitive});
      assert.equal(response.status, 503);
      assert.deepEqual(response.body, {error:'Public registration is temporarily unavailable.', code:'PUBLIC_SIGNUP_NOT_READY'});
    });
    assert.deepEqual(logged, [['[PublicSignupUnavailable]', {stage, category}]]);
    assert.ok(!JSON.stringify(logged).includes(sensitive));
  }
});

test('diagnostic categories are fixed even for hostile stage, code and limiter fields', t => {
  const logged = [];
  t.mock.method(console, 'error', (...parts) => logged.push(parts));
  const secret = 'do-not-log-this-private-value';
  reportPublicSignupUnavailable(secret, {code:secret,message:secret,number:secret,request:{password:secret}});
  reportPublicSignupUnavailable('redeem_ip_quota', {code:'PUBLIC_SIGNUP_LIMITER_NOT_READY',diagnosticCategory:secret});
  reportPublicSignupUnavailable('redeem_ip_quota', {code:'PUBLIC_SIGNUP_LIMITER_NOT_READY',diagnosticCategory:'SQL_THROTTLED'});
  assert.deepEqual(logged.map(parts => parts[1]), [
    {stage:'unknown',category:'UNCLASSIFIED'},
    {stage:'redeem_ip_quota',category:'LIMITER_UNAVAILABLE'},
    {stage:'redeem_ip_quota',category:'SQL_THROTTLED'}
  ]);
  assert.ok(!JSON.stringify(logged).includes(secret));
});

test('diagnostic sink failure cannot replace the existing 503 response', async t => {
  t.mock.method(console, 'error', () => {throw new Error('Sink unavailable');});
  const {adapters} = createHarness();
  adapters.redeem = async () => {throw new Error('Private failure');};
  await withHttp(createPublicSignupRouter(adapters), async post => {
    assert.equal((await post('/redeem', {token:'synthetic',password:'synthetic'})).status, 503);
  });
});

test('successful signup and expected invalid challenges do not emit unavailable diagnostics', async t => {
  const logged = [];
  t.mock.method(console, 'error', (...parts) => logged.push(parts));
  const {adapters} = createHarness();
  await withHttp(createPublicSignupRouter(adapters), async post => {
    assert.equal((await post('/redeem', {token:'synthetic',password:'synthetic'})).status, 201);
  });
  for (const code of ['SIGNUP_VERIFICATION_UNAVAILABLE','SIGNUP_PASSWORD_INVALID','SIGNUP_IDENTITY_ALREADY_EXISTS']) {
    adapters.redeem = async () => {throw Object.assign(new Error('Private expected failure'),{code});};
    await withHttp(createPublicSignupRouter(adapters), async post => {
      assert.equal((await post('/redeem', {token:'synthetic',password:'synthetic'})).status, 400);
    });
  }
  assert.deepEqual(logged, []);
});


test('password-policy rejection is actionable and reveals no private failure details',async t=>{
  const {adapters}=createHarness();
  adapters.redeem=async()=>{throw Object.assign(new Error('private token and password'),{code:'SIGNUP_PASSWORD_INVALID'});};
  await withHttp(createPublicSignupRouter(adapters),async post=>{
    const response=await post('/redeem',{token:'synthetic',password:'short'});
    assert.equal(response.status,400);const body=response.body;
    assert.equal(body.code,'SIGNUP_PASSWORD_INVALID');assert.match(body.error,/8 to 256/);
    assert.doesNotMatch(JSON.stringify(body),/private token|short/);
  });
});


test('redemption response uses persisted SQL identity casing consistently with its issued session',async()=>{
  const {adapters}=createHarness();
  const generated='abcdefab-abcd-4abc-8abc-abcdefabcdef';
  const persisted=bufferToUpperCaseGuid(Buffer.from(guidToArray(generated)));
  assert.notEqual(generated,persisted,'Reproduce the real driver UUID casing transition');
  adapters.redeem=async()=>({authId:generated,appUserId:generated,email:'synthetic@example.invalid',role:'authenticated',userType:'seeker',tenantId:null});
  adapters.findAuth=async()=>({authId:persisted,appUserId:persisted,email:'synthetic@example.invalid',role:'authenticated',metadata:{global_email_verified:true}});
  adapters.createSession=async record=>serializePublicSignupSession(record,{accessToken:'synthetic-only',expiresAt:new Date(Date.now()+60000)});
  await withHttp(createPublicSignupRouter(adapters),async post=>{
    const {status,body}=await post('/redeem',{token:'synthetic',password:'SyntheticOnly8!'});
    assert.equal(status,201);
    assert.equal(body.data.user.id,body.data.session.user.id);
    assert.equal(body.data.user.id,persisted);
  });
});
