import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSignedAgreementDocumentPath,
  authorizeSignedAgreementDocumentRead
} from '../src/api/evia/signedDocumentAccess.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const foreignTenantId = '22222222-2222-4222-8222-222222222222';
const agreementId = '33333333-3333-4333-8333-333333333333';
const ownerId = '44444444-4444-4444-8444-444444444444';
const strangerId = '66666666-6666-4666-8666-666666666666';
const attemptId = '55555555-5555-4555-8555-555555555555';
const stablePath = `tenants/${tenantId}/agreements/${agreementId}/signed/Signed.pdf`;
const stagedPath = `tenants/${tenantId}/agreements/${agreementId}/signed/staged/${attemptId}/Signed.pdf`;
const storageUrl = path => '/storage/documents/' + path;
const renter = { id: ownerId, role: 'rentee' };
const renterMembership = { tenant_id: tenantId, role: 'rentee', status: 'active' };
const administrator = { id: strangerId, role: 'admin' };
const adminMembership = { tenant_id: tenantId, role: 'admin', status: 'active' };

const retainedAgreement = (path = stablePath) => ({
  id: agreementId,
  tenant_id: tenantId,
  renteeid: ownerId,
  status: 'signed',
  signature_status: 'completed',
  eviasignreference: 'evia-request-1',
  signed_document_url: storageUrl(path)
});
const publishedArchive = (overrides = {}) => ({
  tenant_id: tenantId,
  id: agreementId,
  lease_processed: true,
  signed_document_url: storageUrl(stagedPath),
  lease_raw_data: JSON.stringify({
    state: 'completed',
    agreementId,
    attemptId,
    signedDocumentUrl: storageUrl(stagedPath)
  }),
  ...overrides
});
const check = (options = {}) => authorizeSignedAgreementDocumentRead({
  bucket: 'documents',
  path: stablePath,
  tenantId,
  user: renter,
  membership: renterMembership,
  loadSignedAgreement: async () => retainedAgreement(),
  ...options
});

test('Phase 5: only exact signed PDF paths receive the signed-document ACL', () => {
  assert.deepEqual(parseSignedAgreementDocumentPath('documents', stablePath), {
    tenantId, agreementId,
    relativePath: 'Signed.pdf',
    url: storageUrl(stablePath)
  });
  assert.equal(parseSignedAgreementDocumentPath('images', stablePath), null);
  assert.equal(parseSignedAgreementDocumentPath('documents', 'tenants/' + tenantId + '/files/' + agreementId), null);
});

test('Phase 5: completed retained signed PDFs are visible to owner and same-tenant administrator only', async () => {
  assert.deepEqual(await check(), { applies: true, allowed: true });
  assert.deepEqual(await check({ user: administrator, membership: adminMembership }), {
    applies: true, allowed: true
  });
  const otherRenter = await check({ user: { id: strangerId, role: 'rentee' } });
  assert.deepEqual(otherRenter, { applies: true, allowed: false, reason: 'not_agreement_owner' });
  const finance = await check({
    user: { id: strangerId, role: 'finance_staff' },
    membership: { tenant_id: tenantId, role: 'finance_staff', status: 'active' }
  });
  assert.deepEqual(finance, { applies: true, allowed: false, reason: 'not_agreement_owner' });
});

test('Phase 5: invalid membership, foreign tenant and paths fail before agreement lookup', async () => {
  let lookups = 0;
  const loader = async () => { lookups += 1; return retainedAgreement(); };
  for (const options of [
    { tenantId: foreignTenantId },
    { membership: { ...renterMembership, tenant_id: foreignTenantId } },
    { membership: { ...renterMembership, status: 'inactive' } },
    { membership: null },
    { user: null },
    { path: `tenants/${foreignTenantId}/agreements/${agreementId}/signed/Signed.pdf` },
    { path: `tenants/${tenantId}/agreements/${agreementId}/signed/` },
    { path: `tenants/${tenantId}/agreements/${agreementId}/signed/Signed.png` }
  ]) {
    const result = await check({ ...options, loadSignedAgreement: loader });
    assert.equal(result.applies, true);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'tenant_or_path_denied');
  }
  assert.equal(lookups, 0);
});

test('Phase 5: incomplete signing and wrong retained object never disclose a PDF', async () => {
  const failures = [
    { status: 'draft' },
    { signature_status: 'pending' },
    { tenant_id: foreignTenantId },
    { id: strangerId },
    { signed_document_url: null },
    { signed_document_url: storageUrl(stagedPath) }
  ];
  for (const fields of failures) {
    const result = await check({
      loadSignedAgreement: async () => ({ ...retainedAgreement(), ...fields })
    });
    assert.equal(result.applies, true);
    assert.equal(result.allowed, false, JSON.stringify(fields));
  }
});

test('Phase 5: staged signed PDF requires a published matching completion lease', async () => {
  const base = {
    path: stagedPath,
    loadSignedAgreement: async () => retainedAgreement(stagedPath),
    loadPublishedArchive: async () => publishedArchive()
  };
  assert.deepEqual(await check(base), { applies: true, allowed: true });
  for (const record of [
    null,
    publishedArchive({ lease_processed: false }),
    publishedArchive({ tenant_id: foreignTenantId }),
    publishedArchive({ id: strangerId }),
    publishedArchive({ signed_document_url: storageUrl(stablePath) }),
    publishedArchive({ lease_raw_data: 'not json' }),
    publishedArchive({ lease_raw_data: JSON.stringify({ state: 'prepared', agreementId, attemptId, signedDocumentUrl: storageUrl(stagedPath) }) }),
    publishedArchive({ lease_raw_data: JSON.stringify({ state: 'completed', agreementId, attemptId: strangerId, signedDocumentUrl: storageUrl(stagedPath) }) })
  ]) {
    const result = await check({
      ...base,
      loadPublishedArchive: async () => record
    });
    assert.deepEqual(result, { applies: true, allowed: false, reason: 'archive_not_published' });
  }
  assert.deepEqual(await check({ ...base, loadPublishedArchive: undefined }), {
    applies: true, allowed: false, reason: 'archive_not_published'
  });
});
