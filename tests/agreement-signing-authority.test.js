import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertGenericAgreementWriteSafe, shouldApplyGenericAgreementChange } from '../src/api/mssql/agreementWritePolicy.js';
import { prepareRentalAgreementSignatories, matchesPendingRentalRoster } from '../src/utils/rentalAgreementSignatories.js';
import { updateSignatoryCompletion, markAllSignatoriesCompleted } from '../src/api/evia/webhook.js';

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

test('two required rental signers are validated and pending roster is durable', () => {
  const owner = {name:'Owner',email:'owner@example.invalid',identifier:'landlord',textMarker:'For Landlord:'};
  const tenant = {name:'Tenant',email:'tenant@example.invalid',identifier:'tenant',textMarker:'For Tenant:'};
  assert.throws(() => prepareRentalAgreementSignatories([owner]), /both landlord and tenant/);
  assert.throws(() => prepareRentalAgreementSignatories([owner,{...tenant,email:owner.email}]), /distinct/);
  const {submitted,pending} = prepareRentalAgreementSignatories([owner,tenant]);
  assert.equal(submitted.length,2);
  assert.deepEqual(pending.map(x=>x.status),['pending','pending']);
  assert.ok(matchesPendingRentalRoster(JSON.stringify(pending),pending));
  assert.ok(!matchesPendingRentalRoster(JSON.stringify([pending[0]]),pending));
  const partial = updateSignatoryCompletion(pending,{email:owner.email,eventTime:'2026-10-17T00:00:00Z'});
  assert.deepEqual(partial.map(x=>x.status),['completed','pending']);
  const complete = markAllSignatoriesCompleted(partial,'2026-10-17T00:01:00Z');
  assert.deepEqual(complete.map(x=>x.type),['landlord','tenant']);
  assert.deepEqual(complete.map(x=>x.status),['completed','completed']);
});

test('agreement creation persists roster before Evia provider submission', () => {
  const source = fs.readFileSync(new URL('../src/components/agreements/AgreementFormContainer.jsx',import.meta.url),'utf8');
  assert.ok(source.indexOf('const rosterRecord = await updateAgreementCanonical') < source.indexOf('const signatureResult = await sendDocumentForSignature'));
  assert.match(source,/matchesPendingRentalRoster/);
  assert.match(source,/sentEviaRequestRef.current = true/);
  const form = fs.readFileSync(new URL('../src/components/agreements/SignatureForm.jsx',import.meta.url),'utf8');
  assert.match(form,/if \(index < 2\) return/);
  assert.match(form,/prepareRentalAgreementSignatories\(signatories\)/);
  const card = fs.readFileSync(new URL('../src/components/agreements/AgreementSummaryCard.jsx',import.meta.url),'utf8');
  assert.match(card,/Delivery not tracked/);
});
