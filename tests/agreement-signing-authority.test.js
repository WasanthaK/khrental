import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertGenericAgreementWriteSafe, shouldApplyGenericAgreementChange } from '../src/api/mssql/agreementWritePolicy.js';

const denied = { status: 409, code: 'AGREEMENT_SIGNING_AUTHORITY_REQUIRED' };
test('generic agreement CRUD cannot forge terminal signed states and evidence', () => {
  assert.equal(assertGenericAgreementWriteSafe({ status: 'draft' }), true);
  assert.equal(assertGenericAgreementWriteSafe({
    status: 'pending_signature', signature_status: 'pending',
    eviasignreference: 'provider-outbound-request',
    signatories_status: [{ email: 'signer@example.invalid', status: 'pending' }]
  }), true);
  for (const payload of [
    { status: 'signed' }, { status: 'COMPLETED' }, { status: 'active' },
    { signature_status: 'completed' },
    { signature_completed_at: new Date().toISOString() },
    { signed_document_url: 'https://evia.enadocapp.com/final.pdf' },
    { signeddocumenturl: '/storage/documents/forged.pdf' },
    { signature_pdf_url: '/storage/documents/forged.pdf' },
    { signatories_status: JSON.stringify([{ status: 'completed', signed_at: 'today' }]) }
  ]) {
    assert.throws(() => assertGenericAgreementWriteSafe(payload), e =>
      e.status === denied.status && e.code === denied.code);
  }
  assert.equal(shouldApplyGenericAgreementChange('signed_document_url'), false);
  assert.equal(shouldApplyGenericAgreementChange('notes'), true);
});

test('signed agreement state is immutable in SQL even for generic writable fields', () => {
  const source = fs.readFileSync(new URL('../src/api/mssql/repositories.js', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf('export const updateAgreement ='), source.indexOf('export const deleteAgreementById ='));
  assert.match(update, /SIGNED_AGREEMENT_IMMUTABLE/);
  assert.match(update, /AND LOWER\(LTRIM\(RTRIM\(COALESCE\(status,/);
  assert.match(update, /AND LOWER\(LTRIM\(RTRIM\(COALESCE\(signature_status,/);
});

test('browser Evia polling cannot invent terminal state or external signed-document URLs', () => {
  const source = fs.readFileSync(new URL('../src/components/agreements/AgreementActions.jsx', import.meta.url), 'utf8');
  const begin = source.indexOf('const checkSignatureStatus = async');
  const end = source.indexOf('const handleSendForSignature = async');
  const polling = source.slice(begin, end);
  assert.ok(begin >= 0 && end > begin);
  assert.doesNotMatch(polling, /updateAgreementData\(/);
  assert.doesNotMatch(polling, /downloadSignedDocument\(/);
  assert.match(polling, /completion_poll_waiting_for_verified_archive/);
});

test('verified Evia webhook does not publish remote provider URLs as archive proof', () => {
  const source = fs.readFileSync(new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /signedDocumentUrl\s*=\s*extractSignedDocumentUrl\(payload\)/);
  assert.match(source, /provider_document_url_not_retained/);
});
