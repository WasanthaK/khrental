import { getStorageDriver } from '../storage/index.js';

// Only conditionally written, durable R2 may publish a financial archive.
// The public/ephemeral local driver cannot provide an immutable document.
export const createIssuedInvoiceR2ArchiveStore = ({ driver = getStorageDriver() } = {}) => {
  if (!driver || driver.name !== 'r2' ||
      typeof driver.createIssuedInvoiceIfAbsent !== 'function' ||
      typeof driver.getObject !== 'function') {
    const error = new Error('The guarded, durable R2 invoice archive writer is required.');
    error.code = 'INVOICE_ARCHIVE_R2_REQUIRED';
    throw error;
  }
  return {
    createIfAbsent: (bucket, path, bytes) => driver.createIssuedInvoiceIfAbsent(bucket, path, bytes),
    getObject: (bucket, path) => driver.getObject(bucket, path)
  };
};
