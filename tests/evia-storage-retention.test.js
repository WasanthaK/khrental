import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertEviaEvidenceDeletionAllowed, assertEviaGenericDocumentUploadAllowed } from '../src/api/storage/eviaEvidenceRetention.js';
import { getStorageDriver } from '../src/api/storage/index.js';

const tenant = 'feec0269-d580-49c3-a982-5b3ecbbb1a09';
const agreement = 'f2de49bb-d787-4319-8233-654059273b53';
const root = `tenants/${tenant}/agreements/${agreement}/signed`;
const checkDenied = (fn) => assert.throws(fn, (error) => error.status === 403 && error.code === 'EVIA_EVIDENCE_DELETE_DENIED');

test('generic document deletion cannot remove staged Evia archives or recursive ancestors', () => {
  for (const path of [
    '', 'tenants', `tenants/${tenant}`, `tenants/${tenant}/agreements`,
    `tenants/${tenant}/agreements/${agreement}`, root,
    root + '/staged', root + '/staged/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    root + '/staged/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/audit_trail.pdf'
  ]) checkDenied(() => assertEviaEvidenceDeletionAllowed('documents', [path]));
});

test('document bucket purge and empty object deletion are denied', () => {
  checkDenied(() => assertEviaEvidenceDeletionAllowed('documents'));
  checkDenied(() => assertEviaEvidenceDeletionAllowed('documents', []));
  checkDenied(() => assertEviaEvidenceDeletionAllowed('documents', ['tenant-safe.txt', root + '/staged']));
});

test('unrelated document objects and buckets retain prior deletion behavior', () => {
  assert.doesNotThrow(() => assertEviaEvidenceDeletionAllowed('documents', [`tenants/${tenant}/other.pdf`]));
  assert.doesNotThrow(() => assertEviaEvidenceDeletionAllowed('images', [root + '/staged']));
  assert.doesNotThrow(() => assertEviaEvidenceDeletionAllowed('images'));
});

test('live storage driver refuses document bucket deletion before touching filesystem or R2', async () => {
  const driver = getStorageDriver();
  await assert.rejects(driver.deleteBucket('documents'), { code: 'EVIA_EVIDENCE_DELETE_DENIED' });
  await assert.rejects(driver.deleteObjects('documents', [root + '/staged']), { code: 'EVIA_EVIDENCE_DELETE_DENIED' });
});

test('generic uploads cannot replace stable or staged signed agreement evidence', () => {
  for (const location of [
    root, root + '/Signed.pdf', root + '/audit_trail.pdf',
    root + '/staged', root + '/staged/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/Signed.pdf',
    root.replace('/signed', '/signed\\staged\\aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\\audit_trail.pdf')
  ]) assert.throws(() => assertEviaGenericDocumentUploadAllowed('documents', location),
    { status: 403, code: 'EVIA_EVIDENCE_UPLOAD_DENIED' });
});

test('generic uploads outside signing evidence retain existing behavior', () => {
  assert.doesNotThrow(() => assertEviaGenericDocumentUploadAllowed('documents', 'tenants/' + tenant + '/other.pdf'));
  assert.doesNotThrow(() => assertEviaGenericDocumentUploadAllowed('documents', 'tenants/' + tenant + '/agreements/' + agreement + '/lease-draft.pdf'));
  assert.doesNotThrow(() => assertEviaGenericDocumentUploadAllowed('images', root + '/audit_trail.pdf'));
});

test('platform upload applies generic evidence guard before invoking driver', () => {
  const source = readFileSync(new URL('../src/api/platform/router.js', import.meta.url), 'utf8');
  const uploadStart = source.indexOf("router.post('/storage/upload'");
  const uploadEnd = source.indexOf("router.delete('/storage/objects'", uploadStart);
  const upload = source.slice(uploadStart, uploadEnd);
  assert.ok(uploadStart >= 0 && uploadEnd > uploadStart);
  assert.ok(upload.indexOf('assertEviaGenericDocumentUploadAllowed(') >= 0);
  assert.ok(upload.indexOf('assertEviaGenericDocumentUploadAllowed(') < upload.indexOf('getStorageDriver().upload('));
});
