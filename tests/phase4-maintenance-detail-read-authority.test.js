import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapMaintenanceLifecycleProjection } from '../src/services/maintenanceProjectionMapper.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const staff = read('../src/pages/MaintenanceDetails.jsx');
const renter = read('../src/pages/rentee/RenteeMaintenanceDetails.jsx');
const reader = read('../src/services/maintenanceDetailReadService.js');

test('both routed maintenance detail screens use one authorized lifecycle reader', () => {
  for (const page of [staff, renter]) {
    assert.match(page, /getAuthorizedMaintenanceDetail\(id\)/);
    assert.doesNotMatch(page, /from\('maintenance_requests'\)/);
  }
  assert.doesNotMatch(staff, /from\('maintenance_request_images'\)/);
  assert.match(reader, /getMaintenanceLifecycleRequest\(requestId\)/);
  assert.match(reader, /if \(error\) throw error/);
  assert.doesNotMatch(reader, /platformClient|fetchData|\.from\(/);
});

test('projection rejects missing and malformed authorized data rather than presenting empty success', () => {
  for (const value of [null, {}, { request: { id: 'x' } }, { request: null, images: [] }]) {
    assert.throws(() => mapMaintenanceLifecycleProjection(value), /invalid request projection/);
  }
});

test('server-authorized projection preserves fields consumed by detail screens', () => {
  const projection = mapMaintenanceLifecycleProjection({
    request: {
      id: 'x', title: 'Repair', status: 'pending', propertyid: 'p',
      property_name: 'Tower', property_address: 'Street',
      renteeid: 'r', rentee_name: 'Renter', rentee_email: 'r@example.invalid',
      assignedto: 'w', assigned_name: 'Worker'
    },
    images: [{ id: 'photo', image_url: '/photo' }],
    comments: [], events: []
  });
  assert.equal(projection.property.name, 'Tower');
  assert.equal(projection.rentee.name, 'Renter');
  assert.equal(projection.assigned_staff.name, 'Worker');
  assert.equal(projection.maintenance_request_images[0].id, 'photo');
});

test('server controls scope and internal comment disclosure before returning detail', () => {
  const router = read('../src/api/platform/maintenanceLifecycleRouter.js');
  assert.match(router, /WHERE mr.tenant_id = @tenantId AND mr.id = @requestId/);
  assert.match(router, /assertReadAccess\(req, request\)/);
  assert.match(router, /AND c.is_internal = 0/);
});
