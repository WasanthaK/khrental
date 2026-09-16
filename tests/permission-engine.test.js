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

const activeMembership = (role, tenantId = 'tenant-a', assignedPropertyIds = undefined, permissionBundle = undefined) => ({
  tenant_id: tenantId,
  role,
  status: 'active',
  ...(assignedPropertyIds ? { assignedPropertyIds } : {}),
  ...(permissionBundle ? { permission_bundle: permissionBundle } : {})
});

const expectPermissionError = (callback) => {
  assert.throws(callback, (error) => error?.status === 403 && error?.code === 'PERMISSION_REQUIRED');
};

test('maps administrator, staff, tenant, and unlinked roles consistently', () => {
  assert.equal(getRoleType({ user: { id: 'admin-1', role: 'admin' } }), 'admin');
  assert.equal(getRoleType({ user: { id: 'staff-1', role: 'maintenance_staff' } }), 'staff');
  assert.equal(getRoleType({ user: { id: 'tenant-1', role: 'rentee' } }), 'tenant');
  assert.equal(getRoleType({ user: { id: 'tenant-2', role: 'tenant' } }), 'tenant');
  assert.equal(getRoleType({ user: { id: 'unknown-1', role: 'authenticated' } }), 'unlinked');
});

test('administrator receives the complete named permission set', () => {
  const subject = { user: { id: 'admin-1', role: 'admin' } };
  assert.equal(hasPermission(subject, PERMISSIONS.PROPERTIES_READ), true);
  assert.equal(hasPermission(subject, PERMISSIONS.PROPERTY_ASSIGNMENTS_MANAGE), true);
  assert.equal(hasPermission(subject, PERMISSIONS.RENTEES_MANAGE), true);
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), true);
  assert.equal(hasPermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED), true);
  assert.equal(getPermissions(subject).size, Object.keys(PERMISSIONS).length);
});

test('non-admin roles cannot manage staff property assignments', () => {
  for (const role of ['manager', 'finance_staff', 'maintenance_staff', 'staff', 'rentee']) {
    const subject = {
      user: { id: `${role}-1`, role },
      membership: activeMembership(role)
    };
    assert.equal(hasPermission(subject, PERMISSIONS.PROPERTY_ASSIGNMENTS_MANAGE), false);
  }
});

test('manager can read and manage rentees while finance staff can only read them', () => {
  const manager = {
    user: { id: 'manager-1', role: 'manager' },
    membership: activeMembership('manager')
  };
  const finance = {
    user: { id: 'finance-1', role: 'finance_staff' },
    membership: activeMembership('finance_staff')
  };

  assert.equal(hasPermission(manager, PERMISSIONS.RENTEES_READ), true);
  assert.equal(hasPermission(manager, PERMISSIONS.RENTEES_MANAGE), true);
  assert.equal(hasPermission(finance, PERMISSIONS.RENTEES_READ), true);
  assert.equal(hasPermission(finance, PERMISSIONS.RENTEES_MANAGE), false);
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

test('canonical staff role uses the explicit property operations bundle', () => {
  const subject = {
    user: { id: 'staff-ops-1', role: 'staff' },
    membership: activeMembership('staff', 'tenant-a', ['property-1'], 'property_operations')
  };

  assert.equal(getRoleType(subject), 'staff');
  assert.equal(hasPermission(subject, PERMISSIONS.PROPERTIES_MANAGE), true);
  assert.equal(hasPermission(subject, PERMISSIONS.RENTEES_MANAGE), true);
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), true);
  assert.equal(hasPermission(subject, PERMISSIONS.PROPERTY_ASSIGNMENTS_MANAGE), false);
});

test('canonical staff role uses the explicit finance bundle', () => {
  const subject = {
    user: { id: 'staff-finance-1', role: 'staff' },
    membership: activeMembership('staff', 'tenant-a', ['property-1'], 'finance')
  };

  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), true);
  assert.equal(hasPermission(subject, PERMISSIONS.RENTEES_READ), true);
  assert.equal(hasPermission(subject, PERMISSIONS.RENTEES_MANAGE), false);
  assert.equal(hasPermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED), false);
});

test('canonical staff role uses the explicit maintenance bundle', () => {
  const subject = {
    user: { id: 'staff-maintenance-1', role: 'staff' },
    membership: activeMembership('staff', 'tenant-a', ['property-1'], 'maintenance')
  };

  assert.equal(hasPermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED), true);
  assert.equal(hasPermission(subject, PERMISSIONS.TASKS_UPDATE_ASSIGNED), true);
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), false);
});

test('canonical staff role supports a safe read-only bundle', () => {
  const subject = {
    user: { id: 'staff-read-1', role: 'staff' },
    membership: activeMembership('staff', 'tenant-a', ['property-1'], 'read_only')
  };

  assert.equal(hasPermission(subject, PERMISSIONS.PROPERTIES_READ), true);
  assert.equal(hasPermission(subject, PERMISSIONS.PROPERTIES_MANAGE), false);
  assert.equal(hasPermission(subject, PERMISSIONS.INVOICES_MANAGE), false);
  assert.equal(hasPermission(subject, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED), false);
});

test('legacy staff roles preserve their Phase 2 permissions through bundle mapping', () => {
  const manager = { user: { id: 'manager-1' }, membership: activeMembership('manager') };
  const finance = { user: { id: 'finance-1' }, membership: activeMembership('finance_staff') };
  const maintenance = { user: { id: 'maintenance-1' }, membership: activeMembership('maintenance_staff') };

  assert.equal(hasPermission(manager, PERMISSIONS.PROPERTIES_MANAGE), true);
  assert.equal(hasPermission(finance, PERMISSIONS.INVOICES_MANAGE), true);
  assert.equal(hasPermission(maintenance, PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED), true);
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
    membership: activeMembership('maintenance_staff', 'tenant-a', ['property-1', 'property-2']),
    tenantId: 'tenant-a'
  };
  assert.equal(canAccessAssignedProperty({ ...context, propertyId: 'property-2' }), true);
  assert.equal(canAccessAssignedProperty({ ...context, propertyId: 'property-3' }), false);
  assert.equal(canAccessAssignedProperty({ ...context, tenantId: 'tenant-b', propertyId: 'property-2' }), false);
});

test('explicit assignment list can override membership assignments for endpoint checks', () => {
  const context = {
    user: { id: 'staff-1' },
    membership: activeMembership('maintenance_staff', 'tenant-a', ['property-1']),
    tenantId: 'tenant-a'
  };
  assert.equal(canAccessAssignedProperty({ ...context, propertyId: 'property-2', assignedPropertyIds: ['property-2'] }), true);
  assert.equal(canAccessAssignedProperty({ ...context, propertyId: 'property-1', assignedPropertyIds: [] }), false);
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
  expectPermissionError(() => authorizePermission(subject, PERMISSIONS.PROPERTY_ASSIGNMENTS_MANAGE));
});
