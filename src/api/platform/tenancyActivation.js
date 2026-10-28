const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const SIGNED_STATUSES = new Set(['signed', 'active']);
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
  securityDepositReceived = 0,
  rentalReservation = null
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
  if (rentalReservation && normalizeStatus(agreement.status) !== 'active') {
    checks.rentalReservationValid = rentalReservation.valid === true;
  }

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
  if (checks.rentalReservationValid === false) reasons.push('The accepted rental reservation is expired, withdrawn or changed. Review the current offer before activation.');

  return reasons;
};

// Optional only for the governed offer schema. Inject the existing query
// authority so the same projection can be proven against disposable SQL.
export const loadRentalReservationReadiness=async({query,tenantId,agreement,enabled=false})=>{
  if(!enabled){return null;}
  const row=await query(`SELECT l.agreement_id,
        CASE WHEN o.agreement_id=l.agreement_id AND o.status='agreement'
          AND o.hold_until>SYSUTCDATETIME() AND ap.status='accepted' AND ap.version=o.application_version
          AND e.status IN('pending','responded') AND pref.opted_out=0
          AND p.country_code COLLATE DATABASE_DEFAULT=e.country_code AND pref.country_code=e.country_code
          AND p.status IN('active','available','rented') AND (t.status IS NULL OR t.status='active')
          AND @agreementStatus IN('draft','review','pending','pending_signature','signed')
        THEN 1 ELSE 0 END AS valid
      FROM dbo.rental_offer_agreement_links l
      JOIN dbo.property_rental_offers o ON o.enquiry_id=l.enquiry_id
      JOIN dbo.property_enquiries e ON e.id=l.enquiry_id
      JOIN dbo.property_applications ap ON ap.enquiry_id=e.id
      JOIN dbo.properties p ON p.id=o.property_id AND p.tenant_id=o.tenant_id
      JOIN dbo.tenants t ON t.id=o.tenant_id
      LEFT JOIN dbo.public_listing_preferences pref ON pref.public_id=e.listing_public_id
        AND pref.property_id=p.id AND pref.tenant_id=o.tenant_id
      WHERE l.agreement_id=@agreementId AND o.tenant_id=@tenantId`,
    {agreementId:agreement.id,tenantId,agreementStatus:String(agreement.status||'').toLowerCase()});
  return row?{valid:Number(row.valid)===1}:null;
};
