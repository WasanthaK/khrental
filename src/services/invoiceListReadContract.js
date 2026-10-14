/**
 * Reject malformed billing read envelopes instead of presenting failures as
 * "no invoices". Authorization and tenant filtering belong to the server.
 */
export const requireInvoiceListRows = (rows) => {
  if (!Array.isArray(rows) || rows.some(row =>
    !row || typeof row !== 'object' || Array.isArray(row) ||
    typeof row.id !== 'string' || row.id.trim().length === 0
  )) {
    const error = new Error('Invoice list returned an invalid response.');
    error.code = 'INVALID_INVOICE_LIST_RESPONSE';
    throw error;
  }
  return rows;
};
