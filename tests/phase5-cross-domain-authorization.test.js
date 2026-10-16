import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { authorizePlatformQuery, authorizePlatformRpc } from '../src/api/platform/authorization.js';
import {
  guardBillingPlatformQuery,
  guardBillingMssqlCompatibility
} from '../src/api/platform/billingMutationGuard.js';
import { buildMaintenanceListScope } from '../src/api/platform/maintenanceListScope.js';
import { markOwnNotificationRead } from '../src/api/platform/notificationAccess.js';
import { assertGenericAgreementWriteSafe } from '../src/api/mssql/agreementWritePolicy.js';

const actor = {
  admin: {
    user: { id: 'admin-a', role: 'admin' },
    membership: { tenant_id: 'tenant-a', role: 'admin', status: 'active' }
  },
  renter: {
    user: { id: 'renter-a', role: 'rentee' },
    membership: { tenant_id: 'tenant-a', role: 'rentee', status: 'active' }
  },
  manager: {
    user: { id: 'manager-a', role: 'manager' },
    membership: {
      tenant_id: 'tenant-a', role: 'manager', status: 'active',
      assignedPropertyIds: ['property-a'], assignedRenteeIds: ['renter-a']
    }
  },
  finance: {
    user: { id: 'finance-a', role: 'finance_staff' },
    membership: {
      tenant_id: 'tenant-a', role: 'finance_staff', status: 'active',
      assignedPropertyIds: ['property-a'], assignedRenteeIds: ['renter-a']
    }
  },
  worker: {
    user: { id: 'worker-a', role: 'maintenance_staff' },
    membership: {
      tenant_id: 'tenant-a', role: 'maintenance_staff', status: 'active',
      assignedPropertyIds: ['property-a']
    }
  }
};

const withGuardedHttp = async (run) => {
  const app = express();
  app.use(express.json());
  app.post('/platform/query', guardBillingPlatformQuery, (req, res) => {
    const subject = actor[req.headers['x-fixture-actor']];
    try {
      const result = authorizePlatformQuery({
        action: req.body.action,
        table: req.body.table,
        filters: req.body.filters || [],
        payload: req.body.payload,
        user: subject?.user,
        membership: subject?.membership
      });
      res.json({ allowed: true, result });
    } catch (error) {
      res.status(error.status || 500).json({ allowed: false, code: error.code });
    }
  });
  app.use('/legacy', guardBillingMssqlCompatibility, (_req, res) => {
    res.status(200).json({ allowed: true });
  });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const request = async (path, method = 'POST', body = null, role = 'admin') => {
      const response = await fetch(origin + path, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-fixture-actor': role
        },
        ...(body === null ? {} : { body: JSON.stringify(body) })
      });
      return { status: response.status, data: await response.json() };
    };
    await run(request);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
};

test('Phase 5 cross-domain: one platform route rejects generic billing, maintenance and comment bypasses', async () => {
  await withGuardedHttp(async request => {
    for (const [body, status, code] of [
      [{ action: 'update', table: 'invoices', payload: { status: 'paid' } }, 409, 'BILLING_LIFECYCLE_REQUIRED'],
      [{ action: 'insert', table: 'payments', payload: { amount: 100 } }, 409, 'BILLING_LIFECYCLE_REQUIRED'],
      [{ action: 'delete', table: 'payments', filters: [{ column: 'id', operator: 'eq', value: 'p' }] }, 409, 'BILLING_LIFECYCLE_REQUIRED'],
      [{ action: 'insert', table: 'maintenance_requests', payload: { title: 'Repair' } }, 409, 'MAINTENANCE_LIFECYCLE_REQUIRED'],
      [{ action: 'update', table: 'maintenance_requests', payload: { status: 'completed' } }, 409, 'MAINTENANCE_LIFECYCLE_REQUIRED'],
      [{ action: 'select', table: 'maintenance_request_comments' }, 409, 'MAINTENANCE_COMMENTS_LIFECYCLE_REQUIRED']
    ]) {
      const result = await request('/platform/query', 'POST', body);
      assert.equal(result.status, status, JSON.stringify(body));
      assert.equal(result.data.code, code);
      assert.equal(result.data.allowed, undefined, 'guard must stop before platform query');
    }
    const safe = await request('/platform/query', 'POST', { action: 'select', table: 'properties' });
    assert.equal(safe.status, 200);
    assert.equal(safe.data.allowed, true);
  });
});

test('Phase 5 cross-domain: legacy MSSQL billing writes remain blocked while reads pass through', async () => {
  await withGuardedHttp(async request => {
    for (const table of ['invoices', 'payments']) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const result = await request('/legacy/' + table + '/record-a', method, {});
        assert.equal(result.status, 409, table + ' ' + method);
        assert.equal(result.data.code, 'BILLING_LIFECYCLE_REQUIRED');
      }
      const read = await request('/legacy/' + table + '/record-a', 'GET');
      assert.deepEqual(read, { status: 200, data: { allowed: true } });
    }
  });
});

