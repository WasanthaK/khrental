export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  VOIDED: 'voided'
});

export const INVOICE_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFICATION_PENDING: 'verification_pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
  REJECTED: 'rejected'
});

const toAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const toDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const agreementOverlapsBillingPeriod = ({
  agreementStart = null,
  agreementEnd = null,
  periodStart,
  periodEnd
}) => {
  const start = toDate(agreementStart);
  const end = toDate(agreementEnd);
  const billingStart = toDate(periodStart);
  const billingEnd = toDate(periodEnd);

  if (!billingStart || !billingEnd || billingEnd <= billingStart) return false;
  if (start && start >= billingEnd) return false;
  if (end && end < billingStart) return false;
  return true;
};

export const calculateVerifiedPaymentTotal = (payments = []) => (
  Math.round((payments || []).reduce((total, payment) => (
    String(payment?.status || '').toLowerCase() === PAYMENT_STATUS.VERIFIED
      ? total + toAmount(payment.amount)
      : total
  ), 0) * 100) / 100
);

export const calculateOutstandingBalance = (invoiceAmount, payments = []) => {
  const total = Math.max(0, toAmount(invoiceAmount));
  const paid = calculateVerifiedPaymentTotal(payments);
  return Math.max(0, Math.round((total - paid) * 100) / 100);
};

export const getInvoiceStatusAfterVerification = ({ invoiceAmount, payments = [], now = new Date(), dueDate = null }) => {
  const outstanding = calculateOutstandingBalance(invoiceAmount, payments);
  if (outstanding <= 0) return INVOICE_STATUS.PAID;

  const hasPending = payments.some((payment) => String(payment?.status || '').toLowerCase() === PAYMENT_STATUS.PENDING);
  if (hasPending) return INVOICE_STATUS.VERIFICATION_PENDING;

  if (dueDate) {
    const parsedDueDate = new Date(dueDate);
    if (!Number.isNaN(parsedDueDate.getTime()) && parsedDueDate.getTime() < now.getTime()) {
      return INVOICE_STATUS.OVERDUE;
    }
  }

  return INVOICE_STATUS.PENDING;
};

export const canSubmitPaymentProof = ({ invoiceStatus, outstandingBalance, hasPendingPayment }) => {
  if (hasPendingPayment) return false;
  if (toAmount(outstandingBalance) <= 0) return false;
  return ![INVOICE_STATUS.PAID].includes(String(invoiceStatus || '').toLowerCase());
};
