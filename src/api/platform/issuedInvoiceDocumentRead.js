import {
  readRetainedInvoiceArchiveCandidate
} from './issuedInvoiceArchiveCandidate.js';

// Called ONLY after the HTTP caller has been authorized against the
// tenant-scoped invoice; accepts NO browser-supplied object storage path.
// A committed SQL archive row is the authoritative, immutable source.
export const loadVerifiedIssuedInvoiceDocument = async ({
  tenantId, invoiceId, archiveLedger, objectStorage
}) => {
  if (!archiveLedger || typeof archiveLedger.loadCommitted !== 'function' ||
    !objectStorage || typeof objectStorage.getObject !== 'function') {
    const error = new Error('Issued invoice document archive is not configured.');
    error.status = 503;
    error.code = 'INVOICE_DOCUMENT_STORAGE_NOT_READY';
    throw error;
  }
  const archive = await archiveLedger.loadCommitted({tenantId,invoiceId});
  if (!archive) {
    const error = new Error('An original issued PDF is not retained for this invoice.');
    error.status = 404;
    error.code = 'ISSUED_INVOICE_PDF_NOT_ARCHIVED';
    throw error;
  }
  // The archive helper rejects scope mismatch, wrong path, missing object,
  // PDF corruption, truncated content and SHA-256 mismatch. No re-render.
  const bytes = await readRetainedInvoiceArchiveCandidate({
    tenantId,invoiceId,archive,
    getObject: (bucket, path) => objectStorage.getObject(bucket,path)
  });
  return {
    content: bytes.toString('base64'),
    type: 'application/pdf',
    filename: 'Invoice-' + invoiceId + '.pdf',
    sha256: archive.pdfSha256,
    immutable: true
  };
};
