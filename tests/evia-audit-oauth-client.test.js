import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Exercise the real browser service with isolated storage/network boundaries.
const source = readFileSync(new URL('../src/services/eviaSignService.js', import.meta.url), 'utf8')
  .replace(/^export \*[^\n]+\n/gm, '')
  .replace(/^import[^\n]+\n/gm, '')
  .replace(/^export /gm, '');
const agreementId = '22222222-2222-4222-8222-222222222222';
const auditTrailUrl = '/storage/documents/retained-audit.pdf';
const fresh = { authToken: 'oauth-original', expiresAt: Date.now() + 3600000, refreshToken: 'refresh-original' };
const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { 'Content-Type': 'application/json' }
});
function fixture(auth = fresh, respond = () => json({ auditTrailUrl }),
  localResponse = () => json({ code: 'EVIA_AUDIT_LOCAL_MISSING' }, 404)) {
  let stored = JSON.stringify(auth);
  const requests = [], localRequests = [], opened = [], timers = [];
  const context = vm.createContext({
    console, Date, Error, JSON, URL, encodeURIComponent,
    ENV: { EVIA_SIGN_CLIENT_ID: 'configured-client' }, getApiBaseUrl: () => '',
    buildRequestContextHeaders: h => ({ ...h, Authorization: 'Bearer application-session', 'x-tenant-id': 'current-tenant' }),
    localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value; } },
    window: { location: { origin: 'https://app.example' }, open: (...args) => opened.push(args),
      setInterval: callback => { timers.push(callback); return timers.length; }, clearInterval: () => {} },
    fetch: async (url, options) => {
      if (JSON.parse(options.body).localOnly === true) {
        localRequests.push({ url, options }); return localResponse(url, options);
      }
      requests.push({ url, options }); return respond(url, options, requests.length);
    }
  });
  vm.runInContext(source + '\nglobalThis.subject = { recoverEviaAuditTrail, connectEviaAuditRecovery };', context);
  return { ...context.subject, requests, localRequests, opened, stored: () => JSON.parse(stored), setStored: value => { stored = value; } };
}

test('retained audit recovery works without an Evia connection using only application authorization', async () => {
  const f = fixture(null, () => { throw new Error('Must not call token broker or provider recovery'); },
    () => json({ auditTrailUrl, recovered: true }));
  assert.equal((await f.recoverEviaAuditTrail(agreementId)).auditTrailUrl, auditTrailUrl);
  assert.equal(f.requests.length, 0); assert.equal(f.localRequests.length, 1);
  const { url, options } = f.localRequests[0];
  assert.equal(url, `/api/evia/agreements/${agreementId}/audit-trail`);
  assert.equal(options.headers.Authorization, 'Bearer application-session');
  assert.equal(options.headers['x-tenant-id'], 'current-tenant');
  assert.deepEqual(JSON.parse(options.body), { localOnly: true });
  assert.equal(f.opened.length, 0);
});

test('local authorization, storage failures and malformed success do not access provider credentials', async () => {
  for (const [status, code] of [[401, 'API_SESSION_REQUIRED'], [403, 'EVIA_AUDIT_RECOVERY_DENIED'],
    [404, 'OTHER_NOT_FOUND'], [503, 'STORAGE_UNAVAILABLE'], [200, undefined]]) {
    const f = fixture({ ...fresh, expiresAt: 1 }, () => { throw new Error('Must not refresh'); },
      () => json({ code }, status));
    await assert.rejects(f.recoverEviaAuditTrail(agreementId), { status });
    assert.equal(f.localRequests.length, 1); assert.equal(f.requests.length, 0);
  }
});

test('audit recovery uses existing OAuth and keeps application session and tenant authorization', async () => {
  const f = fixture();
  assert.equal((await f.recoverEviaAuditTrail(agreementId)).auditTrailUrl, auditTrailUrl);
  assert.equal(f.requests.length, 1);
  assert.equal(f.localRequests.length, 1);
  const { url, options } = f.requests[0];
  assert.equal(url, `/api/evia/agreements/${agreementId}/audit-trail`);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer application-session');
  assert.equal(options.headers['x-tenant-id'], 'current-tenant');
  assert.deepEqual(JSON.parse(options.body), { accessToken: 'oauth-original' });
});