test('Phase 5 cross-domain: authenticated roles retain owned/assigned read scope and no privilege expansion', async () => {
  await withGuardedHttp(async request => {
    const renterInvoice = await request('/platform/query', 'POST',
      { action: 'select', table: 'invoices', filters: [{ column: 'id', operator: 'eq', value: 'invoice-a' }] },
      'renter');
    assert.equal(renterInvoice.status, 200);
    assert.ok(renterInvoice.data.result.filters.some(f =>
      f.column === 'renteeid' && f.operator === 'eq' && f.value === 'renter-a'));
    assert.ok(renterInvoice.data.result.filters.some(f =>
      f.column === 'status' && f.operator === 'neq' && f.value === 'draft'));

    const renterProperty = await request('/platform/query', 'POST', { action: 'select', table: 'properties' }, 'renter');
    assert.deepEqual(renterProperty.data.result.resourceScope, {
      kind: 'tenant-property', userId: 'renter-a'
    });

    for (const role of ['manager', 'finance']) {
      const invoice = await request('/platform/query', 'POST', { action: 'select', table: 'invoices' }, role);
      assert.equal(invoice.status, 200, role);
      assert.ok(invoice.data.result.filters.some(f =>
        f.column === 'propertyid' && f.operator === 'in'
        && f.value.length === 1 && f.value[0] === 'property-a'));
    }

    const workerInvoices = await request('/platform/query', 'POST',
      { action: 'select', table: 'invoices' }, 'worker');
    assert.equal(workerInvoices.status, 403);
    assert.equal(workerInvoices.data.code, 'PERMISSION_REQUIRED');

    const workerMaintenance = await request('/platform/query', 'POST',
      { action: 'select', table: 'maintenance_requests' }, 'worker');
    assert.equal(workerMaintenance.status, 200);
    assert.ok(workerMaintenance.data.result.filters.some(f =>
      f.column === 'assignedto' && f.value === 'worker-a'));

    const renterMutation = await request('/platform/query', 'POST',
      { action: 'delete', table: 'agreements', filters: [{ column: 'id', operator: 'eq', value: 'agreement-a' }] }, 'renter');
    assert.equal(renterMutation.status, 403);
    assert.equal(renterMutation.data.code, 'ACTION_ACCESS_DENIED');

    const noRole = await request('/platform/query', 'POST', { action: 'select', table: 'properties' }, 'unlinked');
    assert.equal(noRole.status, 403);
    assert.equal(noRole.data.code, 'ROLE_ACCESS_DENIED');
  });
});

test('Phase 5 cross-domain: unassigned managers and workers cannot expand maintenance list scope', () => {
  assert.equal(buildMaintenanceListScope({
    actorId: 'manager-a', canManage: true, assignedPropertyIds: []
  }).predicate, '1 = 0');
  const manager = buildMaintenanceListScope({
    actorId: 'manager-a', canManage: true, assignedPropertyIds: ['property-a']
  });
  assert.ok(manager.params.propertyScopeJson.includes('property-a'));
  const worker = buildMaintenanceListScope({ actorId: 'worker-a', canUpdateAssigned: true });
  assert.equal(worker.predicate, '(mr.assignedto = @actorId)');
  assert.deepEqual(worker.params, { actorId: 'worker-a' });
  assert.throws(() => buildMaintenanceListScope({ actorId: 'finance-a' }),
    error => error.status === 403 && error.code === 'RESOURCE_ACCESS_DENIED');
});

test('Phase 5 cross-domain: notification read marker uses the authenticated actor and tenant, never caller filters', async () => {
  const calls = [];
  await assert.rejects(() => markOwnNotificationRead({
    tenantId: 'tenant-a', userId: 'renter-a', notificationId: 'notification-b',
    queryOne: async (sql, params) => {
      calls.push({ sql, params });
      return null;
    }
  }), error => error.status === 404 && error.code === 'NOTIFICATION_NOT_FOUND');
  assert.deepEqual(calls[0].params, {
    tenantId: 'tenant-a', userId: 'renter-a', notificationId: 'notification-b'
  });
  assert.match(calls[0].sql, /WHERE tenant_id = @tenantId AND user_id = @userId AND id = @notificationId/);
});

test('Phase 5 cross-domain: generic agreement writes never fabricate signed evidence and raw SQL remains barred', () => {
  for (const payload of [
    { status: 'signed' },
    { signature_status: 'completed' },
    { signed_document_url: '/storage/documents/forged.pdf' },
    { signatories_status: [{ signed_at: '2026-10-16' }] }
  ]) {
    assert.throws(() => assertGenericAgreementWriteSafe(payload),
      error => error.status === 409 && error.code === 'AGREEMENT_SIGNING_AUTHORITY_REQUIRED');
  }
  for (const subject of Object.values(actor)) {
    assert.throws(() => authorizePlatformRpc({ name: 'exec_sql', ...subject }),
      error => error.status === 403 && error.code === 'RPC_BLOCKED');
  }
});
