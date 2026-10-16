import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  authorizeMaintenanceImageAttachment,
  normalizeMaintenanceImageUrl,
  sameMaintenanceIdentifier
} from '../src/api/platform/maintenanceImagePolicy.js';
import { writeMaintenanceNotifications } from '../src/api/platform/maintenanceNotificationWriter.js';
import {
  parseNotificationPage,
  listOwnNotificationPage,
  markOwnNotificationRead,
  requireNotificationTenantRecipient
} from '../src/api/platform/notificationAccess.js';

const src = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const actor = { id: 'user-a' };
const work = { id: 'request-a', status: 'pending', renteeid: 'user-a', assignedto: 'staff-a' };

test('maintenance attachment roles allow only the owning renter, scoped manager or assigned worker while open', () => {
  const allowed = extra => authorizeMaintenanceImageAttachment({
    user: actor, request: work,
    isTenant: true, canManage: false, canUpdateAssigned: false, hasPropertyScope: false,
    ...extra
  });
  assert.equal(allowed({}), true);
  assert.equal(allowed({ user: { id: 'foreign-renter' } }), false);
  assert.equal(allowed({ user: { id: 'manager' }, isTenant: false, canManage: true, hasPropertyScope: true }), true);
  assert.equal(allowed({ user: { id: 'manager' }, isTenant: false, canManage: true, hasPropertyScope: false }), false);
  assert.equal(allowed({ user: { id: 'staff-a' }, isTenant: false, canUpdateAssigned: true }), true);
  assert.equal(allowed({ user: { id: 'staff-other' }, isTenant: false, canUpdateAssigned: true }), false);
  assert.equal(allowed({ user: { id: 'staff-a' }, isTenant: false, canUpdateAssigned: false }), false);
  assert.equal(allowed({ request: { ...work, status: 'completed' } }), false);
  assert.equal(allowed({ request: { ...work, status: 'cancelled' } }), false);
  assert.equal(allowed({ user: null }), false);
});

test('SQL Server uppercase GUIDs preserve matching maintenance owner/worker/manager scope', () => {
  assert.equal(sameMaintenanceIdentifier('7C7BEAFB-7EC3-4AAC-A23D-000000000001',
    '7c7beafb-7ec3-4aac-a23d-000000000001'), true);
  assert.equal(sameMaintenanceIdentifier(null, ''), false);
  assert.equal(sameMaintenanceIdentifier('other', '7c7beafb-7ec3-4aac-a23d-000000000001'), false);
  assert.equal(authorizeMaintenanceImageAttachment({
    user: { id: '7c7beafb-7ec3-4aac-a23d-000000000001' },
    request: { status: 'pending', renteeid: '7C7BEAFB-7EC3-4AAC-A23D-000000000001' },
    isTenant: true, canManage: false, canUpdateAssigned: false, hasPropertyScope: false
  }), true);
  const router = src('../src/api/platform/maintenanceLifecycleRouter.js');
  assert.match(router, /sameMaintenanceIdentifier\(request\.renteeid, req\.user\?\.id\)/);
  assert.match(router, /sameMaintenanceIdentifier\(id, propertyId\)/);
  assert.match(router, /sameMaintenanceIdentifier\(request\.assignedto, req\.user\.id\)/);
});

test('maintenance image URLs cannot target foreign tenant storage, external hosts or arbitrary files', () => {
  const opts = { tenantId: 'TENANT-A', requestHost: 'khrental.example' };
  const local = '/storage/images/tenants/TENANT-A/maintenance/file.jpg';
  const exact = 'https://khrental.example' + local;
  assert.equal(normalizeMaintenanceImageUrl({ ...opts, value: local }), local);
  assert.equal(normalizeMaintenanceImageUrl({ ...opts, value: exact }), exact);
  for (const value of [
    'https://external.example' + local, '//external.example' + local,
    '/storage/images/tenants/TENANT-B/maintenance/file.jpg',
    '/storage/files/tenants/TENANT-A/maintenance/file.pdf',
    '/storage/images/tenants/TENANT-A/id-copies/secret.jpg',
    local + '?share=1', local + '#fragment',
    '/storage/images/tenants/TENANT-A/maintenance/',
    '/storage/images/tenants/TENANT-A/maintenance/%2fsecret.jpg',
    '/storage/images/tenants/TENANT-A/maintenance/file.jpg/extra',
    'https://khrental.example.evil.test' + local,
    'file:///storage/images/tenants/TENANT-A/maintenance/file.jpg'
  ]) {
    assert.equal(normalizeMaintenanceImageUrl({ ...opts, value }), null, value);
  }
});

