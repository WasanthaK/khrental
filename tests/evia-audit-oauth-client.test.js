import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Exercise the real browser service. Evia belongs to Quixo; browser provider
// credentials must never participate in completed-document recovery.
const source = readFileSync(new URL('../src/services/eviaSignService.js', import.meta.url), 'utf8')
  .replace(/^export \*[^\n]+\n/gm, '')
  .replace(/^import[^\n]+\n/gm, '')
  .replace(/^export /gm, '');
const agreementId = '22222222-2222-4222-8222-222222222222';
const auditTrailUrl = '/storage/documents/retained-audit.pdf';
const json = (payload, status = 200) => Response.json(payload, { status });
function fixture(respond = () => json({ auditTrailUrl }),
  localResponse = () => json({ code: 'EVIA_AUDIT_LOCAL_MISSING' }, 404)) {
  const requests = [], localRequests = [], opened = [];
  let storageReads = 0, storageWrites = 0;
  const context = vm.createContext({
    console, Date, Error, JSON, URL, encodeURIComponent,
    ENV: { EVIA_SIGN_CLIENT_ID: 'configured-client' }, getApiBaseUrl: () => '',
    buildRequestContextHeaders: h => ({ ...h, Authorization: 'Bearer application-session', 'x-tenant-id': 'current-tenant' }),
    localStorage: {
      getItem: () => { storageReads++; throw new Error('Recovery must not read a browser Evia connection'); },
      setItem: () => { storageWrites++; throw new Error('Recovery must not write provider credentials'); }
    },
    window: { location: { origin: 'https://app.example' }, open: (...args) => opened.push(args) },
    fetch: async (url, options) => {
      if (JSON.parse(options.body).localOnly === true) {
        localRequests.push({ url, options }); return localResponse(url, options);
      }
      requests.push({ url, options }); return respond(url, options, requests.length);
    }
  });
  vm.runInContext(source + '\nglobalThis.subject = { recoverEviaAuditTrail, reconcileEviaSignedDocument };', context);
  return { ...context.subject, requests, localRequests, opened, storageCounts: () => ({ storageReads, storageWrites }) };
}
const assertApplicationScope = ({ url, options }, kind) => {
  assert.equal(url, `/api/evia/agreements/${agreementId}/${kind}`);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer application-session');
  assert.equal(options.headers['x-tenant-id'], 'current-tenant');
};
const assertNoProviderConnection = f => {
  assert.deepEqual(f.storageCounts(), { storageReads: 0, storageWrites: 0 });
  assert.equal(f.opened.length, 0);
  assert.ok(f.requests.every(request => request.url !== '/api/evia/token'));
};

test('retained audit recovery uses only application authority and never contacts service retrieval', async () => {
  const f = fixture(() => { throw new Error('No provider recovery'); }, () => json({ auditTrailUrl, recovered: true }));
  assert.equal((await f.recoverEviaAuditTrail(agreementId)).auditTrailUrl, auditTrailUrl);
  assert.equal(f.requests.length, 0); assert.equal(f.localRequests.length, 1);
  assertApplicationScope(f.localRequests[0], 'audit-trail');
  assert.deepEqual(JSON.parse(f.localRequests[0].options.body), { localOnly: true });
  assertNoProviderConnection(f);
});

test('local denial, outage, unrelated missing record or malformed success cannot invoke provider retrieval', async () => {
  for (const [status, code] of [[401, 'API_SESSION_REQUIRED'], [403, 'EVIA_AUDIT_RECOVERY_DENIED'],
    [404, 'OTHER_NOT_FOUND'], [503, 'STORAGE_UNAVAILABLE'], [200, undefined]]) {
    const f = fixture(() => { throw new Error('No provider recovery'); }, () => json({ code }, status));
    await assert.rejects(f.recoverEviaAuditTrail(agreementId), { status });
    assert.equal(f.localRequests.length, 1); assert.equal(f.requests.length, 0);
    assertNoProviderConnection(f);
  }
});

test('confirmed local audit miss uses Quixo server retrieval without landlord Evia credentials', async () => {
  const f = fixture();
  assert.equal((await f.recoverEviaAuditTrail(agreementId)).auditTrailUrl, auditTrailUrl);
  assert.equal(f.requests.length, 1); assert.equal(f.localRequests.length, 1);
  assertApplicationScope(f.requests[0], 'audit-trail');
  assert.deepEqual(JSON.parse(f.requests[0].options.body), {});
  assertNoProviderConnection(f);
});

test('provider authentication failures remain service errors and never ask the customer to sign in to Evia', async () => {
  for (const [status, code] of [[401, 'EVIA_API_KEY_EXCHANGE_FAILED'], [503, 'EVIA_INTEGRATION_API_KEY_REQUIRED'],
    [403, 'EVIA_COMPLETED_DOCUMENT_LIST_FAILED'], [404, 'EVIA_COMPLETED_DOCUMENT_DOWNLOAD_FAILED']]) {
    const f = fixture(() => json({ error: 'provider detail', code }, status));
    await assert.rejects(f.recoverEviaAuditTrail(agreementId), error => {
      assert.equal(error.status, status); assert.equal(error.code, code);
      assert.match(error.message, /try again later or contact support/);
      assert.doesNotMatch(error.message, /Connect|Sign in|provider detail/);
      return true;
    });
    assert.equal(f.requests.length, 1);
    assertNoProviderConnection(f);
  }
});

test('application session rejection and tenant denial retain their own authority without provider login or retry', async () => {
  for (const [status, code] of [[401, 'API_SESSION_REQUIRED'], [403, 'EVIA_AUDIT_RECOVERY_DENIED']]) {
    const f = fixture(() => json({ error: 'application denial', code }, status));
    await assert.rejects(f.recoverEviaAuditTrail(agreementId), { status, code, message: 'application denial' });
    assert.equal(f.requests.length, 1);
    assertNoProviderConnection(f);
  }
});

test('completed signed-document repair also uses server-owned integration credentials', async () => {
  const signedDocumentUrl = '/storage/documents/retained-signed.pdf';
  const f = fixture(() => json({ signedDocumentUrl }));
  assert.equal((await f.reconcileEviaSignedDocument(agreementId)).signedDocumentUrl, signedDocumentUrl);
  assert.equal(f.requests.length, 1); assert.equal(f.localRequests.length, 0);
  assertApplicationScope(f.requests[0], 'signed-document');
  assert.deepEqual(JSON.parse(f.requests[0].options.body), {});
  assertNoProviderConnection(f);
});

test('malformed recovery success cannot be mistaken for a retained audit', async () => {
  const f = fixture(() => json({}));
  await assert.rejects(f.recoverEviaAuditTrail(agreementId), { status: 200 });
  assertNoProviderConnection(f);
});
