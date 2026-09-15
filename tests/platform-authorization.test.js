import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizePlatformQuery,
  authorizePlatformRpc,
  getPlatformRoleType
} from '../src/api/platform/authorization.js';

const admin = { id: 'admin-1', role: 'admin' };
const tenant = { id: 'tenant-1', role: 'rentee' };
const staff = { id: 'staff-1', role: 'maintenance_staff' };
const unlinked = { id: 'unknown-1', role: 'authenticated' };

const activeMembership = (role, assignedPropertyIds = []) => ({
  tenant_id: 'tenant-a',
  role,
  status: 'active',
  assignedPropertyIds
});

const expectAuthorizationError = (callback, code) => {
  assert.throws(callback, (error) => error?.status === 403 && error?.code === code);
};

test('maps legacy staff roles to the staff business user type', () => {
  assert.equal(getPlatformRoleType({ user: staff }), 'staff');
  assert.equal(getPlatformRoleType({ user: tenant }), 'rentee');
  assert.equal(getPlatformRoleType({ user: unlinked }), 'unlinked');
});

test('denies business-table access to an unlinked authenticated account', () => {
  expectAuthorizationError(
    () => authorizePlatformQuery({ user: unlinked, action: 'select', table: 'properties' }),
    'ROLE_ACCESS_DENIED'
  );
});

test('adds the current user as an unavoidable tenant ownership filter', () => {
  const result = authorizePlatformQuery({
    user: tenant,
    action: 'select',
    table: 'invoices',
    filters: [{ column: 'renteeid', operator: 'eq', value: 'tenant-2' }]
  });

  assert.deepEqual(result.filters, [
    { column: 'renteeid', operator: 'eq', value: 'tenant-2' },
    { column: 'renteeid', operator: 'eq', value: 'tenant-1' }
  ]);
});

test('uses relationship ownership for a tenant property lookup', () => {
  const result = authorizePlatformQuery({ user: tenant, action: 'select', table: 'properties' });
  assert.deepEqual(result.resourceScope, { kind: 'tenant-property', userId: 'tenant-1' });
});

test('forces tenant identity and removes privileged fields from maintenance inserts', () => {
  const result = authorizePlatformQuery({
    user: tenant,
    action: 'insert',
    table: 'maintenance_requests',
    payload: {
      title: 'Leaking tap',
      description: 'Kitchen tap is leaking',
      propertyid: 'property-1',
      renteeid: 'tenant-2',
      assignedto: 'staff-1',
      status: 'completed',
      tenant_id: 'another-tenant'
    }
  });

  assert.deepEqual(result.payload, {
    title: 'Leaking tap',
    description: 'Kitchen tap is leaking',
    propertyid: 'property-1',
    renteeid: 'tenant-1'
  });
});

test('prevents a tenant from updating role or identity fields', () => {
  expectAuthorizationError(
    () => authorizePlatformQuery({
      user: tenant,
      action: 'update',
      table: 'app_users',
      filters: [{ column: 'id', operator: 'eq', value: 'tenant-1' }],
      payload: { role: 'admin', tenant_id: 'another-tenant' }
    }),
    'FIELD_ACCESS_DENIED'
  );
});

test('denies tenant generic delete and upsert operations', () => {
  for (const action of ['delete', 'upsert']) {
    expectAuthorizationError(
      () => authorizePlatformQuery({
        user: tenant,
        action,
        table: 'maintenance_requests',
        filters: [{ column: 'id', operator: 'eq', value: 'request-1' }]
      }),
      'ACTION_ACCESS_DENIED'
    );
  }
});

test('denies finance records to staff without a permission profile', () => {
  expectAuthorizationError(
    () => authorizePlatformQuery({ user: staff, action: 'select', table: 'invoices' }),
    'PERMISSION_REQUIRED'
  );
});

