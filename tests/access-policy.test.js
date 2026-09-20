import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTAL_TYPES } from '../src/utils/accessModel.js';
import {
  PERMISSIONS,
  getDefaultLandingPath,
  getEffectivePortalType,
  hasPermission
} from '../src/utils/accessPolicy.js';
import {
  WORKSPACE_SECTIONS,
  canAccessWorkspaceSection
} from '../src/utils/navigationPolicy.js';
import {
  isRenteeDirectoryRecord,
  normalizeRenteeDirectoryRecords
} from '../src/utils/renteeDirectory.js';

const subject = (role, permissionBundle = undefined) => ({
  user: { id: `${role}-user`, role },
  membership: {
    tenant_id: 'tenant-a',
    role,
    status: 'active',
    ...(permissionBundle ? { permission_bundle: permissionBundle } : {})
  }
});

test('shared policy resolves canonical portal types and landing paths', () => {
  assert.equal(getEffectivePortalType(subject('admin')), PORTAL_TYPES.ADMIN);
  assert.equal(getEffectivePortalType(subject('staff', 'maintenance')), PORTAL_TYPES.STAFF);
  assert.equal(getEffectivePortalType(subject('rentee')), PORTAL_TYPES.TENANT);
  assert.equal(getDefaultLandingPath(subject('admin')), '/dashboard');
  assert.equal(getDefaultLandingPath(subject('staff', 'finance')), '/dashboard');
  assert.equal(getDefaultLandingPath(subject('rentee')), '/rentee');
  assert.equal(getDefaultLandingPath({ user: { role: 'authenticated' } }), '/unauthorized');
});

test('browser and server share the same staff bundle permissions', () => {
  const propertyOperations = subject('staff', 'property_operations');
  const finance = subject('staff', 'finance');
  const maintenance = subject('staff', 'maintenance');
  const readOnly = subject('staff', 'read_only');

  assert.equal(hasPermission(propertyOperations, PERMISSIONS.PROPERTIES_MANAGE), true);
  assert.equal(hasPermission(propertyOperations, PERMISSIONS.UTILITIES_REVIEW), true);
  assert.equal(hasPermission(finance, PERMISSIONS.INVOICES_MANAGE), true);
  assert.equal(hasPermission(finance, PERMISSIONS.UTILITIES_REVIEW), false);
  assert.equal(hasPermission(maintenance, PERMISSIONS.MAINTENANCE_READ_ASSIGNED), true);
  assert.equal(hasPermission(maintenance, PERMISSIONS.INVOICES_READ), false);
  assert.equal(hasPermission(readOnly, PERMISSIONS.PROPERTIES_READ), true);
  assert.equal(hasPermission(readOnly, PERMISSIONS.PROPERTIES_MANAGE), false);
});

test('workspace navigation is derived from canonical permissions', () => {
  const propertyOperations = subject('staff', 'property_operations');
  const finance = subject('staff', 'finance');
  const maintenance = subject('staff', 'maintenance');
  const readOnly = subject('staff', 'read_only');

  assert.equal(canAccessWorkspaceSection(propertyOperations, WORKSPACE_SECTIONS.RENTEES), true);
  assert.equal(canAccessWorkspaceSection(propertyOperations, WORKSPACE_SECTIONS.UTILITIES), true);
  assert.equal(canAccessWorkspaceSection(finance, WORKSPACE_SECTIONS.INVOICES), true);
  assert.equal(canAccessWorkspaceSection(finance, WORKSPACE_SECTIONS.UTILITIES), false);
  assert.equal(canAccessWorkspaceSection(maintenance, WORKSPACE_SECTIONS.MAINTENANCE), true);
  assert.equal(canAccessWorkspaceSection(maintenance, WORKSPACE_SECTIONS.INVOICES), false);
  assert.equal(canAccessWorkspaceSection(readOnly, WORKSPACE_SECTIONS.PROPERTIES), true);
  assert.equal(canAccessWorkspaceSection(readOnly, WORKSPACE_SECTIONS.TEAM), false);
});

test('tenant and administrator navigation capabilities remain separated', () => {
  const admin = subject('admin');
  const tenant = subject('rentee');

  assert.equal(canAccessWorkspaceSection(admin, WORKSPACE_SECTIONS.TEAM), true);
  assert.equal(canAccessWorkspaceSection(admin, WORKSPACE_SECTIONS.SETTINGS), true);
  assert.equal(hasPermission(tenant, PERMISSIONS.INVOICES_READ), true);
  assert.equal(hasPermission(tenant, PERMISSIONS.INVOICES_MANAGE), false);
});

test('tenant directory keeps canonical and legacy rentee rows visible', () => {
  assert.equal(isRenteeDirectoryRecord({ user_type: 'rentee', role: 'rentee' }), true);
  assert.equal(isRenteeDirectoryRecord({ user_type: 'staff', role: 'rentee' }), true);
  assert.equal(isRenteeDirectoryRecord({ user_type: 'staff', role: 'staff' }), false);

  const records = normalizeRenteeDirectoryRecords([
    { id: 'rentee-1', user_type: 'rentee', role: 'rentee' },
    { id: 'rentee-2', user_type: 'staff', role: 'rentee' },
    { id: 'staff-1', user_type: 'staff', role: 'staff' },
    { id: 'rentee-1', user_type: 'rentee', role: 'rentee' }
  ]);

  assert.deepEqual(records.map((record) => record.id), ['rentee-1', 'rentee-2']);
});
