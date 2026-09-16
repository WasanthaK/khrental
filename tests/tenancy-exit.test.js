import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTenancySettlement,
  isClosureReady,
  validateNoticeResponse
} from '../src/api/platform/tenancyExit.js';
import {
  containsClosedAgreementStatus,
  guardTenancyClosureQuery
} from '../src/api/platform/tenancyClosureGuard.js';

test('settlement refunds unused security deposit after deductions and arrears', () => {
  assert.deepEqual(calculateTenancySettlement({
    depositReceived: 2000,
    approvedDeductions: 350,
    outstandingInvoices: 150
  }), {
    depositReceived: 2000,
    approvedDeductions: 350,
    outstandingInvoices: 150,
    refundAmount: 1500,
    amountDue: 0
  });
});

test('settlement reports amount due when obligations exceed deposit', () => {
  const result = calculateTenancySettlement({
    depositReceived: 500,
    approvedDeductions: 600,
    outstandingInvoices: 250
  });
  assert.equal(result.refundAmount, 0);
  assert.equal(result.amountDue, 350);
});

test('closure readiness requires both inspection completion and settled finances', () => {
  assert.equal(isClosureReady({ inspectionStatus: 'completed', settlementStatus: 'settled' }), true);
  assert.equal(isClosureReady({ inspectionStatus: 'open', settlementStatus: 'settled' }), false);
  assert.equal(isClosureReady({ inspectionStatus: 'completed', settlementStatus: 'approved' }), false);
});

test('renewal and termination notices accept only valid responses', () => {
  assert.equal(validateNoticeResponse('renewal_offer', 'accepted'), true);
  assert.equal(validateNoticeResponse('renewal_offer', 'declined'), true);
  assert.equal(validateNoticeResponse('renewal_offer', 'acknowledged'), false);
  assert.equal(validateNoticeResponse('termination_notice', 'acknowledged'), true);
  assert.equal(validateNoticeResponse('termination_notice', 'accepted'), false);
});

test('closed agreement status is detected for generic mutation guard', () => {
  assert.equal(containsClosedAgreementStatus({ status: 'closed' }), true);
  assert.equal(containsClosedAgreementStatus([{ status: 'draft' }, { status: 'CLOSED' }]), true);
  assert.equal(containsClosedAgreementStatus({ status: 'active' }), false);
});

test('generic platform agreement closure is blocked', () => {
  const req = { body: { action: 'update', table: 'agreements', payload: { status: 'closed' } } };
  let statusCode = null;
  let body = null;
  let nextCalled = false;
  const res = {
    status(value) { statusCode = value; return this; },
    json(value) { body = value; return this; }
  };
  guardTenancyClosureQuery(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 409);
  assert.equal(body.code, 'TENANCY_CLOSURE_REQUIRED');
});

test('normal agreement updates pass closure guard', () => {
  const req = { body: { action: 'update', table: 'agreements', payload: { notes: 'ok' } } };
  let nextCalled = false;
  guardTenancyClosureQuery(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
