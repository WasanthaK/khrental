import { createInvoiceArchiveSqlCandidateAdapters } from './invoiceArchiveSqlCandidateAdapters.js';
import { createIssuedInvoiceR2ArchiveStore } from './issuedInvoiceR2ArchiveStore.js';
import crypto from 'node:crypto';
import { createInvoiceDocumentPdfCandidate, normalizeInvoiceDocumentSnapshot } from './invoicePdfCandidate.js';
import { publishIssuedInvoiceArchiveCandidate } from './issuedInvoiceArchiveWriteCandidate.js';
import { loadVerifiedIssuedInvoiceDocument } from './issuedInvoiceDocumentRead.js';

// Only called when the guarded immutable-archive feature is explicitly on.
// Return the committed original bytes for BOTH first send and later resends.
// Never render from mutable invoice/master records after issuance.
export const prepareImmutableIssuedInvoiceAttachment = async ({
  tenantId, invoiceId, actorUserId, pool, sql,
  adapters = createInvoiceArchiveSqlCandidateAdapters({ pool, sql }),
  store = createIssuedInvoiceR2ArchiveStore(),
  render = createInvoiceDocumentPdfCandidate,
  publish = publishIssuedInvoiceArchiveCandidate
}) => {
  const ids={tenantId,invoiceId};
  const issued=await adapters.issuanceLedger.loadIssued(ids);
  if (!issued?.issued || !issued.snapshot || !issued.snapshotSha256) {
    const error=new Error('A committed, immutable issuance snapshot is required.');
    error.status=409;
    error.code='INVOICE_ISSUANCE_SNAPSHOT_MISSING';
    throw error;
  }
  // Compare canonical issuance evidence, not the noncanonical JSON shape
  // initially supplied by the issuer. The SQL adapter returns canonical
  // snapshots; recovery and unit test adapters may supply equivalent input.
  const canonical=normalizeInvoiceDocumentSnapshot(issued.snapshot);
  const snapshotJson=JSON.stringify(canonical);
  const computedSha256=crypto.createHash('sha256').update(snapshotJson).digest('hex');
  if (computedSha256 !== issued.snapshotSha256 ||
      canonical.tenantId.toLowerCase() !== String(tenantId).toLowerCase() ||
      canonical.invoiceId.toLowerCase() !== String(invoiceId).toLowerCase()) {
    const error=new Error('Issuance snapshot hash or scope is invalid.');
    error.status=409;
    error.code='INVOICE_ARCHIVE_ISSUANCE_MISMATCH';
    throw error;
  }
  const existing=await adapters.archiveLedger.loadCommitted(ids);
  // The SQL archive is immutable: altered issue evidence must never cause
  // a resend, even when the original PDF object remains available.
  if (existing && (existing.snapshotSha256 !== computedSha256 ||
      existing.issuedSnapshotJson !== snapshotJson)) {
    const error=new Error('Committed invoice PDF no longer matches issuance evidence.');
    error.status=409;
    error.code='INVOICE_ARCHIVE_ISSUANCE_MISMATCH';
    throw error;
  }
  if (!existing) {
    const pdf=await render(canonical);
    if (pdf.snapshotSha256 !== issued.snapshotSha256) {
      const error=new Error('Issued snapshot hash does not match rendered PDF input.');
      error.code='INVOICE_ARCHIVE_ISSUANCE_MISMATCH';
      throw error;
    }
    await publish({
      snapshot:canonical,
      pdfBytes:Buffer.from(pdf.content,'base64'),
      actorUserId,
      issuanceLedger:adapters.issuanceLedger,
      archiveLedger:adapters.archiveLedger,
      objectStorage:store
    });
  }
  // After publication, read the immutable manifest + object again. Even an
  // ambiguous SQL commit, a 412, or a damaged object must never be emailed.
  const original=await loadVerifiedIssuedInvoiceDocument({
    ...ids,archiveLedger:adapters.archiveLedger,objectStorage:store
  });
  if (original.sha256 !== (await adapters.archiveLedger.loadCommitted(ids)).pdfSha256) {
    throw new Error('Committed invoice PDF digest changed while preparing delivery.');
  }
  return {
    filename:original.filename,
    content:original.content,
    type:original.type,
    disposition:'attachment'
  };
};
