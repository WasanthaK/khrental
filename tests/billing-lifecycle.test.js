import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getAutomaticBillingPeriod,
  shouldRunAutomaticBilling
} from '../src/api/platform/monthlyBillingScheduler.js';
import {
  PAYMENT_STATUS,
  INVOICE_STATUS,
  agreementOverlapsBillingPeriod,
  calculateVerifiedPaymentTotal,
  calculateOutstandingBalance,
  getInvoiceStatusAfterVerification,
  canSubmitPaymentProof,
  calculateProratedMonthlyRent,
  resolveAgreementBillingDay,
  resolveAgreementMonthlyRent
} from '../src/api/platform/billingLifecycle.js';
import {
  guardBillingMssqlCompatibility,
  guardBillingPlatformQuery,
  isProtectedBillingMutation
} from '../src/api/platform/billingMutationGuard.js';
import {
  isBillingAdjustmentAmountAllowed,
  isBillingAdjustmentTypeAllowed,
  normalizeBillingAdjustmentAmount
} from '../src/api/platform/billingAdjustments.js';
import {
  getBillingReminderPortalUrl,
  sendBillingReminderEmail
} from '../src/api/platform/billingReminderEmail.js';

const paymentServiceSource = readFileSync(
  new URL('../src/services/paymentService.js', import.meta.url),
  'utf8'
);

const monthlyBillingRouterSource = readFileSync(
  new URL('../src/api/platform/monthlyBillingRouter.js', import.meta.url),
  'utf8'
);

const monthlyBillingServiceSource = readFileSync(
  new URL('../src/api/platform/monthlyBillingService.js', import.meta.url),
  'utf8'
);

const monthlyBillingSchedulerSource = readFileSync(
  new URL('../src/api/platform/monthlyBillingScheduler.js', import.meta.url),
  'utf8'
);

const billingRouterSource = readFileSync(
  new URL('../src/api/platform/billingRouter.js', import.meta.url),
  'utf8'
);

const mssqlRouterSource = readFileSync(
  new URL('../src/api/mssql/router.js', import.meta.url),
  'utf8'
);

const invoiceDraftEditorSource = readFileSync(
  new URL('../src/components/invoices/InvoiceDraftEditor.jsx', import.meta.url),
  'utf8'
);


const createMockResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  return response;
};

test('contractual rent falls back to agreement terms when persisted rentamount is missing', () => {
  assert.equal(resolveAgreementMonthlyRent({
    rentamount: null,
    terms: { monthlyRent: 20000 }
  }), 20000);

  assert.equal(resolveAgreementMonthlyRent({
    rentamount: null,
    terms: JSON.stringify({ monthlyRent: '20000.50' })
  }), 20000.5);
});

test('persisted agreement rentamount remains authoritative when present', () => {
  assert.equal(resolveAgreementMonthlyRent({
    rentamount: 18500,
    terms: { monthlyRent: 20000 }
  }), 18500);
});

test('billing does not derive contractual rent from unrelated property pricing', () => {
  assert.equal(resolveAgreementMonthlyRent({
    rentamount: null,
    terms: {},
    property: { rentalvalues: { rent: 25000 } }
  }), 0);
});

test('automatic billing uses the current UTC month and starts checks from day five', () => {
  const now = new Date('2026-10-05T10:00:00.000Z');
  assert.equal(getAutomaticBillingPeriod(now), '2026-10');
  assert.equal(shouldRunAutomaticBilling({ now, billingDay: 5 }), true);
  assert.equal(shouldRunAutomaticBilling({ now, billingDay: 6 }), false);
});

test('tenancy billing day defaults to five and honors renter-selected day 5 through 28', () => {
  assert.equal(resolveAgreementBillingDay({ terms: null }), 5);
  assert.equal(resolveAgreementBillingDay({ terms: { billingDay: 12 } }), 12);
  assert.equal(resolveAgreementBillingDay({ terms: JSON.stringify({ billingDay: 28 }) }), 28);
  assert.equal(resolveAgreementBillingDay({ terms: { billingDay: 2 } }), 5);
});

test('mid-month rent is prorated using actual occupied calendar days', () => {
  const result = calculateProratedMonthlyRent({
    monthlyRent: 3100,
    agreementStart: '2026-10-15T00:00:00.000Z',
    periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-11-01T00:00:00.000Z'
  });

  assert.equal(result.daysInMonth, 31);
  assert.equal(result.occupiedDays, 17);
  assert.equal(result.amount, 1700);
  assert.equal(result.prorated, true);
});

