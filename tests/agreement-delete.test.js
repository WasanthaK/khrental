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