test('missing or corrupt Evia connection asks for sign-in without calling the failed integration exchange', async () => {
  for (const raw of [null, '{}', 'bad-json', JSON.stringify({ authToken: 'expired', expiresAt: 1 })]) {
    const f = fixture(); f.setStored(raw);
    await assert.rejects(f.recoverEviaAuditTrail(agreementId), { code: 'EVIA_AUTHENTICATION_REQUIRED' });
    assert.equal(f.requests.length, 0); assert.equal(f.opened.length, 0);
    assert.equal(f.localRequests.length, 1);
  }
});

test('expired OAuth refreshes through existing token broker before audit retrieval', async () => {
  const f = fixture({ ...fresh, expiresAt: 1 }, url => url === '/api/evia/token'
    ? json({ access_token: 'refreshed', expires_in: 1800 }) : json({ auditTrailUrl }));
  await f.recoverEviaAuditTrail(agreementId);
  assert.equal(f.requests.length, 2);
  assert.deepEqual(JSON.parse(f.requests[0].options.body), { grantType: 'refresh_token', refreshToken: 'refresh-original' });
  assert.deepEqual(JSON.parse(f.requests[1].options.body), { accessToken: 'refreshed' });
  assert.equal(f.stored().refreshToken, 'refresh-original', 'retain refresh token when provider does not rotate it');
});

test('provider OAuth 401 refreshes once and then retries audit-only recovery', async () => {
  const f = fixture(fresh, (url, _options, count) => url === '/api/evia/token'
    ? json({ access_token: 'refreshed', refresh_token: 'rotated', expires_in: 1800 })
    : count === 1 ? json({ code: 'EVIA_COMPLETED_DOCUMENT_LIST_FAILED', error: 'expired' }, 401)
      : json({ auditTrailUrl }));
  await f.recoverEviaAuditTrail(agreementId);
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[1].url, '/api/evia/token');
  assert.equal(JSON.parse(f.requests[2].options.body).accessToken, 'refreshed');
  assert.equal(f.stored().refreshToken, 'rotated');
});

test('repeated provider rejection stops after one refresh and requires connection', async () => {
  const f = fixture(fresh, url => url === '/api/evia/token'
    ? json({ access_token: 'refreshed' })
    : json({ code: 'EVIA_COMPLETED_DOCUMENT_DOWNLOAD_FAILED' }, 401));
  await assert.rejects(f.recoverEviaAuditTrail(agreementId), { code: 'EVIA_AUTHENTICATION_REQUIRED' });
  assert.equal(f.requests.length, 3);
});

test('application auth, tenant denial and provider failure do not cause OAuth retry or integration fallback', async () => {
  for (const [status, code] of [[401, 'API_SESSION_REQUIRED'], [403, 'EVIA_AUDIT_RECOVERY_DENIED'], [404, 'EVIA_COMPLETED_DOCUMENT_LIST_FAILED'], [503, 'STORAGE_UNAVAILABLE']]) {
    const f = fixture(fresh, () => json({ error: 'test failure', code }, status));
    await assert.rejects(f.recoverEviaAuditTrail(agreementId), { status, code });
    assert.equal(f.requests.length, 1);
  }
});

test('invalid refresh needs connection while broker outages remain retryable errors', async () => {
  for (const status of [400, 401, 503]) {
    const f = fixture({ ...fresh, expiresAt: 1 }, () => json({ error: 'broker failed', code: 'EVIA_TOKEN_EXCHANGE_FAILED' }, status));
    await assert.rejects(f.recoverEviaAuditTrail(agreementId), {
      code: status === 503 ? 'EVIA_TOKEN_EXCHANGE_FAILED' : 'EVIA_AUTHENTICATION_REQUIRED'
    });
    assert.equal(f.requests.length, 1);
  }
});

test('explicit connect opens existing OAuth flow with no opener and no signing operation', () => {
  const f = fixture(null); f.connectEviaAuditRecovery();
  assert.equal(f.opened.length, 1); assert.equal(f.requests.length, 0);
  const [target, tab, features] = f.opened[0];
  const url = new URL(target);
  assert.equal(url.origin, 'https://evia.enadocapp.com');
  assert.equal(url.pathname, '/_apis/falcon/auth/oauth2/authorize');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://app.example/auth/evia-callback');
  assert.equal(tab, '_blank'); assert.equal(features, 'noopener,noreferrer');
  assert.equal(target.includes('oauth-original'), false);
});
