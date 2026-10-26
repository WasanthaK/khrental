import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createAzureSignupClientAddress,
  normalizePublicSignupIp,
  checkPublicSignupBrowserRequest
} from '../src/api/auth/publicSignupIngressGuard.js';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const router = readFileSync(
  new URL('../src/api/auth/publicSignupRegistrationRouter.js', import.meta.url),
  'utf8'
);
const verify = readFileSync(
  new URL('../.github/workflows/verify-production-db-migration-executor.yml', import.meta.url),
  'utf8'
);

const raw = (peer, xff) => ({
  socket: { remoteAddress: peer },
  rawHeaders: ['Host', 'app.quixo.homes', 'X-Forwarded-For', xff],
  headers: { host: 'app.quixo.homes', 'x-forwarded-for': xff }
});

test('verified Azure ingress selects only the rightmost proxy-appended IP', () => {
  const clientAddress = createAzureSignupClientAddress({
    isTrustedIngressPeer: peer => peer === '10.0.0.5'
  });
  assert.equal(clientAddress(raw('10.0.0.5', '203.0.113.101')), '203.0.113.101');
  assert.equal(clientAddress(raw('10.0.0.5',
    '1.1.1.1, 2.2.2.2, 203.0.113.101')), '203.0.113.101',
    'earlier client-controlled values are ignored');
  assert.equal(clientAddress(raw('10.0.0.5',
    '192.0.2.14, 2001:0db8::1')), '2001:db8::1');
  assert.equal(clientAddress(raw('10.0.0.5',
    '192.0.2.14, ::ffff:203.0.113.101')), '203.0.113.101');
  assert.equal(normalizePublicSignupIp('2001:0DB8:0:0:0:0:0:0001'),
    '2001:db8::1');
  assert.equal(normalizePublicSignupIp('::ffff:203.0.113.101'),
    normalizePublicSignupIp('203.0.113.101'));
});

test('missing peer attestation, forged headers, duplicate XFF and port suffix fail closed', () => {
  assert.equal(createAzureSignupClientAddress()(raw('10.0.0.5', '203.0.113.101')), null);
  const clientAddress = createAzureSignupClientAddress({
    isTrustedIngressPeer: peer => peer === '10.0.0.5'
  });
  for (const req of [
    raw('10.0.0.6', '203.0.113.101'),
    raw('invalid-peer', '203.0.113.101'),
    raw('10.0.0.5', ''),
    raw('10.0.0.5', '203.0.113.101:48900'),
    raw('10.0.0.5', '198.51.100.11,'),
    raw('10.0.0.5', '198.51.100.11, junk'),
    raw('10.0.0.5', '[2001:db8::1]'),
    raw('10.0.0.5', '203.0.113.101\r\nX-Another: yes'),
    raw('10.0.0.5', Array.from({ length: 17 }, () => '192.0.2.1').join(',')),
    raw('10.0.0.5', '1'.repeat(2100)),
    { socket: { remoteAddress: '10.0.0.5' }, rawHeaders: [] },
    { ...raw('10.0.0.5', '192.0.2.1'), rawHeaders: [
      'x-forwarded-for', '192.0.2.1', 'X-Forwarded-For', '203.0.113.5'
    ] }
  ]) {
    assert.equal(clientAddress(req), null, JSON.stringify(req));
  }
  const throws = createAzureSignupClientAddress({
    isTrustedIngressPeer() { throw Error('untrusted peer'); }
  });
  assert.equal(throws(raw('10.0.0.5', '192.0.2.1')), null);
});


