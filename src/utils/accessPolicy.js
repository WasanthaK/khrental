import {
  PORTAL_TYPES,
  STAFF_PERMISSION_BUNDLES,
  getPortalType,
  getStaffPermissionBundle
} from './accessModel.js';

/**
 * Canonical KH Rentals permission vocabulary.
 *
 * This module is intentionally shared by browser and server code. Role/bundle
 * interpretation lives in accessModel.js; this file answers what the resolved
 * subject may do. Server authorization remains authoritative for every API
 * operation, while the browser uses the same policy to decide which routes and
 * navigation items should be presented.
 */
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

const normalizeSubject = (subject = {}) => {
  if (!subject) {
    return { user: null, membership: null };
  }

  if (Object.prototype.hasOwnProperty.call(subject, 'user')) {
    const user = subject.user || null;
    return {
      user,
      membership: subject.membership || user?.membership || null
    };
  }

  return {
    user: subject,
    membership: subject.membership || null
  };
};

export const getAccessSubject = (subject = {}) => normalizeSubject(subject);

export const getEffectivePortalType = (subject = {}) => {
  const { user, membership } = normalizeSubject(subject);
  return getPortalType({ user, membership });
};

export const getPermissions = (subject = {}) => {
  const { user, membership } = normalizeSubject(subject);
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

export const hasPermission = (subject, permission) => (
  Boolean(permission) && getPermissions(subject).has(permission)
);

export const hasAnyPermission = (subject, permissions = []) => (
  Array.isArray(permissions)
  && permissions.some((permission) => hasPermission(subject, permission))
);

export const hasAllPermissions = (subject, permissions = []) => (
  Array.isArray(permissions)
  && permissions.every((permission) => hasPermission(subject, permission))
);

export const hasPortalType = (subject, portalTypes = []) => {
  const allowedPortalTypes = Array.isArray(portalTypes) ? portalTypes : [portalTypes];
  return allowedPortalTypes.includes(getEffectivePortalType(subject));
};

export const getDefaultLandingPath = (subject = {}) => {
  const portalType = getEffectivePortalType(subject);

  if (portalType === PORTAL_TYPES.ADMIN || portalType === PORTAL_TYPES.STAFF) {
    return '/dashboard';
  }

  if (portalType === PORTAL_TYPES.TENANT) {
    return '/rentee';
  }

  return '/unauthorized';
};

export const getPortalLabel = (subject = {}) => {
  const portalType = getEffectivePortalType(subject);

  if (portalType === PORTAL_TYPES.ADMIN) {
    return 'Administrator';
  }

  if (portalType === PORTAL_TYPES.STAFF) {
    return 'Staff / Contractor';
  }

  if (portalType === PORTAL_TYPES.TENANT) {
    return 'Tenant / Lessee';
  }

  return 'Unlinked account';
};
