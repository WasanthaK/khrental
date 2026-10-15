import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { authorizeSignedAgreementDocumentRead } from '../src/api/evia/signedDocumentAccess.js';

// Real disposable SQL, bearer sessions and React UI. Only the last object-byte
// handler is a controlled local PDF fixture, not an R2 production assertion.
export async function verifyPhase4AgreementSignedDocumentClosure({
  browser, origin, pool, a, b, tokenA, call, createAuthRecord, issueAuthSession, storageProbe
}) {
  const lower = value => String(value || '').toLowerCase();
  const q = async (statement, args = {}) => {
    const request = pool.request();
    for (const [key, value] of Object.entries(args)) request.input(key, value);
    return (await request.query(statement)).recordset || [];
  };
  const createUser = async (tenantId, role) => {
    const email = 'agreement-closure-' + crypto.randomUUID() + '@example.invalid';
    const person = (await q(
      "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, 'Agreement Closure', @email, @role, @role)",
      { tenantId, email, role }
    ))[0];
    const id = lower(person.id);
    await q("INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default) VALUES (@tenantId, @id, @role, 'active', 1)",
      { tenantId, id, role });
    const authId = crypto.randomUUID();
    const record = await createAuthRecord({
      authId, appUserId: id, email, role,
      password: crypto.randomBytes(20).toString('base64url')
    });
    await q('UPDATE app_users SET auth_id = @authId WHERE id = @id AND tenant_id = @tenantId',
      { authId, id, tenantId });
    return { id, tenantId, authId, email, token: (await issueAuthSession(record)).accessToken };
  };
  const adminA = await createUser(a.tenantId, 'admin');
  const adminB = await createUser(b.tenantId, 'admin');
  const otherRenterA = await createUser(a.tenantId, 'rentee');
  const title = 'Phase4 retained document acceptance';
  const requestId = 'agreement-closure-' + crypto.randomUUID();
  const attemptId = crypto.randomUUID();
  const inserted = (await q(
    "INSERT INTO agreements (tenant_id, renteeid, propertyid, title, status, signature_status, eviasignreference, documenturl, pdfurl) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, @title, 'signed', 'completed', @requestId, @original, @original)",
    { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId,
      title, requestId, original: '/storage/documents/tenants/' + a.tenantId + '/agreements/original/draft.pdf' }
  ))[0];
  const agreementId = lower(inserted.id);
  const signedUrl = '/storage/documents/tenants/' + a.tenantId + '/agreements/' + agreementId +
    '/signed/staged/' + attemptId + '/Signed.pdf';
  const oldOriginal = '/storage/documents/tenants/' + a.tenantId + '/agreements/original/draft.pdf';
  await q('UPDATE agreements SET signed_document_url = @signedUrl WHERE id = @agreementId AND tenant_id = @tenantId',
    { signedUrl, agreementId, tenantId: a.tenantId });
  const proof = JSON.stringify({
    agreementId, attemptId, state: 'completed',
    signedDocumentUrl: signedUrl, auditTrailUrl: signedUrl.replace('Signed.pdf','audit_trail.pdf')
  });
  await q("INSERT INTO webhook_events (tenant_id, request_id, event_type, raw_data, processed) VALUES (@tenantId, @requestId, 'evia.archive.lease.v1', @proof, 0)",
    { tenantId: a.tenantId, requestId, proof });
  const hit = (path, token, tenantId) => call(path, { token, tenantId });
  const pdf = async (token, url = signedUrl, tenantId = a.tenantId) => {
    const response = await fetch(origin + url, {
      headers: { Authorization: 'Bearer ' + token, 'x-tenant-id': tenantId }
    });
    return { status: response.status, body: await response.text(), type: response.headers.get('content-type') };
  };
  const deny = async (token, url, status, tenantId) => {
    const before = storageProbe.reads();
    const response = await pdf(token, url, tenantId);
    assert.equal(response.status, status, 'document access status');
    assert.equal(storageProbe.reads(), before, 'denied document must not reach PDF byte transport');
  };
  const before = storageProbe.reads();
  await deny(adminA.token, signedUrl, 403, a.tenantId); // unprocessed publication
  await q("UPDATE webhook_events SET processed=1, processed_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND request_id=@requestId AND event_type='evia.archive.lease.v1'",
    { tenantId:a.tenantId, requestId });
  await deny(otherRenterA.token, signedUrl, 403, a.tenantId);
  await deny(adminB.token, signedUrl, 403, b.tenantId);
  await deny(adminA.token, signedUrl.replace('Signed.pdf','unpublished.pdf'), 403, a.tenantId);
  await deny(adminA.token, signedUrl.replace(attemptId,crypto.randomUUID()), 403, a.tenantId);
  const aAdminPdf = await pdf(adminA.token);
  assert.equal(aAdminPdf.status, 200);
  assert.ok(aAdminPdf.body.startsWith('%PDF-disposable-audit-test'));
  const ownerPdf = await pdf(tokenA);
  assert.equal(ownerPdf.status, 200);
  assert.ok(ownerPdf.body.startsWith('%PDF-disposable-audit-test'));

  const list = async (token, tenantId, query = '') =>
    hit('/api/mssql/agreements?pageSize=500' + query, token, tenantId);
  const foreignList = await list(otherRenterA.token, a.tenantId);
  assert.equal(foreignList.status, 200);
  assert.ok(!JSON.stringify(foreignList.payload).toLowerCase().includes(agreementId));
  const forcedList = await list(otherRenterA.token, a.tenantId, '&renteeId=' + a.renteeId);
  assert.ok(!JSON.stringify(forcedList.payload).toLowerCase().includes(agreementId));
  assert.equal((await hit('/api/mssql/agreements/' + agreementId, otherRenterA.token, a.tenantId)).status, 404);
  assert.equal((await hit('/api/mssql/agreements/' + agreementId, adminB.token, b.tenantId)).status, 404);
  const adminRead = await hit('/api/mssql/agreements/' + agreementId, adminA.token, a.tenantId);
  assert.equal(adminRead.status, 200);
  assert.equal(lower(adminRead.payload?.data?.signed_document_url), lower(signedUrl));

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.evaluateOnNewDocument((token, tenantId, id, email) => {
      localStorage.removeItem('dev_bypass_role');
      localStorage.setItem('khrental.activeTenantId', tenantId);
      localStorage.setItem('khrental.local.session', JSON.stringify({
        access_token: token, user: { id, email, role: 'admin' }
      }));
    }, adminA.token, a.tenantId, adminA.authId, adminA.email);
    await page.goto(origin + '/dashboard/agreements', {
      waitUntil: 'domcontentloaded', timeout: 45000
    });
    await page.waitForFunction(expected => document.body.innerText.includes(expected),
      { timeout: 30000 }, title);
    const scope = await page.evaluate(title => {
      const card = [...document.querySelectorAll('div.border.rounded-lg')]
        .find(element => element.innerText.includes(title)
          && [...element.querySelectorAll('button')].some(b => b.textContent.includes('View Document')));
      if (!card) return false;
      [...card.querySelectorAll('button')]
        .find(b => b.textContent.includes('View Document')).click();
      return true;
    }, title);
    assert.equal(scope, true, 'routed admin card must expose retained signed PDF');
    await page.waitForFunction(() => Boolean(document.querySelector('iframe[title="Agreement Document Viewer"]')),
      { timeout: 15000 });
    const actualSrc = await page.$eval('iframe[title="Agreement Document Viewer"]', el => el.getAttribute('src'));
    assert.equal(lower(actualSrc), lower(signedUrl));
    assert.notEqual(actualSrc, oldOriginal, 'signed card must not fall back to the unsigned original');
  } finally { await context.close(); }

  assert.ok(storageProbe.reads() >= before + 1);
  const malformed = await authorizeSignedAgreementDocumentRead({
    bucket: 'documents', path: 'tenants/' + a.tenantId + '/agreements/' + agreementId + '/signed/',
    tenantId: a.tenantId, user: { id: a.renteeId },
    membership: { tenant_id: a.tenantId, role: 'rentee', status: 'active' },
    loadSignedAgreement: async () => { throw new Error('Empty paths should be denied before SQL'); }
  });
  assert.equal(malformed.allowed, false);
  console.log('PASS: real signed-PDF session isolation, publication proof, renter list ownership, and routed retained-document browser display');
}
