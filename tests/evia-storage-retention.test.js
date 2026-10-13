import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEviaEvidenceDeletionAllowed } from '../src/api/storage/eviaEvidenceRetention.js';
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