test('full-month rent remains unchanged when tenancy covers the whole month', () => {
  const result = calculateProratedMonthlyRent({
    monthlyRent: 20000,
    agreementStart: '2026-01-01T00:00:00.000Z',
    periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-11-01T00:00:00.000Z'
  });

  assert.equal(result.amount, 20000);
  assert.equal(result.occupiedDays, 31);
  assert.equal(result.prorated, false);
});

test('manual and automatic monthly billing share one generator service', () => {
  assert.match(monthlyBillingRouterSource, /generateMonthlyInvoicesForTenant/);
  assert.doesNotMatch(monthlyBillingRouterSource, /INSERT INTO invoices/);
  assert.match(monthlyBillingSchedulerSource, /generateMonthlyInvoicesForTenant/);
  assert.match(monthlyBillingServiceSource, /UX_invoices|already_exists|WITH \(UPDLOCK, HOLDLOCK\)/);
});

test('automatic billing records a system source without impersonating a staff user', () => {
  assert.match(monthlyBillingSchedulerSource, /actorUserId:\s*null/);
  assert.match(monthlyBillingSchedulerSource, /source:\s*'automatic_scheduler'/);
  assert.match(monthlyBillingServiceSource, /source/);
});

test('automatic billing applies per-tenancy billing day and does not generate before tenancy start', () => {
  assert.match(monthlyBillingServiceSource, /resolveAgreementBillingDay/);
  assert.match(monthlyBillingServiceSource, /before_tenancy_billing_day/);
  assert.match(monthlyBillingServiceSource, /before_tenancy_start/);
  assert.match(monthlyBillingSchedulerSource, /automaticRunDate:\s*now/);
});

test('monthly billing uses current-month rent and carries approved prior-period utilities forward', () => {
  assert.match(monthlyBillingServiceSource, /readingdate < @periodStart/);
  assert.doesNotMatch(monthlyBillingServiceSource, /readingdate >= @periodStart/);
  assert.match(monthlyBillingServiceSource, /prior service period/);
  assert.match(monthlyBillingServiceSource, /calculateProratedMonthlyRent/);
});

test('draft invoices are not eligible for payment proof', () => {
  assert.equal(canSubmitPaymentProof({
    invoiceStatus: INVOICE_STATUS.DRAFT,
    outstandingBalance: 1000,
    hasPendingPayment: false
  }), false);
});

test('monthly invoice generation creates an internal draft before issue', () => {
  assert.match(monthlyBillingServiceSource, /'draft'/);
  assert.match(monthlyBillingServiceSource, /invoice_drafted/);
  assert.match(monthlyBillingServiceSource, /NULL, NULL, @notes/);
});

test('draft invoice lifecycle supports review edits and explicit issue', () => {
  assert.match(billingRouterSource, /\/draft\/components/);
  assert.match(billingRouterSource, /invoice_draft_component_added/);
  assert.match(billingRouterSource, /invoice_draft_component_updated/);
  assert.match(billingRouterSource, /invoice_draft_component_removed/);
  assert.match(billingRouterSource, /\/invoices\/:invoiceId\/issue/);
  assert.match(billingRouterSource, /eventType: 'invoice_issued'/);
  assert.match(billingRouterSource, /INVOICE_NOT_ISSUED/);
});

test('removing sourced utility lines from a draft returns them to pending invoice state', () => {
  assert.match(billingRouterSource, /billing_status = 'pending_invoice'/);
  assert.match(billingRouterSource, /invoice_id = NULL/);
  assert.match(billingRouterSource, /source_type.*utility_reading/s);
});

test('renter-facing MSSQL invoice reads hide draft invoices', () => {
  assert.match(mssqlRouterSource, /isTenantRole/);
  assert.match(mssqlRouterSource, /status \|\| ''\)\.toLowerCase\(\) !== 'draft'/);
  assert.match(mssqlRouterSource, /Invoice not found/);
});

test('staff invoice UI exposes draft line review before issue', () => {
  assert.match(invoiceDraftEditorSource, /Add another item or correction/);
  assert.match(invoiceDraftEditorSource, /Issue & Send Invoice/);
  assert.match(invoiceDraftEditorSource, /updateInvoiceDraftComponent/);
  assert.match(invoiceDraftEditorSource, /removeInvoiceDraftComponent/);
});

test('draft invoices are excluded from overdue processing', () => {
  assert.match(paymentServiceSource, /INVOICE_STATUS\.DRAFT/);
});

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

test('invoice and payment mutations are reserved for the billing lifecycle APIs', () => {
  for (const table of ['invoices', 'payments']) {
    for (const action of ['insert', 'update', 'delete', 'upsert']) {
      assert.equal(isProtectedBillingMutation({ table, action }), true, `${table} ${action} should be protected`);
    }
    assert.equal(isProtectedBillingMutation({ table, action: 'select' }), false);
  }

  assert.equal(isProtectedBillingMutation({ table: 'agreements', action: 'update' }), false);
});

