import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapMaintenanceLifecycleProjection } from '../src/services/maintenanceProjectionMapper.js';

const source = readFileSync(new URL('../src/services/maintenanceLifecycleService.js', import.meta.url), 'utf8');
const router = readFileSync(new URL('../src/api/platform/maintenanceLifecycleRouter.js', import.meta.url), 'utf8');
const start = source.indexOf('const fetchCompleteRequest =');
const end = source.indexOf('const uploadLifecycleImages =', start);
assert.ok(start >= 0 && end > start);
const actualFunction = source.slice(start, end);
const instantiate = new Function('getMaintenanceLifecycleRequest', 'mapMaintenanceLifecycleProjection',
  actualFunction + '\nreturn fetchCompleteRequest;');

const projection = {
  request: {
    id: 'request-a', tenant_id: 'tenant-a', propertyid: 'property-a',
    renteeid: 'rentee-a', assignedto: 'staff-a', title: 'Leaking pipe',
    property_name: 'Main Building', property_address: 'Street 1',
    rentee_name: 'Renter A', rentee_email: 'renter@example.invalid',
    assigned_name: 'Staff A', status: 'in_progress'
  },
  images: [{ id: 'image-a', image_url: '/storage/maintenance/image-a' }],
  comments: [],
  events: []
};

test('authorized maintenance read preserves page-facing request fields and images', async () => {
  const calls = [];
  const read = instantiate(async id => {
    calls.push(id);
    return { data: projection, error: null };
  }, mapMaintenanceLifecycleProjection);
  const record = await read('request-a');
  assert.deepEqual(calls, ['request-a']);
  assert.equal(record.id, 'request-a');
  assert.equal(record.tenant_id, 'tenant-a');
  assert.equal(record.status, 'in_progress');
  assert.deepEqual(record.property, {id:'property-a',name:'Main Building',address:'Street 1'});
  assert.deepEqual(record.rentee, {id:'rentee-a',name:'Renter A',email:'renter@example.invalid'});
  assert.deepEqual(record.assigned_staff, {id:'staff-a',name:'Staff A'});
  assert.deepEqual(record.maintenance_request_images, projection.images);
});

test('denied lifecycle reads fail closed without a generic fallback', async () => {
  for (const status of [401, 403, 404, 409, 500, 503]) {
    const denial = Object.assign(new Error('Maintenance read denied'), {status});
    const read = instantiate(async () => ({data:null,error:denial}), mapMaintenanceLifecycleProjection);
    await assert.rejects(read('request-a'), error => error === denial);
  }
  assert.doesNotMatch(actualFunction, /platformClient|fetchData|\.from\(/);
  assert.match(actualFunction, /getMaintenanceLifecycleRequest\(requestId\)/);
});

test('incomplete projections do not masquerade as successful post-transition reads', () => {
  for (const value of [null, {}, {request:{}}, {request:{id:'request-a'}},
    {request:{id:1},images:[]}, {request:{id:'request-a'},images:null}]) {
    assert.throws(() => mapMaintenanceLifecycleProjection(value),
      error => error.code === 'INVALID_MAINTENANCE_PROJECTION');
  }
  const withNoRelations = mapMaintenanceLifecycleProjection({
    request:{id:'request-a',propertyid:null,renteeid:null,assignedto:null},
    images:[]
  });
  assert.equal(withNoRelations.property,null);
  assert.equal(withNoRelations.rentee,null);
  assert.equal(withNoRelations.assigned_staff,null);
  assert.deepEqual(withNoRelations.maintenance_request_images,[]);
});

test('server detail projection is authenticated, tenant scoped and owner/assignment authorized', () => {
  assert.match(router, /router\.use\(createTenantContextMiddleware\(/);
  assert.match(router, /requireUser: true/);
  assert.match(router, /requireTenant: true/);
  assert.match(router, /router\.get\('\/requests\/:requestId'/);
  assert.match(router, /assertReadAccess\(req, request\)/);
  assert.match(router, /mr\.tenant_id = @tenantId AND mr\.id = @requestId/);
  assert.match(router, /c\.tenant_id = @tenantId/);
  assert.match(router, /maintenance_request_images[\s\S]*tenant_id = @tenantId AND maintenance_request_id = @requestId/);
});
