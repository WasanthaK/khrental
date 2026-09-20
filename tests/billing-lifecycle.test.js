import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_STATUS,
  INVOICE_STATUS,
  agreementOverlapsBillingPeriod,
  calculateVerifiedPaymentTotal,
  calculateOutstandingBalance,
  getInvoiceStatusAfterVerification,
  canSubmitPaymentProof
} from '../src/api/platform/billingLifecycle.js';

test('billing period must overlap the agreement term', () => {
  const periodStart = '2026-09-01T00:00:00.000Z';
  const periodEnd = '2026-10-01T00:00:00.000Z';

  assert.equal(agreementOverlapsBillingPeriod({
    agreementStart: '2026-09-10T00:00:00.000Z',
    agreementEnd: '2027-09-09T00:00:00.000Z',
    periodStart,
    periodEnd
  }), true);

  assert.equal(agreementOverlapsBillingPeriod({
    agreementStart: '2026-10-01T00:00:00.000Z',
    agreementEnd: '2027-09-30T00:00:00.000Z',
    periodStart,
    periodEnd
  }), false);

  assert.equal(agreementOverlapsBillingPeriod({
    agreementStart: '2025-09-01T00:00:00.000Z',
    agreementEnd: '2026-08-31T23:59:59.000Z',
    periodStart,
    periodEnd
  }), false);
});

test('open-ended agreement dates still allow overlapping billing', () => {
  assert.equal(agreementOverlapsBillingPeriod({
    periodStart: '2026-09-01T00:00:00.000Z',
    periodEnd: '2026-10-01T00:00:00.000Z'
  }), true);
});

test('verified payments alone reduce the outstanding balance', () => {
  const payments = [
    { amount: 400, status: PAYMENT_STATUS.VERIFIED },
    { amount: 300, status: PAYMENT_STATUS.PENDING },
    { amount: 100, status: PAYMENT_STATUS.REJECTED }
  ];

  assert.equal(calculateVerifiedPaymentTotal(payments), 400);
  assert.equal(calculateOutstandingBalance(1000, payments), 600);
});

test('fully verified balance marks an invoice paid', () => {
  const status = getInvoiceStatusAfterVerification({
    invoiceAmount: 1000,
    payments: [
      { amount: 600, status: PAYMENT_STATUS.VERIFIED },
      { amount: 400, status: PAYMENT_STATUS.VERIFIED }
    ],
    dueDate: '2026-09-01T00:00:00.000Z',
    now: new Date('2026-09-16T00:00:00.000Z')
  });

  assert.equal(status, INVOICE_STATUS.PAID);
});

test('partial verified payment keeps an overdue invoice overdue', () => {
  const status = getInvoiceStatusAfterVerification({
    invoiceAmount: 1000,
    payments: [{ amount: 250, status: PAYMENT_STATUS.VERIFIED }],
    dueDate: '2026-09-01T00:00:00.000Z',
    now: new Date('2026-09-16T00:00:00.000Z')
  });

  assert.equal(status, INVOICE_STATUS.OVERDUE);
  assert.equal(calculateOutstandingBalance(1000, [{ amount: 250, status: PAYMENT_STATUS.VERIFIED }]), 750);
});

test('pending verification takes precedence over ordinary pending status', () => {
  const status = getInvoiceStatusAfterVerification({
    invoiceAmount: 1000,
    payments: [{ amount: 1000, status: PAYMENT_STATUS.PENDING }],
    dueDate: '2026-09-30T00:00:00.000Z',
    now: new Date('2026-09-16T00:00:00.000Z')
  });

  assert.equal(status, INVOICE_STATUS.VERIFICATION_PENDING);
});

test('rejected payment does not settle the invoice and allows resubmission', () => {
  const payments = [{ amount: 1000, status: PAYMENT_STATUS.REJECTED }];
  const outstanding = calculateOutstandingBalance(1000, payments);
  const status = getInvoiceStatusAfterVerification({
    invoiceAmount: 1000,
    payments,
    dueDate: '2026-09-30T00:00:00.000Z',
    now: new Date('2026-09-16T00:00:00.000Z')
  });

  assert.equal(outstanding, 1000);
  assert.equal(status, INVOICE_STATUS.PENDING);
  assert.equal(canSubmitPaymentProof({
    invoiceStatus: status,
    outstandingBalance: outstanding,
    hasPendingPayment: false
  }), true);
});

test('a second proof is blocked while verification is pending', () => {
  assert.equal(canSubmitPaymentProof({
    invoiceStatus: INVOICE_STATUS.VERIFICATION_PENDING,
    outstandingBalance: 1000,
    hasPendingPayment: true
  }), false);
});

test('paid or zero-balance invoices reject new proof submissions', () => {
  assert.equal(canSubmitPaymentProof({
    invoiceStatus: INVOICE_STATUS.PAID,
    outstandingBalance: 0,
    hasPendingPayment: false
  }), false);
});
