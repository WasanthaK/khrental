import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAINTENANCE_STATUS,
  canTransitionMaintenanceStatus,
  assertMaintenanceTransition,
  canTenantCancelMaintenance
} from '../src/api/platform/maintenanceLifecycle.js';

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
