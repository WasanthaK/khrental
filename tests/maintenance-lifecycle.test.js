import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAINTENANCE_STATUS,
  canTransitionMaintenanceStatus,
  assertMaintenanceTransition,
  canTenantCancelMaintenance
} from '../src/api/platform/maintenanceLifecycle.js';
import {
  guardMaintenancePlatformQuery,
  hasMaintenanceLifecycleFields,
  isProtectedMaintenanceMutation
} from '../src/api/platform/maintenanceMutationGuard.js';

const createMockResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

test('pending work can start or be cancelled', () => {
  assert.equal(canTransitionMaintenanceStatus(MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.IN_PROGRESS), true);
  assert.equal(canTransitionMaintenanceStatus(MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.CANCELLED), true);
});

test('in-progress work can complete or be cancelled', () => {
  assert.equal(canTransitionMaintenanceStatus(MAINTENANCE_STATUS.IN_PROGRESS, MAINTENANCE_STATUS.COMPLETED), true);
  assert.equal(canTransitionMaintenanceStatus(MAINTENANCE_STATUS.IN_PROGRESS, MAINTENANCE_STATUS.CANCELLED), true);
});

test('completed and cancelled requests are terminal', () => {
  assert.equal(canTransitionMaintenanceStatus(MAINTENANCE_STATUS.COMPLETED, MAINTENANCE_STATUS.IN_PROGRESS), false);
  assert.equal(canTransitionMaintenanceStatus(MAINTENANCE_STATUS.CANCELLED, MAINTENANCE_STATUS.IN_PROGRESS), false);
});

test('invalid transition throws a lifecycle conflict', () => {
  assert.throws(
    () => assertMaintenanceTransition(MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.COMPLETED),
    (error) => error.code === 'INVALID_MAINTENANCE_TRANSITION' && error.status === 409
  );
});

test('tenant self-cancellation is limited to pending requests', () => {
  assert.equal(canTenantCancelMaintenance(MAINTENANCE_STATUS.PENDING), true);
  assert.equal(canTenantCancelMaintenance(MAINTENANCE_STATUS.IN_PROGRESS), false);
  assert.equal(canTenantCancelMaintenance(MAINTENANCE_STATUS.COMPLETED), false);
});

test('maintenance lifecycle ownership and state fields are protected', () => {
  assert.equal(hasMaintenanceLifecycleFields({ status: 'completed' }), true);
  assert.equal(hasMaintenanceLifecycleFields({ assignedto: 'staff-1' }), true);
  assert.equal(hasMaintenanceLifecycleFields({ propertyid: 'property-1' }), true);
  assert.equal(hasMaintenanceLifecycleFields({ title: 'Leaking tap', notes: 'Kitchen' }), false);
});

test('generic maintenance creation, deletion and lifecycle updates are blocked', () => {
  assert.equal(isProtectedMaintenanceMutation({
    action: 'insert',
    table: 'maintenance_requests',
    payload: { title: 'Leak' }
  }), true);
  assert.equal(isProtectedMaintenanceMutation({
    action: 'delete',
    table: 'maintenance_requests'
  }), true);
  assert.equal(isProtectedMaintenanceMutation({
    action: 'update',
    table: 'maintenance_requests',
    payload: { status: 'completed' }
  }), true);
  assert.equal(isProtectedMaintenanceMutation({
    action: 'update',
    table: 'maintenance_requests',
    payload: { notes: 'Access via side gate', updatedat: '2026-09-20T00:00:00Z' }
  }), false);
  assert.equal(isProtectedMaintenanceMutation({
    action: 'select',
    table: 'maintenance_requests'
  }), false);
});

test('generic maintenance lifecycle writes return MAINTENANCE_LIFECYCLE_REQUIRED', () => {
  const response = createMockResponse();
  let nextCalled = false;

  guardMaintenancePlatformQuery(
    { body: { action: 'update', table: 'maintenance_requests', payload: { assignedto: 'staff-1' } } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body?.code, 'MAINTENANCE_LIFECYCLE_REQUIRED');
});

test('descriptive maintenance edits still pass the generic guard', () => {
  const response = createMockResponse();
  let nextCalled = false;

  guardMaintenancePlatformQuery(
    { body: { action: 'update', table: 'maintenance_requests', payload: { notes: 'Tenant available after 4 PM' } } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});