test('notification history is tenant-and-user-scoped and paginates consistently', async () => {
  assert.deepEqual(parseNotificationPage({}), { page: 1, pageSize: 100 });
  assert.deepEqual(parseNotificationPage({ page: '2', pageSize: '200' }), { page: 2, pageSize: 200 });
  for (const query of [{ page: '0' }, { page: '-1' }, { pageSize: '500' }, { page: 'NaN' }, { pageSize: '1.5' }]) {
    assert.throws(() => parseNotificationPage(query), e => e.code === 'INVALID_NOTIFICATION_PAGE');
  }

  let captured;
  const rows = await listOwnNotificationPage({
    tenantId: 'tenant-a', userId: 'user-a', page: 3, pageSize: 50,
    query: async (sql, params) => { captured = { sql, params }; return [{ id: 'notification-a' }]; }
  });
  assert.deepEqual(rows, [{ id: 'notification-a' }]);
  assert.deepEqual(captured.params, { tenantId: 'tenant-a', userId: 'user-a', offset: 100, pageSize: 50 });
  assert.match(captured.sql, /n\.tenant_id = @tenantId AND n\.user_id = @userId/);
  assert.match(captured.sql, /ORDER BY n\.createdat DESC, n\.id DESC/);
});

test('notification read mutations cannot update another user or tenant record', async () => {
  let captured;
  const record = await markOwnNotificationRead({
    tenantId: 'tenant-a', userId: 'user-a', notificationId: 'notification-a',
    queryOne: async (sql, params) => { captured = { sql, params }; return { id: 'notification-a', is_read: true }; }
  });
  assert.equal(record.is_read, true);
  assert.deepEqual(captured.params, { tenantId: 'tenant-a', userId: 'user-a', notificationId: 'notification-a' });
  assert.match(captured.sql, /WHERE tenant_id = @tenantId AND user_id = @userId AND id = @notificationId/);
  await assert.rejects(markOwnNotificationRead({
    tenantId: 'tenant-a', userId: 'user-a', notificationId: 'other-user-notification',
    queryOne: async () => null
  }), error => error.code === 'NOTIFICATION_NOT_FOUND' && error.status === 404);
});

test('generic notification insert requires active membership of recipient in matching tenant', async () => {
  const calls = [];
  const queryOne = async (sql, params) => {
    calls.push({ sql, params });
    return params.userId === 'member-a' && params.tenantId === 'tenant-a'
      ? { app_user_id: 'member-a' } : null;
  };
  assert.equal(await requireNotificationTenantRecipient({
    tenantId: 'tenant-a', userId: 'member-a', queryOne
  }), true);
  assert.deepEqual(calls[0].params, { tenantId: 'tenant-a', userId: 'member-a' });
  assert.match(calls[0].sql, /tenant_id = @tenantId AND app_user_id = @userId AND status = 'active'/);
  for (const [tenantId, userId] of [['tenant-b', 'member-a'], ['tenant-a', 'foreign-user'], ['tenant-a', '']]) {
    await assert.rejects(requireNotificationTenantRecipient({ tenantId, userId, queryOne }),
      error => error.status === 403);
  }
});

