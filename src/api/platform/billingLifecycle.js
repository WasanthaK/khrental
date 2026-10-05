export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  VOIDED: 'voided'
});

export const INVOICE_STATUS = Object.freeze({
  DRAFT: 'draft',
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

export const parseAgreementTerms = (terms) => {
  if (!terms) return {};
  if (typeof terms === 'object') return terms;

  try {
    const parsed = JSON.parse(String(terms));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
};

export const resolveAgreementMonthlyRent = (agreement = {}) => {
  const persistedRent = toAmount(agreement.rentamount);
  if (persistedRent > 0) return persistedRent;

  const terms = parseAgreementTerms(agreement.terms);
  const contractualRent = toAmount(terms.monthlyRent ?? terms.monthlyrent);
  return contractualRent > 0 ? contractualRent : 0;
};

export const DEFAULT_TENANCY_BILLING_DAY = 5;
export const MIN_TENANCY_BILLING_DAY = 5;
export const MAX_TENANCY_BILLING_DAY = 28;

export const normalizeTenancyBillingDay = (
  value,
  fallback = DEFAULT_TENANCY_BILLING_DAY
) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (
    Number.isInteger(parsed)
    && parsed >= MIN_TENANCY_BILLING_DAY
    && parsed <= MAX_TENANCY_BILLING_DAY
  ) {
    return parsed;
  }
  return fallback;
};

export const resolveAgreementBillingDay = (agreement = {}) => {
  const terms = parseAgreementTerms(agreement.terms);
  return normalizeTenancyBillingDay(
    terms.billingDay ?? terms.billingday,
    DEFAULT_TENANCY_BILLING_DAY
  );
};

const utcDayStart = (value) => {
  const date = toDate(value);
  if (!date) return null;
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
};

export const calculateProratedMonthlyRent = ({
  monthlyRent,
  agreementStart = null,
  agreementEnd = null,
  periodStart,
  periodEnd
} = {}) => {
  const fullRent = toAmount(monthlyRent);
  const billingStart = utcDayStart(periodStart);
  const billingEnd = utcDayStart(periodEnd);
  if (fullRent <= 0 || !billingStart || !billingEnd || billingEnd <= billingStart) {
    return {
      amount: 0,
      fullMonthlyRent: fullRent,
      occupiedDays: 0,
      daysInMonth: 0,
      prorated: false
    };
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const daysInMonth = Math.round((billingEnd - billingStart) / dayMs);
  const agreementStartDay = utcDayStart(agreementStart);
  const agreementEndDay = utcDayStart(agreementEnd);

  const occupiedStart = agreementStartDay && agreementStartDay > billingStart
    ? agreementStartDay
    : billingStart;
  const agreementEndExclusive = agreementEndDay
    ? new Date(agreementEndDay.getTime() + dayMs)
    : billingEnd;
  const occupiedEnd = agreementEndExclusive < billingEnd
    ? agreementEndExclusive
    : billingEnd;

  const occupiedDays = Math.max(
    0,
    Math.round((occupiedEnd - occupiedStart) / dayMs)
  );
  const amount = occupiedDays <= 0
    ? 0
    : toAmount(fullRent * (occupiedDays / daysInMonth));

  return {
    amount,
    fullMonthlyRent: fullRent,
    occupiedDays,
    daysInMonth,
    prorated: occupiedDays > 0 && occupiedDays < daysInMonth
  };
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
  return ![INVOICE_STATUS.DRAFT, INVOICE_STATUS.PAID].includes(String(invoiceStatus || '').toLowerCase());
};
