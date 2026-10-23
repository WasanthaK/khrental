import test from 'node:test';
import fs from 'node:fs';
import { getEviaAuditTrailUrl } from '../src/utils/eviaAuditTrailLink.js';
import { describeEviaAuditFetchFailure } from '../src/utils/eviaAuditFailure.js';
import assert from 'node:assert/strict';
import { parseHistoricEviaAuditTrailPath, authorizeHistoricEviaAuditTrailRead } from '../src/api/evia/auditTrailAccess.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const agreementId = '22222222-2222-4222-8222-222222222222';
const path = 'tenants/' + tenantId + '/agreements/' + agreementId + '/signed/audit_trail.pdf';
const pdf = '/storage/documents/tenants/' + tenantId + '/agreements/' + agreementId + '/signed/Signed.pdf';
const row = { id: agreementId, tenant_id: tenantId, status: 'signed',
  signature_status: 'completed', signed_document_url: pdf };
const membership = { role: 'admin', status: 'active', tenant_id: tenantId };
const baseline = { bucket: 'documents', path, tenantId,
  user: { id: 'admin', role: 'admin' }, membership };

test('historic exact audit path is recognized, signed document is not', () => {
  assert.deepEqual(parseHistoricEviaAuditTrailPath('documents', path), { tenantId, agreementId });
  assert.equal(parseHistoricEviaAuditTrailPath('documents', path.replace('audit_trail.pdf', 'Signed.pdf')), null);
  assert.equal(parseHistoricEviaAuditTrailPath('images', path), null);
  assert.equal(parseHistoricEviaAuditTrailPath('documents', path.replace('/signed/', '/signed/staged/')), null);
});
test('historic audit access denies renter, staff, inactive member and foreign tenant before SQL', async () => {
  for (const diff of [
    { user: { id: 'renter', role: 'rentee' }, membership: { role: 'rentee', status: 'active', tenant_id: tenantId } },
    { user: { id: 'staff', role: 'staff' }, membership: { role: 'staff', status: 'active', tenant_id: tenantId, permission_bundle: 'property_operations' } },
    { membership: { ...membership, status: 'inactive' } },
    { tenantId: '33333333-3333-4333-8333-333333333333' }
  ]) {
    const result = await authorizeHistoricEviaAuditTrailRead({ ...baseline, ...diff,
      loadHistoricAgreement: async () => { throw new Error('must not query'); } });
    assert.equal(result.applies, true);
    assert.equal(result.allowed, false);
  }
});
test('historic audit access requires signed and completed retained agreement in same tenant', async () => {
  let reads = 0;
  const loadHistoricAgreement = async () => { reads++; return row; };
  assert.deepEqual(await authorizeHistoricEviaAuditTrailRead({
    ...baseline, loadHistoricAgreement }), { applies: true, allowed: true });
  assert.equal(reads, 1);
  for (const status of ['completed','active']) {
    assert.deepEqual(await authorizeHistoricEviaAuditTrailRead({
      ...baseline, loadHistoricAgreement: async () => ({ ...row, status })
    }), { applies: true, allowed: true });
  }
  for (const invalid of [
    null, { ...row, status: 'cancelled' }, { ...row, status: 'draft' }, { ...row, signature_status: 'in_progress' },
    { ...row, tenant_id: '33333333-3333-4333-8333-333333333333' },
    { ...row, signed_document_url: null },
    { ...row, signed_document_url: '/storage/documents/other.pdf' },
    { ...row, signed_document_url: pdf.replace('Signed.pdf', 'staged/another.pdf') }
  ]) {
    const result = await authorizeHistoricEviaAuditTrailRead({
      ...baseline, loadHistoricAgreement: async () => invalid });
    assert.equal(result.allowed, false);
  }
});

test('retained signed document hint yields a same-tenant protected audit candidate', () => {
  const origin = 'https://khrentals.example.invalid';
  const base = '/storage/documents/tenants/' + tenantId + '/agreements/' + agreementId + '/signed/';
  const context = { agreementId, tenantId, origin };
  assert.equal(getEviaAuditTrailUrl({ ...context, signedDocumentUrl: base + 'Rental_Agreement.pdf' }), base + 'audit_trail.pdf');
  const attempt = '33333333-3333-4333-8333-333333333333';
  assert.equal(getEviaAuditTrailUrl({ ...context, signedDocumentUrl: base + 'staged/' + attempt + '/Signed.pdf' }), base + 'staged/' + attempt + '/audit_trail.pdf');
  for (const signedDocumentUrl of [
    null, 'https://evil.example.invalid' + base + 'Signed.pdf',
    base.replace(tenantId, '44444444-4444-4444-8444-444444444444') + 'Signed.pdf',
    base.replace(agreementId, '44444444-4444-4444-8444-444444444444') + 'Signed.pdf',
    base + '../audit_trail.pdf', base + 'audit_trail.pdf', base + 'Signed.pdf?token=123',
    '/storage/documents/tenants/' + tenantId + '/agreements/' + agreementId + '/pending/Signed.pdf'
  ]) {
    assert.equal(getEviaAuditTrailUrl({ ...context, signedDocumentUrl }), null);
  }
});

test('audit viewer UI is admin-scoped, server enforced and reports unavailable bytes', () => {
  const card = fs.readFileSync(new URL('../src/components/agreements/AgreementSummaryCard.jsx', import.meta.url), 'utf8');
  const details = fs.readFileSync(new URL('../src/pages/AgreementDetails.jsx', import.meta.url), 'utf8');
  const viewer = fs.readFileSync(new URL('../src/components/agreements/AgreementDocument.jsx', import.meta.url), 'utf8');
  const protectedReader = fs.readFileSync(new URL('../src/hooks/useAuthenticatedAgreementDocument.js', import.meta.url), 'utf8');
  for (const source of [card, details]) {
    assert.match(source, /isAdministrator\(\{ user, membership \}\)/);
    assert.match(source, /getEviaAuditTrailUrl/);
    assert.match(source, /View Signing Audit/);
  }
  assert.match(viewer, /useAuthenticatedAgreementDocument\(documentUrl, reloadKey\)/);
  assert.match(protectedReader, /buildRequestContextHeaders\(\)/);
  assert.match(protectedReader, /describeEviaAuditFetchFailure\(/);
});


test('audit retrieval failures distinguish protected access, absent bytes and invalid PDFs', () => {
  const base = 'https://khrentals.example.invalid/storage/documents/tenants/' + tenantId
    + '/agreements/' + agreementId + '/signed/';
  const url = base + 'audit_trail.pdf';
  assert.match(describeEviaAuditFetchFailure({ documentUrl:url, status:403 }), /Access denied.*HTTP 403/);
  assert.match(describeEviaAuditFetchFailure({ documentUrl:url, status:404 }), /not found.*HTTP 404/);
  assert.match(describeEviaAuditFetchFailure({ documentUrl:url, status:500 }), /HTTP 500/);
  assert.match(describeEviaAuditFetchFailure({ documentUrl:url, status:401 }), /HTTP 401/);
  assert.match(describeEviaAuditFetchFailure({ documentUrl:url, invalidPdf:true }), /not a valid PDF/);
  assert.match(describeEviaAuditFetchFailure({ documentUrl:base+'staged/33333333-3333-4333-8333-333333333333/audit_trail.pdf',status:404 }), /HTTP 404/);
  assert.equal(describeEviaAuditFetchFailure({ documentUrl:base+'Signed.pdf',status:404 }), 'Unable to retrieve this document. Check access and try again.');
  assert.equal(describeEviaAuditFetchFailure({ documentUrl:url }), 'Unable to retrieve this document. Check access and try again.');
});
