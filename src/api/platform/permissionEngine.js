import {
  PORTAL_TYPES,
  STAFF_PERMISSION_BUNDLES,
  getPortalType,
  getStaffPermissionBundle,
  getStoredRole
} from '../../utils/accessModel.js';

export const PERMISSIONS = Object.freeze({
  PROPERTIES_READ: 'properties.read',
  PROPERTIES_MANAGE: 'properties.manage',
  PROPERTY_ASSIGNMENTS_MANAGE: 'property_assignments.manage',
  RENTEES_READ: 'rentees.read',
  RENTEES_MANAGE: 'rentees.manage',
  INVOICES_READ: 'invoices.read',
  INVOICES_MANAGE: 'invoices.manage',
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_MANAGE: 'payments.manage',
  AGREEMENTS_READ: 'agreements.read',
  AGREEMENTS_MANAGE: 'agreements.manage',
  MAINTENANCE_READ_ASSIGNED: 'maintenance.read_assigned',
  MAINTENANCE_UPDATE_ASSIGNED: 'maintenance.update_assigned',
  MAINTENANCE_MANAGE: 'maintenance.manage',
  UTILITIES_READ: 'utilities.read',
  UTILITIES_REVIEW: 'utilities.review',
  TASKS_READ_ASSIGNED: 'tasks.read_assigned',
  TASKS_UPDATE_ASSIGNED: 'tasks.update_assigned',
  PROFILE_READ_SELF: 'profile.read_self',
  PROFILE_UPDATE_SELF: 'profile.update_self',
  MEMBERSHIPS_MANAGE: 'memberships.manage',
  TENANT_SETTINGS_MANAGE: 'tenant_settings.manage',
  COMMUNICATIONS_MANAGE: 'communications.manage',
  CAMERAS_READ: 'cameras.read',
  CAMERAS_MANAGE: 'cameras.manage'
});

const ALL_PERMISSIONS = new Set(Object.values(PERMISSIONS));

const TENANT_PERMISSIONS = new Set([
  PERMISSIONS.PROPERTIES_READ,
  PERMISSIONS.INVOICES_READ,
  PERMISSIONS.PAYMENTS_READ,
  PERMISSIONS.AGREEMENTS_READ,
  PERMISSIONS.UTILITIES_READ,
  PERMISSIONS.PROFILE_READ_SELF,
  PERMISSIONS.PROFILE_UPDATE_SELF
]);

const STAFF_BUNDLE_PERMISSIONS = Object.freeze({
  [STAFF_PERMISSION_BUNDLES.PROPERTY_OPERATIONS]: new Set([
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.PROPERTIES_MANAGE,
    PERMISSIONS.RENTEES_READ,
    PERMISSIONS.RENTEES_MANAGE,
    PERMISSIONS.INVOICES_READ,
    PERMISSIONS.INVOICES_MANAGE,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_MANAGE,
    PERMISSIONS.AGREEMENTS_READ,
    PERMISSIONS.AGREEMENTS_MANAGE,
    PERMISSIONS.MAINTENANCE_MANAGE,
    PERMISSIONS.UTILITIES_READ,
    PERMISSIONS.UTILITIES_REVIEW,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF,
    PERMISSIONS.COMMUNICATIONS_MANAGE,
    PERMISSIONS.CAMERAS_READ
  ]),
  [STAFF_PERMISSION_BUNDLES.FINANCE]: new Set([
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.RENTEES_READ,
    PERMISSIONS.INVOICES_READ,
    PERMISSIONS.INVOICES_MANAGE,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_MANAGE,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF
  ]),
  [STAFF_PERMISSION_BUNDLES.MAINTENANCE]: new Set([
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.MAINTENANCE_READ_ASSIGNED,
    PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED,
    PERMISSIONS.TASKS_READ_ASSIGNED,
    PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF
  ]),
  [STAFF_PERMISSION_BUNDLES.READ_ONLY]: new Set([
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF
  ])
});

export const normalizeRole = (user, membership) => getStoredRole({ user, membership });

// Keep the legacy public role-type contract during Phase 3 migration so existing
// authorization tests and callers continue to see `rentee`. The canonical portal
// model uses `tenant` internally and can replace this compatibility value later.
export const getRoleType = ({ user, membership }) => {
  const portalType = getPortalType({ user, membership });
  return portalType === PORTAL_TYPES.TENANT ? 'rentee' : portalType;
};

export const getPermissions = ({ user, membership }) => {
  const portalType = getPortalType({ user, membership });

  if (portalType === PORTAL_TYPES.ADMIN) {
    return new Set(ALL_PERMISSIONS);
  }

  if (portalType === PORTAL_TYPES.TENANT) {
    return new Set(TENANT_PERMISSIONS);
  }

  if (portalType === PORTAL_TYPES.STAFF) {
    const bundle = getStaffPermissionBundle({ user, membership });
    return new Set(STAFF_BUNDLE_PERMISSIONS[bundle] || []);
  }

  return new Set();
};

export const hasPermission = ({ user, membership }, permission) => getPermissions({ user, membership }).has(permission);

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
