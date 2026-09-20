import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTenancyActivationReadiness,
  getActivationBlockingReasons,
  isActiveTenantMembership,
  isAgreementSignatureComplete
} from '../src/api/platform/tenancyActivation.js';
import { guardTenancyActivationQuery } from '../src/api/platform/tenancyActivationGuard.js';

const readyInput = () => ({
  agreement: {
    renteeid: 'tenant-1',
    propertyid: 'property-1',
    status: 'signed',
    depositamount: 1000
  },
  rentee: { auth_id: 'auth-1' },
  membership: { status: 'active', role: 'tenant' },
  checklist: { status: 'completed' },
  securityDepositReceived: 1000
});

test('signed agreement status is sufficient signature evidence', () => {
  assert.equal(isAgreementSignatureComplete({ status: 'signed' }), true);
});

test('pending activation status alone is not sufficient signature evidence', () => {
  assert.equal(isAgreementSignatureComplete({
    status: 'pending_activation',
    signature_status: 'send_for_signature'
  }), false);
});

test('pending activation with explicit completion evidence is sufficient', () => {
  assert.equal(isAgreementSignatureComplete({
    status: 'pending_activation',
    signature_status: 'signing_complete'
  }), true);
});

test('signature completion timestamp is sufficient signature evidence', () => {
  assert.equal(isAgreementSignatureComplete({ status: 'pending', signature_completed_at: '2026-09-16T00:00:00Z' }), true);
});

test('active tenant or rentee membership satisfies the tenancy membership gate', () => {
  assert.equal(isActiveTenantMembership({ status: 'active', role: 'tenant' }), true);
  assert.equal(isActiveTenantMembership({ status: 'active', role: 'rentee' }), true);
});

test('active non-tenant membership cannot satisfy the tenancy membership gate', () => {
  assert.equal(isActiveTenantMembership({ status: 'active', role: 'staff' }), false);
  assert.equal(isActiveTenantMembership({ status: 'active', role: 'admin' }), false);
});

test('tenancy is ready only when every activation requirement is satisfied', () => {
  const readiness = evaluateTenancyActivationReadiness(readyInput());
  assert.equal(readiness.canActivate, true);
  assert.equal(readiness.securityDepositOutstanding, 0);
  assert.deepEqual(getActivationBlockingReasons(readiness), []);
});

test('pending signature blocks tenancy activation even when every other requirement is complete', () => {
  const input = readyInput();
  input.agreement.status = 'pending_activation';
  input.agreement.signature_status = 'send_for_signature';
  const readiness = evaluateTenancyActivationReadiness(input);

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.checks.agreementSigned, false);
  assert.match(getActivationBlockingReasons(readiness).join(' '), /signature/i);
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

test('inactive tenant membership blocks activation', () => {
  const input = readyInput();
  input.membership.status = 'inactive';
  const readiness = evaluateTenancyActivationReadiness(input);

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.checks.membershipActive, false);
});

test('active staff membership on the assigned app user blocks tenancy activation', () => {
  const input = readyInput();
  input.membership.role = 'staff';
  const readiness = evaluateTenancyActivationReadiness(input);

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.checks.membershipActive, false);
  assert.match(getActivationBlockingReasons(readiness).join(' '), /tenant\/rentee membership/i);
});

test('incomplete move-in checklist blocks activation', () => {
  const input = readyInput();
  input.checklist.status = 'open';
  const readiness = evaluateTenancyActivationReadiness(input);

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.checks.moveInChecklistComplete, false);
});

test('generic agreement CRUD cannot set status active', () => {
  let nextCalled = false;
  let responseStatus = null;
  let responsePayload = null;
  const req = {
    body: {
      action: 'update',
      table: 'agreements',
      payload: { status: 'active' }
    }
  };
  const res = {
    status(value) {
      responseStatus = value;
      return this;
    },
    json(value) {
      responsePayload = value;
      return this;
    }
  };

  guardTenancyActivationQuery(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(responseStatus, 409);
  assert.equal(responsePayload.code, 'TENANCY_ACTIVATION_REQUIRED');
});

test('normal agreement status updates still pass through generic CRUD', () => {
  let nextCalled = false;
  guardTenancyActivationQuery(
    { body: { action: 'update', table: 'agreements', payload: { status: 'review' } } },
    { status: () => ({ json: () => undefined }) },
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);
});
