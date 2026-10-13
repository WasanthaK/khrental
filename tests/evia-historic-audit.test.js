import test from 'node:test';
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
  for (const invalid of [
    null, { ...row, status: 'active' }, { ...row, signature_status: 'in_progress' },
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
