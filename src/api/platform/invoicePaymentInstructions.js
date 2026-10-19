import { displayInvoicePaymentReference } from './invoicePaymentReference.js';

// Immutable payment-destination metadata is captured when an invoice is issued.
// Never show live property edits as if they were the original invoice instructions.
const clean = value => typeof value === 'string'
  ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 255) : '';

const readBank = (row, prefix) => ({
  bankName: clean(row?.[prefix + '_bank_name']),
  branch: clean(row?.[prefix + '_bank_branch']),
  accountNumber: clean(row?.[prefix + '_bank_account_number'])
});

const hasAny = account => Object.values(account).some(Boolean);
const complete = account => Object.values(account).every(Boolean);

export const captureInvoiceBankDetails = (row = {}) => {
  const unit = readBank(row, 'unit');
  const property = readBank(row, 'property');
  // A partial unit override needs correction; silently falling back to
  // another account could route tenant payments to the wrong recipient.
  if (hasAny(unit)) return complete(unit) ? { ...unit, source: 'unit' } : null;
  return complete(property) ? { ...property, source: 'property' } : null;
};

// Rehydrate ONLY the invoice_issued audit snapshot. Historic invoices without
// recorded instructions remain unconfigured rather than silently adopting a
// bank account that may have changed since their original issue date.
export const readIssuedInvoiceBankDetails = metadata => {
  let record;
  try { record = typeof metadata === 'string' ? JSON.parse(metadata) : metadata; }
  catch { return null; }
  const bank = record?.paymentInstructions;
  if (!bank || !['unit', 'property'].includes(bank.source)) return null;
  const normalized = {
    bankName: clean(bank.bankName),
    branch: clean(bank.branch),
    accountNumber: clean(bank.accountNumber),
    source: bank.source
  };
  return complete({bankName:normalized.bankName,branch:normalized.branch,accountNumber:normalized.accountNumber})
    ? normalized : null;
};

const escapeHtml = value => clean(value).replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const buildInvoiceBankEmailSections = (instructions, paymentReference) => {
  const bank = readIssuedInvoiceBankDetails({paymentInstructions:instructions});
  if (!bank) return {
    text: 'Bank transfer details are not on this invoice. Confirm payment instructions with your property manager before sending funds.',
    html: '<p>Bank transfer details are not on this invoice. Confirm payment instructions with your property manager before sending funds.</p>'
  };
  const ref = displayInvoicePaymentReference(paymentReference) || 'Not assigned';
  return {
    text: [
      'BANK TRANSFER DETAILS',
      'Bank: ' + bank.bankName,
      'Branch: ' + bank.branch,
      'Account number: ' + bank.accountNumber,
      'Payment reference: ' + ref,
      'Confirm the account holder name with your property manager before transferring funds.'
    ].join('\n'),
    html: '<p><strong>Bank transfer details</strong></p><p>Bank: ' + escapeHtml(bank.bankName) +
      '<br>Branch: ' + escapeHtml(bank.branch) +
      '<br>Account number: ' + escapeHtml(bank.accountNumber) +
      '<br>Payment reference: ' + escapeHtml(ref) + '</p>' +
      '<p>Confirm the account holder name with your property manager before transferring funds.</p>'
  };
};