test('generic platform billing writes return BILLING_LIFECYCLE_REQUIRED', () => {
  const response = createMockResponse();
  let nextCalled = false;

  guardBillingPlatformQuery(
    { body: { action: 'update', table: 'invoices', payload: { status: 'paid' } } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body?.code, 'BILLING_LIFECYCLE_REQUIRED');
});

test('generic platform billing reads still pass through', () => {
  const response = createMockResponse();
  let nextCalled = false;

  guardBillingPlatformQuery(
    { body: { action: 'select', table: 'invoices' } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});

test('legacy MSSQL invoice writes are blocked but reads remain available', () => {
  const blockedResponse = createMockResponse();
  let blockedNextCalled = false;
  guardBillingMssqlCompatibility(
    { method: 'PUT', path: '/invoices/invoice-1' },
    blockedResponse,
    () => { blockedNextCalled = true; }
  );

  assert.equal(blockedNextCalled, false);
  assert.equal(blockedResponse.statusCode, 409);
  assert.equal(blockedResponse.body?.code, 'BILLING_LIFECYCLE_REQUIRED');

  const readResponse = createMockResponse();
  let readNextCalled = false;
  guardBillingMssqlCompatibility(
    { method: 'GET', path: '/invoices/invoice-1' },
    readResponse,
    () => { readNextCalled = true; }
  );

  assert.equal(readNextCalled, true);
  assert.equal(readResponse.statusCode, 200);
});

test('billing adjustment types are limited to traceable monthly charge categories', () => {
  for (const type of ['arrears', 'tax', 'adjustment', 'other']) {
    assert.equal(isBillingAdjustmentTypeAllowed(type), true);
  }
  assert.equal(isBillingAdjustmentTypeAllowed('rent'), false);
  assert.equal(isBillingAdjustmentTypeAllowed('utility'), false);
});

test('only adjustments may be negative while charges must be positive', () => {
  assert.equal(isBillingAdjustmentAmountAllowed('arrears', 50), true);
  assert.equal(isBillingAdjustmentAmountAllowed('tax', 10.25), true);
  assert.equal(isBillingAdjustmentAmountAllowed('other', 5), true);
  assert.equal(isBillingAdjustmentAmountAllowed('arrears', -50), false);
  assert.equal(isBillingAdjustmentAmountAllowed('tax', 0), false);
  assert.equal(isBillingAdjustmentAmountAllowed('adjustment', -25), true);
  assert.equal(isBillingAdjustmentAmountAllowed('adjustment', 25), true);
  assert.equal(isBillingAdjustmentAmountAllowed('adjustment', 0), false);
});

test('billing adjustment amounts are rounded to cents', () => {
  assert.equal(normalizeBillingAdjustmentAmount('12.345'), 12.35);
  assert.equal(normalizeBillingAdjustmentAmount('-3.456'), -3.46);
  assert.equal(Number.isNaN(normalizeBillingAdjustmentAmount('not-a-number')), true);
});

test('billing reminder portal URL uses the configured public application URL', () => {
  const previousPublicUrl = process.env.PUBLIC_APP_URL;
  try {
    process.env.PUBLIC_APP_URL = 'https://rentals.example.com/';
    assert.equal(getBillingReminderPortalUrl(), 'https://rentals.example.com/rentee/invoices');
  } finally {
    if (previousPublicUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousPublicUrl;
  }
});

test('billing reminder delivery fails clearly when server email is not configured', async () => {
  const previousTwilioKey = process.env.TWILIO_SENDGRID_API_KEY;
  const previousSendGridKey = process.env.SENDGRID_API_KEY;
  try {
    delete process.env.TWILIO_SENDGRID_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    await assert.rejects(
      () => sendBillingReminderEmail({
        to: 'tenant@example.com',
        subject: 'Payment reminder',
        text: 'Payment reminder'
      }),
      (error) => error?.status === 503 && error?.code === 'EMAIL_NOT_CONFIGURED'
    );
  } finally {
    if (previousTwilioKey === undefined) delete process.env.TWILIO_SENDGRID_API_KEY;
    else process.env.TWILIO_SENDGRID_API_KEY = previousTwilioKey;
    if (previousSendGridKey === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = previousSendGridKey;
  }
});


test('payment proof storage uses tenant API while billing authority remains server-side', () => {
  assert.doesNotMatch(paymentServiceSource, /platformClient\.storage/);
  assert.match(paymentServiceSource, /uploadTenantFile/);
  assert.match(paymentServiceSource, /submitInvoicePaymentProof/);
  assert.match(paymentServiceSource, /proofUrl/);
});
