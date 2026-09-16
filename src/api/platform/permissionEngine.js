import {
  PORTAL_TYPES,
  getPortalType,
  getStoredRole
} from '../../utils/accessModel.js';
import {
  PERMISSIONS,
  getPermissions,
  hasPermission
} from '../../utils/accessPolicy.js';

export { PERMISSIONS, getPermissions, hasPermission };

export const normalizeRole = (user, membership) => getStoredRole({ user, membership });

// Keep the legacy public role-type contract during Phase 3 migration so existing
// authorization tests and callers continue to see `rentee`. The canonical portal
// model uses `tenant` internally and can replace this compatibility value later.
export const getRoleType = ({ user, membership }) => {
  const portalType = getPortalType({ user, membership });
  return portalType === PORTAL_TYPES.TENANT ? 'rentee' : portalType;
};

export const hasActiveTenantMembership = ({ membership, tenantId }) => {
  if (!membership) {
    return false;
  }

  const status = String(membership.status || 'active').trim().toLowerCase();
  if (status !== 'active') {
    return false;
  }

  if (!tenantId) {
    return true;
  }

  return String(membership.tenant_id || membership.tenantId || '') === String(tenantId);
};

export const canAccessOwnedResource = ({ user, membership, tenantId, ownerUserId }) => {
  if (!user?.id || !ownerUserId || !hasActiveTenantMembership({ membership, tenantId })) {
    return false;
  }

  return String(user.id) === String(ownerUserId);
};

export const canAccessAssignedJob = ({ user, membership, tenantId, assignedUserId }) => {
  if (!user?.id || !assignedUserId || !hasActiveTenantMembership({ membership, tenantId })) {
    return false;
  }

  return String(user.id) === String(assignedUserId);
};

export const canAccessAssignedProperty = ({ user, membership, tenantId, propertyId, assignedPropertyIds }) => {
  if (!user?.id || !propertyId || !hasActiveTenantMembership({ membership, tenantId })) {
    return false;
  }

  const effectiveAssignments = Array.isArray(assignedPropertyIds)
    ? assignedPropertyIds
    : Array.isArray(membership?.assignedPropertyIds)
      ? membership.assignedPropertyIds
      : [];

  return effectiveAssignments.some((assignedPropertyId) => String(assignedPropertyId) === String(propertyId));
};

export const isAdminRole = ({ user, membership }) => getPortalType({ user, membership }) === PORTAL_TYPES.ADMIN;
export const isTenantRole = ({ user, membership }) => getPortalType({ user, membership }) === PORTAL_TYPES.TENANT;
export const isStaffRole = ({ user, membership }) => getPortalType({ user, membership }) === PORTAL_TYPES.STAFF;
