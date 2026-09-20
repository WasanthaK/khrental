const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const SIGNED_STATUSES = new Set(['signed', 'pending_activation', 'active']);
const SIGNATURE_COMPLETE_STATUSES = new Set([
  'signed',
  'completed',
  'complete',
  'signing_complete',
  'fully_signed'
]);
const TENANT_MEMBERSHIP_ROLES = new Set(['tenant', 'rentee']);

export const isAgreementSignatureComplete = (agreement = {}) => {
  if (SIGNED_STATUSES.has(normalizeStatus(agreement.status))) {
    return true;
  }

  if (agreement.signature_completed_at || agreement.signeddate) {
    return true;
  }

  return SIGNATURE_COMPLETE_STATUSES.has(normalizeStatus(agreement.signature_status));
};

export const isActiveTenantMembership = (membership = null) => {
  if (!membership) {
    return false;
  }

  return normalizeStatus(membership.status) === 'active'
    && TENANT_MEMBERSHIP_ROLES.has(normalizeStatus(membership.role));
};

export const evaluateTenancyActivationReadiness = ({
  agreement = {},
  rentee = {},
  membership = null,
  checklist = null,
  securityDepositReceived = 0
} = {}) => {
  const requiredDeposit = Math.max(Number(agreement.depositamount) || 0, 0);
  const receivedDeposit = Math.max(Number(securityDepositReceived) || 0, 0);

  const checks = {
    tenantAssigned: Boolean(agreement.renteeid),
    propertyAssigned: Boolean(agreement.propertyid),
    accountAccepted: Boolean(rentee.auth_id),
    membershipActive: isActiveTenantMembership(membership),
    agreementSigned: isAgreementSignatureComplete(agreement),
    securityDepositSatisfied: requiredDeposit <= 0 || receivedDeposit >= requiredDeposit,
    moveInChecklistComplete: normalizeStatus(checklist?.status) === 'completed'
  };

  return {
    checks,
    canActivate: Object.values(checks).every(Boolean),
    requiredDeposit,
    securityDepositReceived: receivedDeposit,
    securityDepositOutstanding: Math.max(requiredDeposit - receivedDeposit, 0)
  };
};

export const getActivationBlockingReasons = (readiness = {}) => {
  const checks = readiness.checks || {};
  const reasons = [];

  if (!checks.tenantAssigned) reasons.push('Tenant is not assigned to the agreement.');
  if (!checks.propertyAssigned) reasons.push('Property is not assigned to the agreement.');
  if (!checks.accountAccepted) reasons.push('Tenant invitation has not been accepted.');
  if (!checks.membershipActive) reasons.push('An active Tenant/Rentee membership is required.');
  if (!checks.agreementSigned) reasons.push('Agreement signature is not complete.');
  if (!checks.securityDepositSatisfied) reasons.push('Required security deposit has not been fully received.');
  if (!checks.moveInChecklistComplete) reasons.push('Move-in checklist is not complete.');

  return reasons;
};
