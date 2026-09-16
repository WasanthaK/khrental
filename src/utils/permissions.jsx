import React from 'react';
import { PORTAL_TYPES } from './accessModel.js';
import {
  PERMISSIONS as CANONICAL_PERMISSIONS,
  getEffectivePortalType,
  getPermissions,
  hasAllPermissions as hasAllCanonicalPermissions,
  hasAnyPermission as hasAnyCanonicalPermission,
  hasPermission as hasCanonicalPermission
} from './accessPolicy.js';

/**
 * Phase 3C compatibility bridge.
 *
 * New browser code should import from accessPolicy.js directly. This module is
 * retained temporarily for older components that still use the pre-Phase-3
 * permission names. It translates those names into the canonical shared policy
 * and does not define an independent role/permission matrix.
 */
const LEGACY_PERMISSIONS = Object.freeze({
  VIEW_PROPERTIES: 'legacy.view_properties',
  CREATE_PROPERTY: 'legacy.create_property',
  EDIT_PROPERTY: 'legacy.edit_property',
  DELETE_PROPERTY: 'legacy.delete_property',
  VIEW_RENTEES: 'legacy.view_rentees',
  CREATE_RENTEE: 'legacy.create_rentee',
  EDIT_RENTEE: 'legacy.edit_rentee',
  DELETE_RENTEE: 'legacy.delete_rentee',
  VIEW_INVOICES: 'legacy.view_invoices',
  CREATE_INVOICE: 'legacy.create_invoice',
  EDIT_INVOICE: 'legacy.edit_invoice',
  DELETE_INVOICE: 'legacy.delete_invoice',
  VIEW_MAINTENANCE: 'legacy.view_maintenance',
  CREATE_MAINTENANCE: 'legacy.create_maintenance',
  EDIT_MAINTENANCE: 'legacy.edit_maintenance',
  DELETE_MAINTENANCE: 'legacy.delete_maintenance',
  ASSIGN_MAINTENANCE: 'legacy.assign_maintenance',
  VIEW_AGREEMENTS: 'legacy.view_agreements',
  CREATE_AGREEMENT: 'legacy.create_agreement',
  EDIT_AGREEMENT: 'legacy.edit_agreement',
  DELETE_AGREEMENT: 'legacy.delete_agreement',
  VIEW_TEAM: 'legacy.view_team',
  CREATE_TEAM_MEMBER: 'legacy.create_team_member',
  EDIT_TEAM_MEMBER: 'legacy.edit_team_member',
  DELETE_TEAM_MEMBER: 'legacy.delete_team_member',
  VIEW_REPORTS: 'legacy.view_reports',
  CREATE_REPORT: 'legacy.create_report',
  VIEW_ADMIN_TOOLS: 'legacy.view_admin_tools'
});

export const PERMISSIONS = Object.freeze({
  ...CANONICAL_PERMISSIONS,
  ...LEGACY_PERMISSIONS
});

export const ROLES = Object.freeze({
  ADMIN: PORTAL_TYPES.ADMIN,
  STAFF: PORTAL_TYPES.STAFF,
  TENANT: PORTAL_TYPES.TENANT
});

const isAdministrator = (subject) => getEffectivePortalType(subject) === PORTAL_TYPES.ADMIN;

const LEGACY_PERMISSION_CHECKS = Object.freeze({
  [LEGACY_PERMISSIONS.VIEW_PROPERTIES]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.PROPERTIES_READ),
  [LEGACY_PERMISSIONS.CREATE_PROPERTY]: isAdministrator,
  [LEGACY_PERMISSIONS.EDIT_PROPERTY]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.PROPERTIES_MANAGE),
  [LEGACY_PERMISSIONS.DELETE_PROPERTY]: isAdministrator,
  [LEGACY_PERMISSIONS.VIEW_RENTEES]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.RENTEES_READ),
  [LEGACY_PERMISSIONS.CREATE_RENTEE]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.RENTEES_MANAGE),
  [LEGACY_PERMISSIONS.EDIT_RENTEE]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.RENTEES_MANAGE),
  [LEGACY_PERMISSIONS.DELETE_RENTEE]: isAdministrator,
  [LEGACY_PERMISSIONS.VIEW_INVOICES]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.INVOICES_READ),
  [LEGACY_PERMISSIONS.CREATE_INVOICE]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.INVOICES_MANAGE),
  [LEGACY_PERMISSIONS.EDIT_INVOICE]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.INVOICES_MANAGE),
  [LEGACY_PERMISSIONS.DELETE_INVOICE]: isAdministrator,
  [LEGACY_PERMISSIONS.VIEW_MAINTENANCE]: (subject) => hasAnyCanonicalPermission(subject, [
    CANONICAL_PERMISSIONS.MAINTENANCE_MANAGE,
    CANONICAL_PERMISSIONS.MAINTENANCE_READ_ASSIGNED
  ]),
  [LEGACY_PERMISSIONS.CREATE_MAINTENANCE]: isAdministrator,
  [LEGACY_PERMISSIONS.EDIT_MAINTENANCE]: (subject) => hasAnyCanonicalPermission(subject, [
    CANONICAL_PERMISSIONS.MAINTENANCE_MANAGE,
    CANONICAL_PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED
  ]),
  [LEGACY_PERMISSIONS.DELETE_MAINTENANCE]: isAdministrator,
  [LEGACY_PERMISSIONS.ASSIGN_MAINTENANCE]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.MAINTENANCE_MANAGE),
  [LEGACY_PERMISSIONS.VIEW_AGREEMENTS]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.AGREEMENTS_READ),
  [LEGACY_PERMISSIONS.CREATE_AGREEMENT]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.AGREEMENTS_MANAGE),
  [LEGACY_PERMISSIONS.EDIT_AGREEMENT]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.AGREEMENTS_MANAGE),
  [LEGACY_PERMISSIONS.DELETE_AGREEMENT]: isAdministrator,
  [LEGACY_PERMISSIONS.VIEW_TEAM]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.MEMBERSHIPS_MANAGE),
  [LEGACY_PERMISSIONS.CREATE_TEAM_MEMBER]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.MEMBERSHIPS_MANAGE),
  [LEGACY_PERMISSIONS.EDIT_TEAM_MEMBER]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.MEMBERSHIPS_MANAGE),
  [LEGACY_PERMISSIONS.DELETE_TEAM_MEMBER]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.MEMBERSHIPS_MANAGE),
  [LEGACY_PERMISSIONS.VIEW_REPORTS]: isAdministrator,
  [LEGACY_PERMISSIONS.CREATE_REPORT]: isAdministrator,
  [LEGACY_PERMISSIONS.VIEW_ADMIN_TOOLS]: (subject) => hasCanonicalPermission(subject, CANONICAL_PERMISSIONS.TENANT_SETTINGS_MANAGE)
});

export { getPermissions };

export const hasPermission = (subject, permission) => {
  const legacyCheck = LEGACY_PERMISSION_CHECKS[permission];
  return legacyCheck ? legacyCheck(subject) : hasCanonicalPermission(subject, permission);
};

export const hasAnyPermission = (subject, permissions = []) => (
  permissions.some((permission) => hasPermission(subject, permission))
);

export const hasAllPermissions = (subject, permissions = []) => (
  permissions.every((permission) => hasPermission(subject, permission))
);

export const withPermission = (WrappedComponent, requiredPermission) => {
  const PermissionWrappedComponent = (props) => {
    const { user } = props;

    if (!hasPermission(user, requiredPermission)) {
      return <div>You don't have permission to access this feature.</div>;
    }

    return <WrappedComponent {...props} />;
  };

  return PermissionWrappedComponent;
};
