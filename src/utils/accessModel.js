export const PORTAL_TYPES = Object.freeze({
  ADMIN: 'admin',
  STAFF: 'staff',
  TENANT: 'tenant',
  UNLINKED: 'unlinked'
});

export const STAFF_PERMISSION_BUNDLES = Object.freeze({
  PROPERTY_OPERATIONS: 'property_operations',
  FINANCE: 'finance',
  MAINTENANCE: 'maintenance',
  READ_ONLY: 'read_only'
});

const LEGACY_STAFF_BUNDLE_BY_ROLE = Object.freeze({
  manager: STAFF_PERMISSION_BUNDLES.PROPERTY_OPERATIONS,
  finance_staff: STAFF_PERMISSION_BUNDLES.FINANCE,
  maintenance_staff: STAFF_PERMISSION_BUNDLES.MAINTENANCE,
  maintenance: STAFF_PERMISSION_BUNDLES.MAINTENANCE,
  supervisor: STAFF_PERMISSION_BUNDLES.MAINTENANCE,
  staff: STAFF_PERMISSION_BUNDLES.MAINTENANCE
});

const STAFF_BUNDLES = new Set(Object.values(STAFF_PERMISSION_BUNDLES));

const normalizeValue = (value) => String(value || '').trim().toLowerCase();

export const getStoredRole = ({ user, membership } = {}) => normalizeValue(
  membership?.role || user?.role || user?.user_type
);

export const getPortalType = (subject = {}) => {
  const role = getStoredRole(subject);

  if (role === 'admin') {
    return PORTAL_TYPES.ADMIN;
  }

  if (role === 'tenant' || role === 'rentee') {
    return PORTAL_TYPES.TENANT;
  }

  if (role === 'staff' || Object.prototype.hasOwnProperty.call(LEGACY_STAFF_BUNDLE_BY_ROLE, role)) {
    return PORTAL_TYPES.STAFF;
  }

  return PORTAL_TYPES.UNLINKED;
};

export const getStaffPermissionBundle = ({ user, membership } = {}) => {
  if (getPortalType({ user, membership }) !== PORTAL_TYPES.STAFF) {
    return null;
  }

  const explicitBundle = normalizeValue(
    membership?.permission_bundle
      || membership?.permissionBundle
      || user?.permission_bundle
      || user?.permissionBundle
  );

  if (STAFF_BUNDLES.has(explicitBundle)) {
    return explicitBundle;
  }

  const role = getStoredRole({ user, membership });
  return LEGACY_STAFF_BUNDLE_BY_ROLE[role] || STAFF_PERMISSION_BUNDLES.READ_ONLY;
};

export const isAdministrator = (subject = {}) => getPortalType(subject) === PORTAL_TYPES.ADMIN;
export const isStaff = (subject = {}) => getPortalType(subject) === PORTAL_TYPES.STAFF;
export const isTenant = (subject = {}) => getPortalType(subject) === PORTAL_TYPES.TENANT;
