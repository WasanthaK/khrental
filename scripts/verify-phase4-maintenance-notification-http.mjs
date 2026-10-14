import assert from 'node:assert/strict';

const equalId = (left, right) => String(left || '').toLowerCase() === String(right || '').toLowerCase();

/**
 * Exercise the actual tenant middleware, SQL-backed bearer session verifier,
 * notification and maintenance Express routers against disposable two-tenant SQL.
 * This is authenticated HTTP acceptance, NOT a claim of complete browser UX.
 */
export async function verifyPhase4MaintenanceNotificationHttp({ a, b, seeded, call }) {
  const request = (route, token, tenantId, method = 'GET', body) =>
    call(route, { token, tenantId, method, body });

  const noAuthNotifications = await request('/api/notifications/me', null, a.tenantId);
  assert.equal(noAuthNotifications.status, 401, JSON.stringify(noAuthNotifications));
  const noAuthMaintenance = await request(
    '/api/maintenance-lifecycle/requests/' + seeded.requestA, null, a.tenantId
  );
  assert.equal(noAuthMaintenance.status, 401, JSON.stringify(noAuthMaintenance));

  const ownA = await request('/api/notifications/me?page=1&pageSize=10', a.token, a.tenantId);
  assert.equal(ownA.status, 200, JSON.stringify(ownA));
  assert.ok(Array.isArray(ownA.payload.data));
  assert.ok(ownA.payload.data.some(row => equalId(row.id, seeded.notificationA)));
  assert.ok(!ownA.payload.data.some(row => equalId(row.id, seeded.notificationB)));

  // The caller-supplied userId must not change self-only ownership.
  const forgedOwner = await request(
    '/api/notifications/me?page=1&pageSize=10&userId=' + encodeURIComponent(b.renteeId),
    a.token, a.tenantId
  );
  assert.equal(forgedOwner.status, 200, JSON.stringify(forgedOwner));
  assert.ok(forgedOwner.payload.data.some(row => equalId(row.id, seeded.notificationA)));
  assert.ok(!forgedOwner.payload.data.some(row => equalId(row.id, seeded.notificationB)));

  const wrongTenant = await request('/api/notifications/me', a.token, b.tenantId);
  assert.equal(wrongTenant.status, 403, JSON.stringify(wrongTenant));
  assert.equal(wrongTenant.payload.code, 'TENANT_ACCESS_DENIED');

  const invalidPage = await request('/api/notifications/me?pageSize=201', a.token, a.tenantId);
  assert.equal(invalidPage.status, 400, JSON.stringify(invalidPage));
  assert.equal(invalidPage.payload.code, 'INVALID_NOTIFICATION_PAGE');

  const readForeign = await request(
    '/api/notifications/' + seeded.notificationB + '/read', a.token, a.tenantId, 'PATCH'
  );
  assert.equal(readForeign.status, 404, JSON.stringify(readForeign));
  assert.equal(readForeign.payload.code, 'NOTIFICATION_NOT_FOUND');

  const readOwn = await request(
    '/api/notifications/' + seeded.notificationA + '/read', a.token, a.tenantId, 'PATCH'
  );
  assert.equal(readOwn.status, 200, JSON.stringify(readOwn));
  assert.ok(equalId(readOwn.payload.data.id, seeded.notificationA));
  assert.equal(Boolean(readOwn.payload.data.is_read), true);

  const ownB = await request('/api/notifications/me', b.token, b.tenantId);
  assert.equal(ownB.status, 200, JSON.stringify(ownB));
  const noticeB = ownB.payload.data.find(row => equalId(row.id, seeded.notificationB));
  assert.ok(noticeB, 'other tenant must still see its own notification');
  assert.equal(Boolean(noticeB.is_read), false, 'foreign read attempt must not mutate tenant B');

  const maintenancePathA = '/api/maintenance-lifecycle/requests/' + seeded.requestA;
  const maintenancePathB = '/api/maintenance-lifecycle/requests/' + seeded.requestB;
  const ownMaintenance = await request(maintenancePathA, a.token, a.tenantId);
  assert.equal(ownMaintenance.status, 200, JSON.stringify(ownMaintenance));
  assert.ok(equalId(ownMaintenance.payload.data.request.id, seeded.requestA));
  assert.ok(ownMaintenance.payload.data.images.some(row => equalId(
    row.maintenance_request_id, seeded.requestA
  )), 'tenant A must see its existing own attachment');

  const foreignMaintenance = await request(maintenancePathB, a.token, a.tenantId);
  assert.equal(foreignMaintenance.status, 404, JSON.stringify(foreignMaintenance));
  assert.equal(foreignMaintenance.payload.code, 'MAINTENANCE_REQUEST_NOT_FOUND');

  const deniedForeignUpload = await request(maintenancePathB + '/images', a.token, a.tenantId, 'POST', {
    imageUrl: '/storage/images/tenants/' + a.tenantId + '/maintenance/foreign-request.jpg'
  });
  assert.equal(deniedForeignUpload.status, 404, JSON.stringify(deniedForeignUpload));

  const wrongTenantMaintenance = await request(maintenancePathA, a.token, b.tenantId);
  assert.equal(wrongTenantMaintenance.status, 403, JSON.stringify(wrongTenantMaintenance));

  const foreignImageUrl = await request(maintenancePathA + '/images', a.token, a.tenantId, 'POST', {
    imageUrl: '/storage/images/tenants/' + b.tenantId + '/maintenance/foreign.jpg'
  });
  assert.equal(foreignImageUrl.status, 400, JSON.stringify(foreignImageUrl));
  assert.equal(foreignImageUrl.payload.code, 'INVALID_MAINTENANCE_IMAGE_URL');

  const addedUrl = '/storage/images/tenants/' + a.tenantId + '/maintenance/http-acceptance.jpg';
  const added = await request(maintenancePathA + '/images', a.token, a.tenantId, 'POST', {
    imageUrl: addedUrl, imageType: 'additional', description: 'Disposable SQL HTTP acceptance'
  });
  assert.equal(added.status, 201, JSON.stringify(added));
  assert.ok(equalId(added.payload.data.tenant_id, a.tenantId));
  assert.ok(equalId(added.payload.data.maintenance_request_id, seeded.requestA));
  assert.ok(equalId(added.payload.data.uploaded_by, a.renteeId));

  const reloaded = await request(maintenancePathA, a.token, a.tenantId);
  assert.equal(reloaded.status, 200, JSON.stringify(reloaded));
  assert.ok(reloaded.payload.data.images.some(row => row.image_url === addedUrl));

  const tenantBAfter = await request(maintenancePathB, b.token, b.tenantId);
  assert.equal(tenantBAfter.status, 200, JSON.stringify(tenantBAfter));
  assert.ok(!tenantBAfter.payload.data.images.some(row => row.image_url === addedUrl));

  console.log('PASS: authenticated SQL-backed HTTP maintenance/notification ownership, tenant isolation, denial and own attachment');
}
