import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTenancyActivationReadiness,
  getActivationBlockingReasons,
  isAgreementSignatureComplete
} from '../src/api/platform/tenancyActivation.js';

const readyInput = () => ({
  agreement: {
    renteeid: 'tenant-1',
    propertyid: 'property-1',
    status: 'signed',
    depositamount: 1000
  },
  rentee: { auth_id: 'auth-1' },
  membership: { status: 'active' },
  checklist: { status: 'completed' },
  securityDepositReceived: 1000
});

test('signed agreement status is sufficient signature evidence', () => {
  assert.equal(isAgreementSignatureComplete({ status: 'signed' }), true);
});

test('signature completion timestamp is sufficient signature evidence', () => {
  assert.equal(isAgreementSignatureComplete({ status: 'pending', signature_completed_at: '2026-09-16T00:00:00Z' }), true);
});

test('tenancy is ready only when every activation requirement is satisfied', () => {
  const readiness = evaluateTenancyActivationReadiness(readyInput());
  assert.equal(readiness.canActivate, true);
  assert.equal(readiness.securityDepositOutstanding, 0);
  assert.deepEqual(getActivationBlockingReasons(readiness), []);
});

test('security deposit requirement is enforced independently of confirmation advance', () => {
  const input = readyInput();
  input.securityDepositReceived = 400;
  const readiness = evaluateTenancyActivationReadiness(input);

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.checks.securityDepositSatisfied, false);
  assert.equal(readiness.securityDepositOutstanding, 600);
  assert.match(getActivationBlockingReasons(readiness).join(' '), /security deposit/i);
});

test('zero contractual deposit does not block activation', () => {
  const input = readyInput();
  input.agreement.depositamount = 0;
  input.securityDepositReceived = 0;
  const readiness = evaluateTenancyActivationReadiness(input);

  assert.equal(readiness.checks.securityDepositSatisfied, true);
  assert.equal(readiness.canActivate, true);
});

test('unaccepted invitation blocks activation', () => {
  const input = readyInput();
  input.rentee.auth_id = null;
  const readiness = evaluateTenancyActivationReadiness(input);

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.checks.accountAccepted, false);
  assert.match(getActivationBlockingReasons(readiness).join(' '), /invitation/i);
});

test('incomplete move-in checklist blocks activation', () => {
  const input = readyInput();
  input.checklist.status = 'open';
  const readiness = evaluateTenancyActivationReadiness(input);

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.checks.moveInChecklistComplete, false);
});
