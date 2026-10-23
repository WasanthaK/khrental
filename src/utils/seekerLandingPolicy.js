// B04 S3c2: account-context verified no-membership seeker landing.
// This is a presentation decision only. All protected APIs must separately
// enforce server-authenticated organization memberships and paid entitlements.
const value = input => String(input || '').trim().toLowerCase();
const hasId = input => typeof input === 'string' && input.trim().length > 0;

export const isVerifiedTenantlessSeeker = ({
  user = null,
  membership,
  memberships,
  tenantContextVerified = false
} = {}) => {
  // Unknown/in-flight context is not equivalent to verified zero membership.
  if (tenantContextVerified !== true || !user || !hasId(user.id)) return false;
  if (membership !== null || !Array.isArray(memberships) || memberships.length !== 0) {
    return false;
  }

  // Never accept an unverified global admin/staff/renter role as proof of
  // a seeker profile; keep tenant authorization independent of global identity.
  if (value(user.role) !== 'authenticated' ||
      value(user.user_type || user.userType) !== 'seeker') {
    return false;
  }

  // A leftover implicit tenant pointer cannot be used to project an
  // apparently tenantless user. It must be reconciled server-side first.
  if (user.tenant_id || user.tenantId || user.activeTenantId || user.membership) {
    return false;
  }
  return true;
};

export const getVerifiedSeekerLandingPath = context => (
  isVerifiedTenantlessSeeker(context) ? '/seeker' : null
);
