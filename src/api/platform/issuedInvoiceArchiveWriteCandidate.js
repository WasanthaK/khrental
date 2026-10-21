import { normalizeInvoiceDocumentSnapshot } from './invoicePdfCandidate.js';
import {
  prepareInvoiceArchiveCandidate,
  readRetainedInvoiceArchiveCandidate
} from './issuedInvoiceArchiveCandidate.js';

// Feature-gated orchestrator for issued invoices. The live delivery router
// must provide a guarded conditional-create object store and a transactionally
// fenced issuance/archive SQL adapter. Never overwrite an issued document.
const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};
const hex64 = /^[0-9a-f]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId = (value, label) => {
  if (typeof value !== 'string' || !uuid.test(value)) {
    fail('INVOICE_ARCHIVE_INVALID', 'Invalid ' + label);
  }
  return value.toLowerCase();
};
const assertFns = (adapters, names) => {
  if (!adapters || typeof adapters !== 'object') {
    fail('INVOICE_ARCHIVE_ADAPTER_REQUIRED','Archive adapters must be provided.');
  }
  for (const name of names) {
    if (typeof adapters[name] !== 'function') {
      fail('INVOICE_ARCHIVE_ADAPTER_REQUIRED','Required guarded archive adapter missing: ' + name);
    }
  }
};
const assertIssuance = (source, expected) => {
  if (!source || typeof source !== 'object' ||
      validId(source.tenantId,'issuance tenant ID') !== expected.tenantId ||
      validId(source.invoiceId,'issuance invoice ID') !== expected.invoiceId ||
      source.issued !== true ||
      typeof source.snapshotSha256 !== 'string' || !hex64.test(source.snapshotSha256) ||
      source.snapshotSha256 !== expected.snapshotSha256) {
    fail('INVOICE_ARCHIVE_ISSUANCE_MISMATCH',
      'Canonical issued invoice evidence is missing or has a different snapshot.');
  }
};
const assertCommittedDescriptor = (existing, expected) => {
  if (!existing || typeof existing !== 'object' ||
      existing.state !== 'committed' ||
      existing.tenantId !== expected.tenantId ||
      existing.invoiceId !== expected.invoiceId ||
      existing.bucket !== 'invoices' ||
      existing.path !== expected.path ||
      existing.pdfSha256 !== expected.pdfSha256 ||
      existing.snapshotSha256 !== expected.snapshotSha256 ||
      existing.byteLength !== expected.byteLength ||
      existing.version !== expected.version) {
    fail('INVOICE_ARCHIVE_CONFLICT',
      'A different issued document is already committed; replacement is forbidden.');
  }
};
const getVerifiedCommitted = async (archive, expected, storage) => {
  assertCommittedDescriptor(archive, expected);
  const bytes = await readRetainedInvoiceArchiveCandidate({
    archive, tenantId: expected.tenantId, invoiceId: expected.invoiceId,
    getObject: (bucket, path) => storage.getObject(bucket, path)
  });
  return bytes;
};
const assertStoredBytes = async (storage, expected, originalBytes) => {
  const saved = await readRetainedInvoiceArchiveCandidate({
    archive: { ...expected, state: 'committed' },
    tenantId: expected.tenantId, invoiceId: expected.invoiceId,
    getObject: (bucket, path) => storage.getObject(bucket, path)
  });
  if (!saved.equals(originalBytes)) {
    fail('INVOICE_ARCHIVE_INTEGRITY_FAILED',
      'Stored PDF must match the originally rendered PDF byte-for-byte.');
  }
};

// Candidate write protocol:
// 1. Authoritative issuance with exact snapshot fingerprint (prior DB commit).
// 2. If already committed, only replay identical archive data and actual bytes.
// 3. Atomic-if-absent object create; on retry an existing object is permissible
//    only after checking its exact bytes. Ordinary upload() is forbidden.
// 4. Verify object readback BEFORE ledger insertion. Ledger adapter must
//    atomically recheck issuance identity/hash under invoice lock and insert
//    the single write-once archive row. No success on ambiguous outcomes.
// 5. Recover from a crash between steps 3 and 4 by reusing the verified object;
//    an orphan with no ledger is NOT exposed for email or historical downloads.
export const publishIssuedInvoiceArchiveCandidate = async ({
  snapshot, pdfBytes, actorUserId, issuanceLedger, archiveLedger, objectStorage
}) => {
  assertFns(issuanceLedger, ['loadIssued']);
  assertFns(archiveLedger, ['loadCommitted','commitIfAbsent']);
  assertFns(objectStorage, ['createIfAbsent','getObject']);
  const actorId = validId(actorUserId, 'archive actor');
  const normalized = normalizeInvoiceDocumentSnapshot(snapshot);
  const expected = prepareInvoiceArchiveCandidate({snapshot:normalized,pdfBytes});
  const originalBytes = Buffer.from(pdfBytes);
  const ids = {tenantId:expected.tenantId,invoiceId:expected.invoiceId};

  const issuance = await issuanceLedger.loadIssued(ids);
  assertIssuance(issuance,expected);
  const previous = await archiveLedger.loadCommitted(ids);
  if (previous) {
    const saved = await getVerifiedCommitted(previous,expected,objectStorage);
    if (!saved.equals(originalBytes)) {
      fail('INVOICE_ARCHIVE_INTEGRITY_FAILED','Previously committed PDF bytes differ.');
    }
    return { state:'already_committed', archive:previous };
  }

  const created = await objectStorage.createIfAbsent(
    expected.bucket,expected.path,originalBytes
  );
  if (created !== 'created' && created !== 'exists') {
    fail('INVOICE_ARCHIVE_STORAGE_UNCONFIRMED',
      'Storage did not confirm conditional object creation or verified existing object.');
  }
  await assertStoredBytes(objectStorage,expected,originalBytes);

  // The SQL adapter must make this an atomic transaction with an UPDLOCK +
  // HOLDLOCK on the same tenant/invoice and evidence that the committed issue
  // snapshot hash matches; one archive row per invoice. No UPDATE or DELETE.
  let committed;
  try {
    committed = await archiveLedger.commitIfAbsent({
      ...expected,
      issuedSnapshotJson: JSON.stringify(normalized),
      actorUserId:actorId
    });
  } catch (error) {
    // Cannot infer success from timeout/network error. A later guarded retry
    // may reconcile; do NOT delete the object or send an email here.
    throw error;
  }
  if (!committed || !['inserted','existing'].includes(committed.outcome)) {
    fail('INVOICE_ARCHIVE_COMMIT_UNCONFIRMED',
      'Archive ledger did not return a confirmed insert or existing record.');
  }
  const authoritative = await archiveLedger.loadCommitted(ids);
  await getVerifiedCommitted(authoritative,expected,objectStorage);
  if (committed.outcome === 'existing') {
    return { state:'already_committed',archive:authoritative };
  }
  return { state:'committed', archive:authoritative };
};
