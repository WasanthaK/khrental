// Do not serve archived, issued customer invoices from the general storage
// path. Archive bytes require an authorized invoice-id-based document API and
// a verified SQL manifest. Generic writes and deletes cannot modify them.
// Deliberately match a broad prefix so malformed IDs fail closed too.
const PREFIX = /^tenants\/[^/]+\/invoices\/[^/]+\/issued(?:\/|$)/i;
export const isIssuedInvoiceArchivePath = (bucket, value) =>
  String(bucket || '').toLowerCase() === 'invoices' &&
  PREFIX.test(String(value || '').replace(/^\/+/, '').replace(/\\/g,'/'));

const forbidden = () => {
  const error = new Error('Issued invoice PDFs require a dedicated invoice document API.');
  error.status = 403;
  error.code = 'INVOICE_ARCHIVE_DEDICATED_API_REQUIRED';
  throw error;
};
export const assertGenericInvoiceArchiveMutationAllowed = (bucket, path) => {
  if (isIssuedInvoiceArchivePath(bucket,path)) forbidden();
};
export const assertGenericInvoiceArchiveBucketDeleteAllowed = bucket => {
  if (String(bucket || '').toLowerCase() === 'invoices') forbidden();
};
