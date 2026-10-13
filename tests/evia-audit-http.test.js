import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAuthenticatedTenantStorageRouter } from '../src/api/storage/authenticatedTenantRoute.js';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '44444444-4444-4444-8444-444444444444';
const agreement = '22222222-2222-4222-8222-222222222222';
const attempt = '33333333-3333-4333-8333-333333333333';
const path = 'tenants/' + tenantA + '/agreements/' + agreement + '/signed/staged/' + attempt + '/audit_trail.pdf';
const url = '/storage/documents/' + path;
const pdfUrl = '/storage/documents/tenants/' + tenantA + '/agreements/' + agreement + '/signed/staged/' + attempt + '/Signed.pdf';
const publication = {
  id: agreement, tenant_id: tenantA, status: 'signed', signature_status: 'completed',
  signed_document_url: pdfUrl, lease_processed: true,
  lease_raw_data: JSON.stringify({ agreementId: agreement, attemptId: attempt, state: 'completed', signedDocumentUrl: pdfUrl, auditTrailUrl: url })
};

test('actual HTTP storage router enforces credential, tenant, role and publication before bytes', async () => {
  let bytesRead = 0, sqlReads = 0, published = publication;
  // Isolated token mapping stands in for SQL-backed authenticateAccessToken.
  // Cookie and bearer HTTP carrier selection is exercised over real requests,
  // but the production token verifier is not mocked as a security proof.
  const sessions = new Map([
    ['admin-A', { id: 'admin', role: 'admin', tenantId: tenantA }],
    ['staff-A', { id: 'staff', role: 'staff', tenantId: tenantA }],
    ['rentee-A', { id: 'rentee', role: 'rentee', tenantId: tenantA }],
    ['admin-B', { id: 'adminB', role: 'admin', tenantId: tenantB }]
  ]);
  const sessionMiddleware = (req, res, next) => {
    const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
    const cookie = /(?:^|;\s*)khrental_storage_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    const key = bearer || cookie;
    if (key && !sessions.has(key)) {
      res.status(401).json({ code: 'INVALID_SESSION' });
      return;
    }
    req.testSubject = sessions.get(key);
    if (req.testSubject) req.authSession = { accessToken: key };
    next();
  };
  const tenantMiddleware = (req, res, next) => {
    if (!req.testSubject) {
      res.status(401).json({ code: 'AUTH_CONTEXT_REQUIRED' });
      return;
    }
    if (req.headers['x-tenant-id'] !== req.testSubject.tenantId) {
      res.status(403).json({ code: 'TENANT_ACCESS_DENIED' });
      return;
    }
    req.tenantId = req.testSubject.tenantId;
    req.user = { id: req.testSubject.id, role: req.testSubject.role };
    req.membership = { role: req.testSubject.role, status: 'active', tenant_id: req.tenantId };
    next();
  };
  const app = express();
  app.use('/storage', createAuthenticatedTenantStorageRouter({
    sessionMiddleware, tenantMiddleware,
    loadPublishedArchive: async () => { sqlReads++; return published; },
    deliveryHandler: (req, res) => {
      bytesRead++;
      res.type('pdf').send(Buffer.from('%PDF-test'));
    }
  }));
  app.use((error, _req, res, _next) => res.status(500).json({ code: error.code || 'TEST_ERROR' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (path, headers) => fetch(base + path, { headers });
  try {
    for (const headers of [
      {},
      { authorization: 'Bearer invalid' },
      { cookie: 'khrental_storage_session=invalid' }
    ]) {
      assert.equal((await request(url, headers)).status, 401);
    }
    for (const token of ['staff-A', 'rentee-A', 'admin-B']) {
      const response = await request(url, { authorization: 'Bearer ' + token });
      assert.equal(response.status, 403);
    }
    assert.equal(sqlReads, 0, 'unauthorized subjects must not query publication evidence');
    assert.equal(bytesRead, 0, 'unauthorized subjects must not read storage');
    const bad = [null, { ...publication, lease_processed: false }, { ...publication, status: 'cancelled' },
      { ...publication, signed_document_url: '/storage/documents/wrong.pdf' },
      { ...publication, lease_raw_data: JSON.stringify({ agreementId: agreement, attemptId: tenantB, state: 'completed', signedDocumentUrl: pdfUrl, auditTrailUrl: url }) }
    ];
    for (const fixture of bad) {
      published = fixture;
      assert.equal((await request(url, { authorization: 'Bearer admin-A' })).status, 403);
    }
    assert.equal(bytesRead, 0, 'unpublished audit bytes must never be accessed');
    published = publication;
    for (const headers of [
      { authorization: 'Bearer admin-A' },
      { cookie: 'khrental_storage_session=admin-A' }
    ]) {
      const response = await request(url, headers);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /^%PDF-test$/);
    }
    assert.equal(bytesRead, 2);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
