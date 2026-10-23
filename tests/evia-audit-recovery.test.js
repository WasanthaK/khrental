import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { recoverHistoricEviaAudit } from '../src/api/evia/auditRecovery.js';
import { createEviaAuditRecoveryRouter } from '../src/api/evia/auditRecoveryRouter.js';
import { R2StorageDriver } from '../src/api/storage/index.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const agreementId = '22222222-2222-4222-8222-222222222222';
const path = `tenants/${tenantId}/agreements/${agreementId}/signed/audit_trail.pdf`;
const row = { id: agreementId, tenant_id: tenantId, status: 'active', signature_status: 'completed',
  eviasignreference: 'stored-request', signed_document_url: `/storage/documents/tenants/${tenantId}/agreements/${agreementId}/signed/Signed.pdf` };
const pdf = Buffer.from('%PDF-1.7 existing provider audit');
const url = 'https://evia.enadocapp.com/_apis/sign/api/v2/documents/audit/download';
const response = (payload, status = 200) => ({ ok: status < 400, status,
  headers: { get: () => Buffer.isBuffer(payload) ? 'application/pdf' : 'application/json' },
  json: async () => payload, text: async () => JSON.stringify(payload), arrayBuffer: async () => payload });
const fixture = () => {
  let retained, writes = 0, reads = 0;
  const calls = [];
  const args = {
    agreementId, tenantId, user: { id: 'admin', role: 'admin' },
    membership: { role: 'admin', status: 'active', tenant_id: tenantId },
    loadAgreement: async (id, tenant) => { reads++; assert.equal(id, agreementId); assert.equal(tenant, tenantId); return row; },
    accessToken: 'test-token',
    fetchImpl: async request => {
      calls.push(request);
      if (request.endsWith('/requests/stored-request/documents')) return response([
        { documentName: 'Signed.pdf', downloadUrl: url.replace('/audit/', '/signed/') },
        { documentName: 'audit_trail.pdf', downloadUrl: url }
      ]);
      assert.equal(request, url, 'must not download the already retained signed agreement');
      return response(pdf);
    },
    storageDriver: {
      getObject: async (bucket, key) => {
        assert.equal(bucket, 'documents'); assert.equal(key, path);
        if (!retained) throw Object.assign(new Error('missing'), { status: 404 });
        return { body: retained };
      },
      createEviaAuditIfAbsent: async (bucket, key, body) => {
        assert.equal(bucket, 'documents'); assert.equal(key, path); writes++;
        retained ||= body;
      }
    }
  };
  return { args, calls, setRetained: value => { retained = value; }, counts: () => ({ writes, reads }) };
};

test('recovers the missing audit independently and repeat recovery never contacts provider or writes', async () => {
  const f = fixture();
  assert.deepEqual(await recoverHistoricEviaAudit(f.args), { auditTrailUrl: '/storage/documents/' + path, recovered: true });
  assert.equal(f.calls.length, 2);
  assert.deepEqual(await recoverHistoricEviaAudit(f.args), { auditTrailUrl: '/storage/documents/' + path, recovered: false });
  assert.equal(f.calls.length, 2); assert.equal(f.counts().writes, 1);
});

test('server integration connection recovers without browser OAuth and refreshes an expired provider token once', async () => {
  const f = fixture(); let exchanges = 0, lists = 0;
  const normalFetch = f.args.fetchImpl;
  const fetchImpl = async (request, options) => {
    if (request.endsWith('/oauth/exchange')) {
      assert.equal(options.headers['X-Api-Key'], 'server-key');
      return response({ access_token: `integration-token-${++exchanges}` });
    }
    if (request.includes('/requests/stored-request/documents')) {
      assert.equal(options.headers.Authorization, `Bearer integration-token-${exchanges}`);
      if (++lists === 1) return response({ error: 'expired' }, 401);
    }
    return normalFetch(request, options);
  };
  const result = await recoverHistoricEviaAudit({ ...f.args, accessToken: '', apiKey: 'server-key', fetchImpl });
  assert.equal(result.recovered, true); assert.equal(exchanges, 2); assert.equal(lists, 2);
  assert.equal(f.counts().writes, 1);
});

test('denies unauthorized users before provider, storage or agreement lookup', async () => {
  for (const changes of [
    { user: null }, { membership: { role: 'rentee', status: 'active', tenant_id: tenantId } },
    { membership: { role: 'staff', status: 'active', tenant_id: tenantId } },
    { membership: { role: 'admin', status: 'inactive', tenant_id: tenantId } },
    { membership: { role: 'admin', status: 'active', tenant_id: agreementId } }
  ]) {
    const f = fixture();
    await assert.rejects(recoverHistoricEviaAudit({ ...f.args, ...changes }), { status: 403 });
    assert.deepEqual(f.counts(), { writes: 0, reads: 0 }); assert.equal(f.calls.length, 0);
  }
});

