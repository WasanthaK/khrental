// Owner-approved expired-organization access policy (R5, 17 November 2026).
//
// After an organization's management entitlement lapses, administrators keep
// security cleanup: they may read existing renter/staff/assignment records,
// revoke access, demote, and remove property assignments. What lapses is the
// ability to EXPAND access: adding or inviting renters, staff or team members,
// granting permissions, activating memberships or assignments, linking a login,
// or adding property access. Platform administrators acting through /admin/*
// platform routes and SaaS billing recovery are outside this policy.
//
// The decision whether a request expands access is made here, from the current
// stored state and the requested change; the entitlement decision itself is
// the existing management-write check, so enrolment, complimentary, grace,
// revocation and schema readiness follow the same server-owned rules and no
// request field can influence it.
import { getPermissions } from '../../utils/accessPolicy.js';
import { assertManagementEntitlement, withManagementEntitlement } from './entitlementGate.js';

const normalize = value => String(value ?? '').trim().toLowerCase();
const provided = value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');

const parseList = value => {
  if (typeof value === 'string') {
    try { return parseList(JSON.parse(value)); } catch { return value.trim() ? [value] : []; }
  }
  return Array.isArray(value) ? value : [];
};

// Property associations are stored as ids or as {propertyId, unitId?}; a unit
// association is its own grant, keyed property:unit.
export const propertyIdsOf = value => new Set(parseList(value).map(entry => {
  if (!entry || typeof entry !== 'object') {return normalize(entry);}
  const property = normalize(entry.propertyId ?? entry.property_id ?? entry.propertyid ?? entry.id);
  const unit = normalize(entry.unitId ?? entry.unit_id);
  return property && unit ? `${property}:${unit}` : property;
}).filter(Boolean));

export const addsPropertyAccess = (current, requested) => {
  if (requested === undefined) {return false;}
  const existing = propertyIdsOf(current);
  return [...propertyIdsOf(requested)].some(id => !existing.has(id));
};

// A missing stored status means active throughout the access model.
export const activatesAccess = (currentStatus, requestedStatus) =>
  provided(requestedStatus) && normalize(requestedStatus) === 'active' && normalize(currentStatus || 'active') !== 'active';

const permissionsOf = ({ role, permission_bundle: bundle }) =>
  getPermissions({ membership: { role, permission_bundle: bundle, status: 'active' } });

// True when the requested role/bundle yields any permission the current
// role/bundle does not. Demotions and unchanged roles are not expansion.
export const grantsAdditionalPermissions = (current = {}, requested = {}) => {
  const bundle = requested.permission_bundle ?? requested.permissionBundle;
  const role = requested.role ?? requested.user_type ?? requested.userType;
  if (!provided(bundle) && !provided(role)) {return false;}
  const before = permissionsOf(current);
  const after = permissionsOf(provided(bundle)
    ? { role: provided(role) ? role : 'staff', permission_bundle: bundle }
    : { role, permission_bundle: null });
  return [...after].some(permission => !before.has(permission));
};

// --- Writer classifiers -----------------------------------------------------

export const renteeUpdateExpandsAccess = (current = {}, payload = {}) =>
  addsPropertyAccess(current.associated_properties ?? current.associated_property_ids,
    payload.associated_properties ?? payload.associated_property_ids)
  || activatesAccess(current.status, payload.status);

export const teamMemberUpdateExpandsAccess = (current = {}, payload = {}) =>
  grantsAdditionalPermissions(current.permission_bundle
    ? { role: 'staff', permission_bundle: current.permission_bundle }
    : { role: current.role, permission_bundle: null }, payload)
  || activatesAccess(current.tenant_membership_status ?? current.status, payload.membership_status)
  || activatesAccess(current.status, payload.status);

export const appUserUpdateExpandsAccess = (current = {}, payload = {}) =>
  grantsAdditionalPermissions({ role: current.role || current.user_type, permission_bundle: current.permission_bundle || null }, payload)
  || activatesAccess(current.status, payload.status)
  || addsPropertyAccess(current.associated_properties ?? current.associated_property_ids,
    payload.associated_properties ?? payload.associated_property_ids)
  || (provided(payload.auth_id) && normalize(payload.auth_id) !== normalize(current.auth_id));

// The generic platform query cannot diff multi-row updates, so any role,
// permission, property-access or login-link change, or activation, counts
// as expansion. Deactivation and plain profile edits remain available.
const GENERIC_GRANT_FIELDS = ['role', 'user_type', 'permission_bundle', 'associated_properties', 'associated_property_ids', 'tenant_id'];
export const genericAppUserWriteExpandsAccess = ({ table, action, payload }) => {
  if (table !== 'app_users') {return false;}
  if (action === 'insert' || action === 'upsert') {return true;}
  if (action !== 'update') {return false;}
  return (Array.isArray(payload) ? payload : [payload || {}]).some(row =>
    GENERIC_GRANT_FIELDS.some(field => Object.prototype.hasOwnProperty.call(row, field))
    || provided(row.auth_id)
    || (provided(row.status) && normalize(row.status) === 'active'));
};

// --- Enforcement ------------------------------------------------------------

// Throws 403 MANAGEMENT_READ_ONLY when access may not be expanded; the
// decision is the shared management-entitlement gate.
export const assertAccessExpansionAllowed = args => assertManagementEntitlement(args);

// Performs an access-expanding write while the entitlement lock is held, so
// expiry or revocation cannot commit between the decision and the expansion.
export const withAccessExpansion = ({ tenantId, action, guard, env }) =>
  withManagementEntitlement({ tenantId, action, guard, env });
