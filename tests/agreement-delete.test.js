import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractManagedAgreementStorageObjects,
  getAgreementDeletionEligibility
} from '../src/api/mssql/agreementDeleteRouter.js';

test('allows permanent deletion only for cancelled unsigned agreements', () => {
  assert.deepEqual(getAgreementDeletionEligibility({
    id: 'f2de49bb-d787-4319-8233-654059273b53',
    status: 'cancelled',
    signature_status: 'pending'
  }), { ok: true });
});

test('rejects non-cancelled agreements', () => {
  const result = getAgreementDeletionEligibility({ status: 'draft' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AGREEMENT_DELETE_STATUS_NOT_ALLOWED');
});

test('retains cancelled agreements with signing or activation history', () => {
  for (const agreement of [
    { status: 'cancelled', signeddate: '2026-09-19T00:00:00Z' },
    { status: 'cancelled', activated_at: '2026-09-19T00:00:00Z' },
    { status: 'cancelled', signature_completed_at: '2026-09-19T00:00:00Z' },
    { status: 'cancelled', signature_status: 'signing_complete' },
    { status: 'cancelled', signed_document_url: 'https://example.com/signed.pdf' }
  ]) {
    const result = getAgreementDeletionEligibility(agreement);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AGREEMENT_DELETE_HISTORICAL_RECORD');
  }
});

test('extracts only exact KH Rentals storage objects for the same tenant and agreement', () => {
  const tenantId = 'feec0269-d580-49c3-a982-5b3ecbbb1a09';
  const agreementId = 'f2de49bb-d787-4319-8233-654059273b53';
  const agreement = {
    id: agreementId,
    documenturl: `https://khrental.example/storage/files/tenants/${tenantId}/agreements/${agreementId}/final_agreement.pdf`,
    pdfurl: `https://khrental.example/storage/files/tenants/${tenantId}/agreements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/other.pdf`,
    signatureurl: 'https://evia.enadocapp.com/external/signed.pdf'
  };

  assert.deepEqual(extractManagedAgreementStorageObjects(agreement, tenantId), [{
    bucket: 'files',
    path: `tenants/${tenantId}/agreements/${agreementId}/final_agreement.pdf`
  }]);
});


test('Phase 5: deleted agreements must be cancelled with no historical signature evidence', () => {
  assert.deepEqual(getAgreementDeletionEligibility(null), {
    ok: false, status: 404, code: 'AGREEMENT_NOT_FOUND', message: 'Agreement not found.'
  });
  assert.deepEqual(getAgreementDeletionEligibility({
    status: ' CANCELLED ', signature_status: 'pending'
  }), { ok: true });
  for (const signature_status of [
    'completed', 'complete', 'signed', 'signing_complete', 'signed_by_landlord', 'signed_by_tenant'
  ]) {
    const result = getAgreementDeletionEligibility({
      status: 'cancelled', signature_status
    });
    assert.equal(result.ok, false, signature_status);
    assert.equal(result.code, 'AGREEMENT_DELETE_HISTORICAL_RECORD');
  }
  for (const field of ['signeddocumenturl', 'signed_document_url', 'signature_pdf_url']) {
    const result = getAgreementDeletionEligibility({
      status: 'cancelled',
      [field]: '/storage/documents/retained-agreement.pdf'
    });
    assert.equal(result.code, 'AGREEMENT_DELETE_HISTORICAL_RECORD', field);
  }
});

test('Phase 5: agreement cleanup enumerates only its own managed objects and deduplicates fields', () => {
  const tenantId = 'feec0269-d580-49c3-a982-5b3ecbbb1a09';
  const agreementId = 'f2de49bb-d787-4319-8233-654059273b53';
  const ownPath = `tenants/${tenantId}/agreements/${agreementId}/draft.pdf`;
  const otherTenant = 'abababab-abab-4bab-8bab-abababababab';
  const fixture = {
    id: agreementId,
    documenturl: '/storage/files/' + ownPath,
    pdfurl: '/storage/files/' + ownPath,
    signatureurl: `/storage/files/tenants/${otherTenant}/agreements/${agreementId}/draft.pdf`,
    signeddocumenturl: '/storage/files/tenants/' + tenantId
      + '/agreements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/foreign.pdf'
  };
  assert.deepEqual(extractManagedAgreementStorageObjects(fixture, tenantId), [
    { bucket: 'files', path: ownPath }
  ]);
});
