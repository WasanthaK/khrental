// A bank payment reference is an assigned YYMMDDNN value, never a UUID fragment.
export const displayInvoicePaymentReference = (value) => {
  const reference = String(value ?? '').trim();
  return /^\d{8}$/.test(reference) ? reference : null;
};

export const invoiceHeading = (invoice) => {
  const reference = displayInvoicePaymentReference(invoice?.payment_reference);
  return reference ? `Invoice #${reference}` : 'Invoice — reference not assigned';
};
