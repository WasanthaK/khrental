import { PERMISSIONS, hasAnyPermission, hasPermission } from './accessPolicy.js';

export const WORKSPACE_SECTIONS = Object.freeze({
  PROPERTIES: 'properties',
  RENTEES: 'rentees',
  AGREEMENTS: 'agreements',
  INVOICES: 'invoices',
  UTILITIES: 'utilities',
  MAINTENANCE: 'maintenance',
  CAMERAS: 'cameras',
  TEAM: 'team',
  SETTINGS: 'settings',
  TENANT_ADMIN: 'tenant_admin',
  ADMIN_DASHBOARD: 'admin_dashboard'
});

const SECTION_PERMISSION_REQUIREMENTS = Object.freeze({
  [WORKSPACE_SECTIONS.PROPERTIES]: [PERMISSIONS.PROPERTIES_READ],
  [WORKSPACE_SECTIONS.RENTEES]: [PERMISSIONS.RENTEES_READ],
  [WORKSPACE_SECTIONS.AGREEMENTS]: [PERMISSIONS.AGREEMENTS_READ],
  [WORKSPACE_SECTIONS.INVOICES]: [PERMISSIONS.INVOICES_READ],
  [WORKSPACE_SECTIONS.UTILITIES]: [PERMISSIONS.UTILITIES_REVIEW],
  [WORKSPACE_SECTIONS.MAINTENANCE]: [
    PERMISSIONS.MAINTENANCE_MANAGE,
    PERMISSIONS.MAINTENANCE_READ_ASSIGNED
  ],
  [WORKSPACE_SECTIONS.CAMERAS]: [PERMISSIONS.CAMERAS_READ],
  [WORKSPACE_SECTIONS.TEAM]: [PERMISSIONS.MEMBERSHIPS_MANAGE],
  [WORKSPACE_SECTIONS.SETTINGS]: [PERMISSIONS.TENANT_SETTINGS_MANAGE],
  [WORKSPACE_SECTIONS.TENANT_ADMIN]: [PERMISSIONS.MEMBERSHIPS_MANAGE],
  [WORKSPACE_SECTIONS.ADMIN_DASHBOARD]: [PERMISSIONS.TENANT_SETTINGS_MANAGE]
});

export const canAccessWorkspaceSection = (subject, section) => {
  const requiredPermissions = SECTION_PERMISSION_REQUIREMENTS[section] || [];
  return requiredPermissions.length > 0 && hasAnyPermission(subject, requiredPermissions);
};

export const canManageInvoices = (subject) => hasPermission(subject, PERMISSIONS.INVOICES_MANAGE);
export const canManageAgreements = (subject) => hasPermission(subject, PERMISSIONS.AGREEMENTS_MANAGE);
export const canManageProperties = (subject) => hasPermission(subject, PERMISSIONS.PROPERTIES_MANAGE);
export const canManageRentees = (subject) => hasPermission(subject, PERMISSIONS.RENTEES_MANAGE);
export const canManageCameras = (subject) => hasPermission(subject, PERMISSIONS.CAMERAS_MANAGE);
export const canReviewUtilities = (subject) => hasPermission(subject, PERMISSIONS.UTILITIES_REVIEW);