test('limits maintenance staff reads to assigned requests', () => {
  const result = authorizePlatformQuery({
    user: staff,
    action: 'select',
    table: 'maintenance_requests',
    filters: [{ column: 'id', operator: 'eq', value: 'request-1' }]
  });
  assert.deepEqual(result.filters.at(-1), { column: 'assignedto', operator: 'eq', value: 'staff-1' });
});

test('limits property-capable staff reads to active assigned properties', () => {
  const financeUser = { id: 'finance-1', role: 'finance_staff' };
  const membership = activeMembership('finance_staff', ['property-1', 'property-2']);

  const propertiesResult = authorizePlatformQuery({
    user: financeUser,
    membership,
    action: 'select',
    table: 'properties'
  });
  assert.deepEqual(propertiesResult.filters.at(-1), {
    column: 'id',
    operator: 'in',
    value: ['property-1', 'property-2']
  });

  const invoicesResult = authorizePlatformQuery({
    user: financeUser,
    membership,
    action: 'select',
    table: 'invoices'
  });
  assert.deepEqual(invoicesResult.filters.at(-1), {
    column: 'propertyid',
    operator: 'in',
    value: ['property-1', 'property-2']
  });
});

test('property-capable staff with no active assignments receives an empty assignment scope', () => {
  const financeUser = { id: 'finance-1', role: 'finance_staff' };
  const result = authorizePlatformQuery({
    user: financeUser,
    membership: activeMembership('finance_staff'),
    action: 'select',
    table: 'invoices'
  });

  assert.deepEqual(result.filters.at(-1), {
    column: 'propertyid',
    operator: 'in',
    value: []
  });
});

test('maintenance staff property reads are scoped but finance data remains denied', () => {
  const membership = activeMembership('maintenance_staff', ['property-7']);
  const propertiesResult = authorizePlatformQuery({
    user: staff,
    membership,
    action: 'select',
    table: 'properties'
  });
  assert.deepEqual(propertiesResult.filters.at(-1), {
    column: 'id',
    operator: 'in',
    value: ['property-7']
  });

  expectAuthorizationError(
    () => authorizePlatformQuery({
      user: staff,
      membership,
      action: 'select',
      table: 'invoices'
    }),
    'PERMISSION_REQUIRED'
  );
});

test('blocks schema and raw SQL RPCs for every role including administrators', () => {
  for (const user of [admin, staff, tenant]) {
    for (const name of ['exec_sql', 'create_policy', 'enable_rls', 'create_app_users_table']) {
      expectAuthorizationError(
        () => authorizePlatformRpc({ name, user }),
        'RPC_BLOCKED'
      );
    }
  }
});

test('allows operational RPCs only to administrators in Phase 1', () => {
  assert.equal(authorizePlatformRpc({ name: 'update_agreement_status', user: admin }), 'update_agreement_status');
  expectAuthorizationError(
    () => authorizePlatformRpc({ name: 'update_agreement_status', user: staff }),
    'RPC_ACCESS_DENIED'
  );
  expectAuthorizationError(
    () => authorizePlatformRpc({ name: 'update_agreement_status', user: tenant }),
    'RPC_ACCESS_DENIED'
  );
});

test('blocks arbitrary tables even for an administrator', () => {
  expectAuthorizationError(
    () => authorizePlatformQuery({ user: admin, action: 'select', table: 'auth_users' }),
    'TABLE_BLOCKED'
  );
});

test('blocks unfiltered administrator updates and deletes', () => {
  for (const action of ['update', 'delete']) {
    expectAuthorizationError(
      () => authorizePlatformQuery({ user: admin, action, table: 'properties', payload: { status: 'available' } }),
      'UNFILTERED_MUTATION_BLOCKED'
    );
  }
});

test('allows a scoped administrator business query', () => {
  const result = authorizePlatformQuery({
    user: admin,
    action: 'update',
    table: 'properties',
    filters: [{ column: 'id', operator: 'eq', value: 'property-1' }],
    payload: { status: 'occupied' }
  });
  assert.equal(result.table, 'properties');
  assert.equal(result.action, 'update');
});
