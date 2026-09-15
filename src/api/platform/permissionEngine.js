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

const ADMIN_ROLE = 'admin';
const TENANT_ROLE = 'rentee';
const STAFF_ROLES = new Set([
  'staff',
  'manager',
  'finance_staff',
  'maintenance_staff',
  'maintenance',
  'supervisor'
]);

const ALL_PERMISSIONS = new Set(Object.values(PERMISSIONS));

const ROLE_PERMISSIONS = Object.freeze({
  admin: ALL_PERMISSIONS,
  manager: new Set([
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
  finance_staff: new Set([
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.RENTEES_READ,
    PERMISSIONS.INVOICES_READ,
    PERMISSIONS.INVOICES_MANAGE,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_MANAGE,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF
  ]),
  maintenance_staff: new Set([
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.MAINTENANCE_READ_ASSIGNED,
    PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED,
    PERMISSIONS.TASKS_READ_ASSIGNED,
    PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF
  ]),
  maintenance: new Set([
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.MAINTENANCE_READ_ASSIGNED,
    PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED,
    PERMISSIONS.TASKS_READ_ASSIGNED,
    PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF
  ]),
  supervisor: new Set([
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.MAINTENANCE_READ_ASSIGNED,
    PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED,
    PERMISSIONS.TASKS_READ_ASSIGNED,
    PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF
  ]),
  staff: new Set([
    PERMISSIONS.MAINTENANCE_READ_ASSIGNED,
    PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED,
    PERMISSIONS.TASKS_READ_ASSIGNED,
    PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF
  ]),
  rentee: new Set([
    PERMISSIONS.PROPERTIES_READ,
    PERMISSIONS.INVOICES_READ,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.AGREEMENTS_READ,
    PERMISSIONS.UTILITIES_READ,
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF
  ])
});

export const normalizeRole = (user, membership) => String(membership?.role || user?.role || user?.user_type || '')
  .trim()
  .toLowerCase();

export const getRoleType = ({ user, membership }) => {
  const role = normalizeRole(user, membership);
  if (role === ADMIN_ROLE) {
    return ADMIN_ROLE;
  }
  if (role === TENANT_ROLE) {
    return TENANT_ROLE;
  }
  if (STAFF_ROLES.has(role)) {
    return 'staff';
  }
  return 'unlinked';
};

export const getPermissions = ({ user, membership }) => {
  const role = normalizeRole(user, membership);
  return new Set(ROLE_PERMISSIONS[role] || []);
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

export const isAdminRole = ({ user, membership }) => normalizeRole(user, membership) === ADMIN_ROLE;
export const isTenantRole = ({ user, membership }) => normalizeRole(user, membership) === TENANT_ROLE;
export const isStaffRole = ({ user, membership }) => STAFF_ROLES.has(normalizeRole(user, membership));