test('live server and clients use canonical image/notification paths, not generic table reads/writes', () => {
  const maintenanceRouter = src('../src/api/platform/maintenanceLifecycleRouter.js');
  const maintenanceService = src('../src/services/maintenanceLifecycleService.js');
  const maintenanceClient = src('../src/services/maintenanceLifecycleClient.js');
  const notifyService = src('../src/services/notificationService.js');
  const notifyRouter = src('../src/api/platform/notificationSelfRouter.js');
  const platformRouter = src('../src/api/platform/router.js');
  const server = src('../server.js');

  assert.match(maintenanceRouter, /router\.post\('\/requests\/:requestId\/images'/);
  assert.match(maintenanceRouter, /loadRequest\(req\.tenantId, req\.params\.requestId\)/);
  assert.match(maintenanceRouter, /authorizeMaintenanceImageAttachment\(/);
  assert.match(maintenanceRouter, /normalizeMaintenanceImageUrl\(/);
  assert.match(maintenanceRouter, /tenant_id, maintenance_request_id, image_url, image_type, description, uploaded_by/);
  assert.match(maintenanceClient, /attachMaintenanceLifecycleImage/);
  assert.match(maintenanceService, /attachMaintenanceLifecycleImage\(requestId/);
  assert.doesNotMatch(maintenanceService, /platformClient|from\('maintenance_request_images'\)/);

  assert.match(platformRouter, /if \(table === 'notifications'\)/);
  assert.match(platformRouter, /requireNotificationTenantRecipient\(/);
  assert.match(notifyRouter, /requireUser: true/);
  assert.match(notifyRouter, /requireTenant: true/);
  assert.match(notifyRouter, /userId: req\.user\.id/);
  assert.match(notifyService, /\/api\/notifications\/me\?page=/);
  assert.match(notifyService, /\/api\/notifications\/\$\{encodeURIComponent\(notificationId\)\}\/read/);
  const readFns = notifyService.slice(notifyService.indexOf('export const getUserNotifications'), notifyService.indexOf('// Function to get notification templates'));
  assert.doesNotMatch(readFns, /platformClient\.from|\.from\('notifications'\)/);
  assert.match(server, /app\.use\('\/api\/notifications', createNotificationSelfRouter\(\)\)/);
});


test('Phase 5: new maintenance request notifies only property-scoped managers and organization admins', async () => {
  const transaction = { fixture: 'one SQL transaction' };
  const recorded = [];
  const candidates = [
    { app_user_id: 'ADMIN-A', role: 'admin', property_scope: 0 },
    { app_user_id: 'MANAGER-A', role: 'manager', property_scope: 1 },
    { app_user_id: 'manager-a', role: 'manager', property_scope: 1 },
    { app_user_id: 'MANAGER-NO-SCOPE', role: 'manager', property_scope: 0 },
    { app_user_id: 'FINANCE-A', role: 'finance_staff', property_scope: 1 },
    { app_user_id: 'WORKER-A', role: 'maintenance_staff', property_scope: 1 },
    { app_user_id: 'READ-ONLY-A', role: 'staff', permission_bundle: 'read_only', property_scope: 1 }
  ];
  const queryTransaction = async (actualTransaction, sql, params) => {
    assert.equal(actualTransaction, transaction);
    recorded.push({ sql, params });
    return sql.includes('SELECT tm.app_user_id') ? candidates : [];
  };
  await writeMaintenanceNotifications({
    transaction, queryTransaction, tenantId: 'tenant-a', requestId: 'request-1',
    eventType: 'request_created', propertyId: 'property-a',
    renteeId: 'rentee-a', assignedStaffId: 'worker-a'
  });
  assert.equal(recorded[0].params.tenantId, 'tenant-a');
  assert.equal(recorded[0].params.propertyId, 'property-a');
  assert.match(recorded[0].sql, /tm\.tenant_id = @tenantId AND tm\.status = 'active'/);
  assert.match(recorded[0].sql, /spa\.status = 'active'/);
  assert.match(recorded[0].sql, /au\.status = 'active' AND au\.active = 1/);
  const writes = recorded.slice(1);
  assert.deepEqual(writes.map(item => item.params.userId).sort(), ['admin-a', 'manager-a']);
  for (const write of writes) {
    assert.match(write.sql, /INSERT INTO notifications/);
    assert.match(write.sql, /tm\.tenant_id = @tenantId AND tm\.app_user_id = @userId/);
    assert.match(write.sql, /tm\.status = 'active' AND au\.status = 'active' AND au\.active = 1/);
    assert.deepEqual(Object.keys(write.params).sort(), ['message', 'tenantId', 'userId']);
    assert.equal(write.params.message, 'Maintenance request_created: request request-1');
    assert.ok(!/internal|payment|contact/i.test(write.params.message));
  }
});

test('Phase 5: lifecycle notices deduplicate recipients and never broadcast or leak details', async () => {
  for (const eventType of ['request_assigned', 'work_started', 'work_completed', 'request_cancelled']) {
    const writes = [];
    const transaction = { eventType };
    await writeMaintenanceNotifications({
      transaction,
      queryTransaction: async (received, sql, params) => {
        assert.equal(received, transaction);
        assert.match(sql, /INSERT INTO notifications/);
        writes.push(params);
        return [];
      },
      tenantId: 'tenant-a', requestId: 'request-1',
      eventType, propertyId: 'property-a',
      renteeId: 'RENTEE-A', assignedStaffId: 'WORKER-A', previousStaffId: 'worker-a'
    });
    assert.deepEqual(writes.map(write => write.userId).sort(), ['rentee-a', 'worker-a']);
    assert.ok(writes.every(write => write.tenantId === 'tenant-a'));
    assert.ok(writes.every(write => write.message === 'Maintenance ' + eventType + ': request request-1'));
    assert.ok(writes.every(write => !/contact|payment|internal/i.test(write.message)));
  }
});

test('Phase 5: invalid maintenance event is rejected before any SQL operation', async () => {
  let called = false;
  await assert.rejects(
    () => writeMaintenanceNotifications({
      transaction: {},
      queryTransaction: async () => { called = true; return []; },
      tenantId: 'tenant-a', requestId: 'request-a', eventType: 'invoice_paid'
    }),
    /Unsupported maintenance notification event/
  );
  assert.equal(called, false);
});

test('Phase 5: notification SQL insertion failure propagates to caller transaction', async () => {
  const transaction = { fixture: 'same transaction' };
  let writes = 0;
  const failure = new Error('Disposable SQL notification insertion failed');
  await assert.rejects(
    () => writeMaintenanceNotifications({
      transaction, tenantId: 'tenant-a', requestId: 'request-a',
      eventType: 'request_assigned', renteeId: 'rentee-a', assignedStaffId: 'worker-a',
      queryTransaction: async (received, sql) => {
        assert.equal(received, transaction);
        assert.match(sql, /INSERT INTO notifications/);
        writes += 1;
        throw failure;
      }
    }),
    error => error === failure
  );
  assert.equal(writes, 1, 'writer must not swallow SQL errors or retry outside the transaction');
});
