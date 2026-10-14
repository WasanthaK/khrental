import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const guid = value => String(value || '').toLowerCase();

export async function verifyPhase4StaffMaintenanceHttp({
  pool, a, b, tokenA, tokenB, call, createAuthRecord, issueAuthSession
}) {
  // A/B are disposable Docker SQL tenants. No live people or external URLs.
  const sqlRows = async (statement, inputs = {}) => {
    const request = pool.request();
    for (const [key, value] of Object.entries(inputs)) request.input(key, value);
    return (await request.query(statement)).recordset || [];
  };
  const one = async (statement, inputs) => (await sqlRows(statement, inputs))[0] || null;
  const check = (response, status, code = null) => {
    assert.equal(response.status, status, JSON.stringify(response));
    if (code) assert.equal(response.payload?.code, code, JSON.stringify(response));
    return response.payload?.data;
  };
  const actor = async (item, bundle, assignedPropertyId = null) => {
    const email = 'maintenance-acceptance-' + crypto.randomUUID() + '@example.invalid';
    const row = await one(
      "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, 'Fixture Staff', @email, 'staff', 'staff')",
      { tenantId: item.tenantId, email }
    );
    const userId = guid(row.id);
    await sqlRows(
      "INSERT INTO tenant_memberships (tenant_id, app_user_id, role, permission_bundle, status, is_default) VALUES (@tenantId, @userId, 'staff', @bundle, 'active', 1)",
      { tenantId: item.tenantId, userId, bundle }
    );
    if (assignedPropertyId) {
      await sqlRows(
        "INSERT INTO staff_property_assignments (tenant_id, propertyid, staff_user_id, status) VALUES (@tenantId, @propertyId, @userId, 'active')",
        { tenantId: item.tenantId, propertyId: assignedPropertyId, userId }
      );
    }
    const authId = crypto.randomUUID();
    const record = await createAuthRecord({
      authId, appUserId: userId, email, role: 'staff',
      password: crypto.randomBytes(24).toString('base64url')
    });
    await sqlRows(
      'UPDATE app_users SET auth_id = @authId WHERE tenant_id = @tenantId AND id = @userId',
      { tenantId: item.tenantId, userId, authId }
    );
    return { userId, email, authId, token: (await issueAuthSession(record)).accessToken };
  };

  const managerA = await actor(a, 'property_operations', a.propertyId);
  const managerNoScope = await actor(a, 'property_operations');
  const workerA = await actor(a, 'maintenance');
  const idleWorkerA = await actor(a, 'maintenance');
  const workerB = await actor(b, 'maintenance');
  const managerB = await actor(b, 'property_operations', b.propertyId);
  const path = id => '/api/maintenance-lifecycle/requests' + (id ? '/' + id : '');
  const api = (item, token, method, suffix, body) => call(suffix, {
    tenantId: item.tenantId, token, method, ...(body === undefined ? {} : { body })
  });
  const request = (item, token, method, id, action = '', body) =>
    api(item, token, method, path(id) + action, body);
  const snapshot = async id => ({
    request: await one(
      'SELECT id, tenant_id, renteeid, propertyid, assignedto, status, startedat, completedat, completed_by, completion_cost FROM maintenance_requests WHERE id = @id',
      { id }
    ),
    events: await sqlRows(
      'SELECT event_type, actor_user_id, from_status, to_status FROM maintenance_lifecycle_events WHERE maintenance_request_id = @id ORDER BY createdat, id',
      { id }
    ),
    images: await sqlRows(
      'SELECT image_url, uploaded_by FROM maintenance_request_images WHERE maintenance_request_id = @id ORDER BY image_url',
      { id }
    ),
    comments: await sqlRows(
      'SELECT comment, is_internal, user_id FROM maintenance_request_comments WHERE maintenance_request_id = @id ORDER BY comment',
      { id }
    )
  });

  const requestBody = {
    propertyId: a.propertyId, title: 'Staff lifecycle acceptance',
    description: 'Synthetic water leak for two-tenant acceptance'
  };
  check(await request(a, null, 'POST', null, '', requestBody), 401);
  check(await request(a, managerA.token, 'POST', null, '', requestBody), 403, 'TENANT_PORTAL_REQUIRED');
  check(await request(a, tokenA, 'POST', null, '', { ...requestBody, propertyId: b.propertyId }),
    409, 'ACTIVE_TENANCY_REQUIRED');
  const created = check(await request(a, tokenA, 'POST', null, '', requestBody), 201);
  const id = guid(created.id);
  assert.equal(guid(created.renteeid), a.renteeId);
  assert.equal(guid(created.propertyid), a.propertyId);
  assert.equal(created.status, 'pending');
  check(await request(b, tokenB, 'GET', id), 404, 'MAINTENANCE_REQUEST_NOT_FOUND');
  check(await request(a, tokenA, 'POST', id, '/assign', { staffUserId: workerA.userId }),
    403, 'MAINTENANCE_MANAGE_REQUIRED');
  check(await request(a, managerNoScope.token, 'POST', id, '/assign', { staffUserId: workerA.userId }),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, managerA.token, 'POST', id, '/assign', { staffUserId: workerB.userId }),
    400, 'INVALID_MAINTENANCE_ASSIGNEE');
  check(await request(b, managerB.token, 'POST', id, '/assign', { staffUserId: workerB.userId }),
    404, 'MAINTENANCE_REQUEST_NOT_FOUND');
  check(await request(a, idleWorkerA.token, 'GET', id), 403, 'RESOURCE_ACCESS_DENIED');
  const assigned = check(await request(a, managerA.token, 'POST', id, '/assign',
    { staffUserId: workerA.userId }), 200);
  assert.equal(guid(assigned.assignedto), workerA.userId);
  assert.equal(assigned.status, 'pending');

  check(await request(a, tokenA, 'POST', id, '/start', {}), 403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, idleWorkerA.token, 'POST', id, '/start', {}),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, managerNoScope.token, 'POST', id, '/start', {}),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, workerA.token, 'POST', id, '/complete', {}),
    409, 'INVALID_MAINTENANCE_TRANSITION');
  const started = check(await request(a, workerA.token, 'POST', id, '/start', {}), 200);
  assert.equal(started.status, 'in_progress');
  assert.ok(started.startedat);
  check(await request(a, workerA.token, 'POST', id, '/start', {}),
    409, 'INVALID_MAINTENANCE_TRANSITION');

  check(await request(a, tokenA, 'POST', id, '/comments',
    { comment: 'Attempt private comment', isInternal: true }),
    403, 'INTERNAL_COMMENT_FORBIDDEN');
  check(await request(a, workerA.token, 'POST', id, '/comments', { comment: '  ' }),
    400, 'COMMENT_REQUIRED');
  check(await request(a, workerA.token, 'POST', id, '/comments',
    { comment: 'Staff-only diagnosis', isInternal: true }), 201);
  check(await request(a, tokenA, 'POST', id, '/comments',
    { comment: 'Visible tenant update' }), 201);
  const renterProjection = check(await request(a, tokenA, 'GET', id), 200);
  assert.ok(renterProjection.comments.some(c => c.comment === 'Visible tenant update'));
  assert.ok(!renterProjection.comments.some(c => c.comment === 'Staff-only diagnosis'));
  const staffProjection = check(await request(a, workerA.token, 'GET', id), 200);
  assert.ok(staffProjection.comments.some(c => c.comment === 'Staff-only diagnosis'));
  check(await request(a, idleWorkerA.token, 'POST', id, '/comments',
    { comment: 'Unauthorized write' }), 403, 'RESOURCE_ACCESS_DENIED');

  const imageUrl = '/storage/images/tenants/' + a.tenantId + '/maintenance/worker-fixture.png';
  check(await request(a, idleWorkerA.token, 'POST', id, '/images',
    { imageUrl }), 403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, workerA.token, 'POST', id, '/images',
    { imageUrl: '/storage/images/tenants/' + b.tenantId + '/maintenance/foreign.png' }),
    400, 'INVALID_MAINTENANCE_IMAGE_URL');
  const image = check(await request(a, workerA.token, 'POST', id, '/images',
    { imageUrl, imageType: 'completion' }), 201);
  assert.equal(image.image_url, imageUrl);
  assert.equal(guid(image.uploaded_by), workerA.userId);

  check(await request(a, idleWorkerA.token, 'POST', id, '/complete',
    { completionCost: 12 }), 403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, workerA.token, 'POST', id, '/complete',
    { completionCost: -1 }), 400, 'INVALID_MAINTENANCE_COST');
  const beforeComplete = await snapshot(id);
  assert.equal(beforeComplete.request.status, 'in_progress');
  const completed = check(await request(a, workerA.token, 'POST', id, '/complete',
    { completionCost: 125.5, notes: 'Fixture work complete' }), 200);
  assert.equal(completed.status, 'completed');
  assert.equal(Number(completed.completion_cost), 125.5);
  assert.equal(guid(completed.completed_by), workerA.userId);
  const afterComplete = await snapshot(id);
  assert.equal(afterComplete.request.status, 'completed');
  assert.deepEqual(afterComplete.events.map(e => e.event_type).sort(),
    ['request_assigned', 'request_created', 'work_completed', 'work_started']);
  assert.equal(afterComplete.images.length, 1);
  assert.equal(afterComplete.comments.length, 2);
  check(await request(a, workerA.token, 'POST', id, '/complete', {}),
    409, 'INVALID_MAINTENANCE_TRANSITION');
  check(await request(a, managerA.token, 'POST', id, '/assign',
    { staffUserId: idleWorkerA.userId }), 409, 'MAINTENANCE_REQUEST_CLOSED');
  check(await request(a, tokenA, 'POST', id, '/images', { imageUrl }),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, workerA.token, 'POST', id, '/images', { imageUrl }),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, tokenA, 'POST', id, '/cancel', { reason: 'too late' }),
    403, 'RESOURCE_ACCESS_DENIED');
  assert.deepEqual(await snapshot(id), afterComplete, 'denials/replays must not mutate closed request');

  // Property scope denial must hold even when staff and request share a tenant.
  const unrelatedProperty = await one(
    "INSERT INTO properties (tenant_id, name, status) OUTPUT INSERTED.id VALUES (@tenantId, 'Unassigned property', 'available')",
    { tenantId: a.tenantId }
  );
  const outOfScopeRequest = await one(
    "INSERT INTO maintenance_requests (tenant_id, propertyid, renteeid, title, description) OUTPUT INSERTED.id VALUES (@tenantId, @propertyId, @renteeId, 'Outside staff scope', 'Synthetic')",
    { tenantId: a.tenantId, propertyId: unrelatedProperty.id, renteeId: a.renteeId }
  );
  const outsideId = guid(outOfScopeRequest.id);
  check(await request(a, managerA.token, 'GET', outsideId),
    403, 'RESOURCE_ACCESS_DENIED');
  check(await request(a, managerA.token, 'POST', outsideId, '/assign',
    { staffUserId: workerA.userId }), 403, 'RESOURCE_ACCESS_DENIED');
  assert.equal((await snapshot(outsideId)).request.assignedto, null);
  // No real outgoing notification is claimed. This router records lifecycle
  // events; external delivery is a distinct unresolved acceptance gate.
  assert.equal((await snapshot(id)).request.status, 'completed');
  console.log('PASS: real-session renter request -> scoped staff assignment -> assigned start/comment/image/complete, replay and cross-tenant denials');
}