test('foreign, incomplete or fenced agreement evidence cannot be recovered through historic route', async () => {
  for (const agreement of [null, { ...row, tenant_id: agreementId }, { ...row, signature_status: 'pending' },
    { ...row, signed_document_url: row.signed_document_url.replace('/Signed.pdf', '/staged/attempt/Signed.pdf') }]) {
    const f = fixture();
    await assert.rejects(recoverHistoricEviaAudit({ ...f.args, loadAgreement: async () => agreement }));
    assert.equal(f.calls.length, 0); assert.equal(f.counts().writes, 0);
  }
});

test('missing, ambiguous and invalid provider audits fail without a write', async () => {
  for (const documents of [[], [{ documentName: 'Signed.pdf', downloadUrl: url }],
    [{ documentName: 'audit_trail.pdf', downloadUrl: url }, { documentName: 'AUDIT_TRAIL.PDF', downloadUrl: url }]]) {
    const f = fixture();
    await assert.rejects(recoverHistoricEviaAudit({ ...f.args, fetchImpl: async () => response(documents) }));
    assert.equal(f.counts().writes, 0);
  }
  const f = fixture();
  await assert.rejects(recoverHistoricEviaAudit({ ...f.args, fetchImpl: async request => request === url
    ? response(Buffer.from('not a PDF')) : response([{ documentName: 'audit_trail.pdf', downloadUrl: url }]) }), { code: 'EVIA_AUDIT_PDF_INVALID' });
  assert.equal(f.counts().writes, 0);
});

test('storage outage and corrupt retained audit do not trigger overwrite or provider fetch', async () => {
  for (const error of [Object.assign(new Error('storage unavailable'), { status: 503 }), null]) {
    const f = fixture(); f.setRetained(Buffer.from('invalid existing object'));
    if (error) f.args.storageDriver.getObject = async () => { throw error; };
    await assert.rejects(recoverHistoricEviaAudit(f.args));
    assert.equal(f.calls.length, 0); assert.equal(f.counts().writes, 0);
  }
});

test('concurrent conflicting creation is detected through exact readback', async () => {
  const f = fixture();
  f.args.storageDriver.createEviaAuditIfAbsent = async () => { f.setRetained(Buffer.from('%PDF-conflicting audit')); };
  await assert.rejects(recoverHistoricEviaAudit(f.args), { code: 'EVIA_AUDIT_READBACK_CONFLICT' });
});

test('R2 audit creation is conditional and cannot target signed or fenced documents', async () => {
  const driver = Object.create(R2StorageDriver.prototype);
  driver.logicalBuckets = ['documents'];
  driver.request = async (method, key, options) => {
    assert.equal(method, 'PUT'); assert.equal(key, 'documents/' + path);
    assert.equal(options.headers['if-none-match'], '*'); assert.equal(options.headers['content-type'], 'application/pdf');
    throw Object.assign(new Error('already exists'), { status: 412 });
  };
  assert.equal(await driver.createEviaAuditIfAbsent('documents', path, pdf), 'exists');
  for (const key of [path.replace('audit_trail.pdf', 'Signed.pdf'), path.replace('/signed/', '/signed/staged/attempt/'), '../audit_trail.pdf']) {
    await assert.rejects(driver.createEviaAuditIfAbsent('documents', key, pdf));
  }
});

test('HTTP recovery route requires session and tenant context and ignores caller-selected provider/path values', async () => {
  const f = fixture(); const app = express(); app.use(express.json());
  app.use(createEviaAuditRecoveryRouter({
    requireApiSession: (req, res, next) => req.headers.authorization === 'Bearer admin' ? next() : res.sendStatus(401),
    resolveTenantContext: (req, res, next) => {
      if (req.headers['x-tenant-id'] !== tenantId) return res.sendStatus(403);
      Object.assign(req, { tenantId, user: f.args.user, membership: f.args.membership }); next();
    },
    loadAgreement: f.args.loadAgreement,
    recoverAudit: args => recoverHistoricEviaAudit({ ...f.args, ...args })
  }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ code: err.code }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const target = `http://127.0.0.1:${server.address().port}/agreements/${agreementId}/audit-trail`;
    assert.equal((await fetch(target, { method: 'POST' })).status, 401);
    assert.equal((await fetch(target, { method: 'POST', headers: { authorization: 'Bearer admin', 'x-tenant-id': agreementId } })).status, 403);
    const result = await fetch(target, { method: 'POST', headers: { authorization: 'Bearer admin', 'x-tenant-id': tenantId, 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'foreign-request', path: 'other.pdf', accessToken: 'test-token' }) });
    assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal((await result.json()).auditTrailUrl, '/storage/documents/' + path);
    assert.equal(f.calls[0].includes('foreign-request'), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