test('ACA platform-managed HTTP ingress mode selects only Azure-appended rightmost XFF despite rotating socket peers', () => {
  const managed = createAzureSignupClientAddress({ azureManagedHttpIngress: true });
  const request = (peer, forwarded, proto = 'https') => ({
    ...raw(peer, forwarded), headers: {
      ...raw(peer, forwarded).headers, 'x-forwarded-proto': proto
    }
  });
  assert.equal(managed(request('10.20.0.11', '203.0.113.88')), '203.0.113.88');
  assert.equal(managed(request('10.20.0.99', '198.51.100.66, 203.0.113.88')),
    '203.0.113.88', 'untrusted leftmost address must never alter quota key');
  assert.equal(managed(request('10.20.0.11', '203.0.113.88', 'http')), null);
  assert.equal(managed(request('10.20.0.11', '203.0.113.88', undefined)), '203.0.113.88');
  const missing = request('10.20.0.11', '203.0.113.88');
  delete missing.headers['x-forwarded-proto'];
  assert.equal(managed(missing), null);
  assert.equal(managed(request('not-an-ip', '203.0.113.88')), null);
  assert.equal(managed({ ...request('10.20.0.11', '203.0.113.88'), rawHeaders: [] }), null);
  assert.equal(managed({ ...request('10.20.0.11', '203.0.113.88'), rawHeaders: [
    'X-Forwarded-For', '203.0.113.88',
    'x-forwarded-for', '198.51.100.66'
  ] }), null);
  assert.equal(createAzureSignupClientAddress()(request('10.20.0.11', '203.0.113.88')), null,
    'managed mode cannot be implicitly selected');
});

const good = () => ({
  method: 'POST',
  originalUrl: '/api/public-signup/challenge',
  headers: {
    origin: 'https://app.quixo.homes',
    host: 'app.quixo.homes',
    'content-type': 'application/json; charset=utf-8',
    'content-length': '140',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors'
  }
});

test('browser signup rejects cross-site or ambiguous requests', () => {
  assert.deepEqual(checkPublicSignupBrowserRequest(good()),
    { allowed: true, status: 200 });
  assert.deepEqual(checkPublicSignupBrowserRequest({
    ...good(), originalUrl: '/api/public-signup/redeem'
  }), { allowed: true, status: 200 });

  for (const mutated of [
    { method: 'GET' },
    { originalUrl: '/api/public-signup/challenge?token=abc' },
    { originalUrl: '/api/platform/auth/sign-up' },
    { headers: { ...good().headers, origin: 'https://evil.example' } },
    { headers: { ...good().headers, origin: 'https://app.quixo.homes.evil.example' } },
    { headers: { ...good().headers, origin: undefined } },
    { headers: { ...good().headers, host: 'khrental-app.azurecontainerapps.io' } },
    { headers: { ...good().headers, 'sec-fetch-site': 'cross-site' } },
    { headers: { ...good().headers, 'sec-fetch-mode': 'navigate' } },
    { headers: { ...good().headers, 'content-type': 'text/plain' } },
    { headers: { ...good().headers, 'content-type': 'application/json, text/plain' } },
    { headers: { ...good().headers, 'content-length': undefined } },
    { headers: { ...good().headers, 'content-length': '0' } },
    { headers: { ...good().headers, 'content-length': '100000' } },
    { headers: { ...good().headers, 'content-length': '8193' } },
    { headers: { ...good().headers, 'content-length': '140', 'transfer-encoding': 'chunked' } },
    { headers: { ...good().headers, 'content-length': '140, 141' } }
  ]) {
    const request = { ...good(), ...mutated };
    assert.deepEqual(checkPublicSignupBrowserRequest(request),
      { allowed: false, status: 403 }, JSON.stringify(mutated));
  }
  assert.deepEqual(checkPublicSignupBrowserRequest(good(),
    { allowedOrigin: 'https://app.quixo.homes.evil.example' }),
    { allowed: false, status: 403 });
});

test('integrated API uses separate pre-parser ingress controls and keeps SQL verifier intact', () => {
  const runtime = readFileSync(new URL('../src/api/auth/publicSignupRuntime.js', import.meta.url), 'utf8');
  assert.match(server, /app\.use\('\/api\/public-signup', createPublicSignupRuntime\(\)\)/);
  assert.ok(server.indexOf("app.use('/api/public-signup'") < server.indexOf("app.use(express.json({"));
  assert.match(runtime, /createAzureSignupClientAddress/);
  assert.match(runtime, /checkPublicSignupBrowserRequest\(req\)/);
  assert.match(runtime, /express\.json\(\{ limit: '8kb', strict: true, inflate: false \}\)/);
  assert.match(runtime, /PUBLIC_SIGNUP_ENABLED === 'true'/);
  assert.match(runtime, /PUBLIC_SIGNUP_PILOT_APPROVED === 'true'/);
  assert.match(server, /express\.json\(\{\s*limit: '10mb'/);
  assert.match(verify, /Strict read-only migration verification passed for 12 managed migrations/);
});
