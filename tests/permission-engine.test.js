import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSIONS,
  canAccessAssignedJob,
  canAccessAssignedProperty,
  canAccessOwnedResource,
  getPermissions,
  getRoleType,
  hasActiveTenantMembership,
  hasPermission
} from '../src/api/platform/permissionEngine.js';
import { authorizePermission } from '../src/api/platform/authorization.js';

const activeMembership = (role, tenantId = 'tenant-a') => ({
  tenant_id: tenantId,
  role,
  status: 'active'
});

const expectPermissionError = (callback) => {
  assert.throws(callback, (error) => error?.status === 403 && error?.code === 'PERMISSION_REQUIRED');
};

test('maps administrator, staff, tenant, and unlinked roles consistently', () => {
  assert.equal(getRoleType({ user: { id: 'admin-1', role: 'admin' } }), 'admin');
  assert.equal(getRoleType({ user: { id: 'staff-1', role: 'maintenance_staff' } }), 'staff');
  assert.equal(getRoleType({ user: { id: 'tenant-1', role: 'rentee' } }), 'rentee');
  assert.equal(getRoleType({ user: { id: 'unknown-1', role: 'authenticated' } }), 'unlinked');
});

test('administrator receives the complete named permission set', () => {
  const subject = { user: { id: 'admin-1', role: 'admin' } };
  assert.equal(hasPermission(subject, PERMISSIONS.PROPERTIES_READ), true);
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), true);
  assert.equal(hasPermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED), true);
  assert.equal(getPermissions(subject).size, Object.keys(PERMISSIONS).length);
});

test('finance staff can manage invoices but cannot update assigned maintenance jobs', () => {
  const subject = {
    user: { id: 'finance-1', role: 'finance_staff' },
    membership: activeMembership('finance_staff')
  };
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), true);
  assert.equal(hasPermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED), false);
});

test('maintenance staff can update assigned jobs but cannot manage invoices', () => {
  const subject = {
    user: { id: 'maintenance-1', role: 'maintenance_staff' },
    membership: activeMembership('maintenance_staff')
  };
  assert.equal(hasPermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED), true);
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), false);
});

test('tenant can read own financial records but cannot manage invoices', () => {
  const subject = {
    user: { id: 'tenant-1', role: 'rentee' },
    membership: activeMembership('rentee')
  };
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_READ), true);
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), false);
});

test('membership role is authoritative over a legacy role on the user record', () => {
  const subject = {
    user: { id: 'user-1', role: 'admin' },
    membership: activeMembership('maintenance_staff')
  };
  assert.equal(getRoleType(subject), 'staff');
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), false);
  assert.equal(hasPermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED), true);
});

test('tenant membership must be active and match the selected tenant', () => {
  assert.equal(hasActiveTenantMembership({ membership: activeMembership('rentee'), tenantId: 'tenant-a' }), true);
  assert.equal(hasActiveTenantMembership({ membership: activeMembership('rentee'), tenantId: 'tenant-b' }), false);
  assert.equal(hasActiveTenantMembership({ membership: { ...activeMembership('rentee'), status: 'inactive' }, tenantId: 'tenant-a' }), false);
});

test('ownership requires the same user and an active tenant membership', () => {
  const context = {
    user: { id: 'tenant-1' },
    membership: activeMembership('rentee'),
    tenantId: 'tenant-a'
  };
  assert.equal(canAccessOwnedResource({ ...context, ownerUserId: 'tenant-1' }), true);
  assert.equal(canAccessOwnedResource({ ...context, ownerUserId: 'tenant-2' }), false);
});

test('job assignment requires the current staff user and active tenant membership', () => {
  const context = {
    user: { id: 'staff-1' },
    membership: activeMembership('maintenance_staff'),
    tenantId: 'tenant-a'
  };
  assert.equal(canAccessAssignedJob({ ...context, assignedUserId: 'staff-1' }), true);
  assert.equal(canAccessAssignedJob({ ...context, assignedUserId: 'staff-2' }), false);
});

test('property assignment rejects unassigned properties and cross-tenant membership', () => {
  const context = {
    user: { id: 'staff-1' },
    membership: activeMembership('maintenance_staff'),
    tenantId: 'tenant-a',
    assignedPropertyIds: ['property-1', 'property-2']
  };
  assert.equal(canAccessAssignedProperty({ ...context, propertyId: 'property-2' }), true);
  assert.equal(canAccessAssignedProperty({ ...context, propertyId: 'property-3' }), false);
  assert.equal(canAccessAssignedProperty({ ...context, tenantId: 'tenant-b', propertyId: 'property-2' }), false);
});

test('authorizePermission denies a missing named permission', () => {
  const subject = {
    user: { id: 'maintenance-1', role: 'maintenance_staff' },
    membership: activeMembership('maintenance_staff')
  };
  assert.equal(
    authorizePermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED),
    PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED
  );
  expectPermissionError(() => authorizePermission(subject, PERMISSIONS.INVOICES_MANAGE));
});
