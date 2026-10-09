import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import express from 'express';

// Mandatory disposable Docker SQL Server; never use a preexisting/production endpoint.
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const connect = options => new sql.ConnectionPool({
  server: '127.0.0.1', port: options.port, database: options.database || 'master',
  user: 'sa', password: options.password, connectionTimeout: 10000, requestTimeout: 120000,
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 5, min: 0, idleTimeoutMillis: 5000 }
}).connect();
const query = async (pool, statement, inputs = {}) => {
  const request = pool.request();
  Object.entries(inputs).forEach(([key, value]) => request.input(key, value));
  return (await request.query(statement)).recordset || [];
};
const first = async (pool, statement, inputs = {}) => (await query(pool, statement, inputs))[0] || null;
const guid = value => String(value).toLowerCase();

async function fixture(pool, label, rent, water) {
  const suffix = crypto.randomBytes(6).toString('hex');
  const tenant = await first(pool,
    "INSERT INTO tenants (name, slug, status, [plan]) OUTPUT INSERTED.id VALUES (@name, @slug, 'active', 'test')",
    { name: label, slug: 'sqlbilling-' + suffix });
  const tenantId = guid(tenant.id);
  const property = await first(pool,
    "INSERT INTO properties (tenant_id, name, status) OUTPUT INSERTED.id VALUES (@tenantId, @name, 'available')",
    { tenantId, name: label + ' Property' });
  const propertyId = guid(property.id);
  const rentee = await first(pool,
    "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, @name, @email, 'rentee', 'rentee')",
    { tenantId, name: label + ' Rentee', email: 'sqlbilling-' + suffix + '@example.invalid' });
  const renteeId = guid(rentee.id);
  await query(pool,
    "INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default) VALUES (@tenantId, @renteeId, 'rentee', 'active', 1)",
    { tenantId, renteeId });
  const agreement = await first(pool,
    "INSERT INTO agreements (tenant_id, renteeid, propertyid, status, rentamount, startdate) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'active', @rent, '2026-01-01')",
    { tenantId, renteeId, propertyId, rent });
  const reading = await first(pool,
    "INSERT INTO utility_readings (tenant_id, renteeid, propertyid, utilitytype, readingdate, calculatedbill, status, billing_status) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'water', '2026-09-20', @water, 'approved', 'pending_invoice')",
    { tenantId, renteeId, propertyId, water });
  return { tenantId, propertyId, renteeId, agreementId: guid(agreement.id),
    readingId: guid(reading.id), expected: rent + water };
}

async function verify(pool, item) {
  const invoices = await query(pool,
    "SELECT * FROM invoices WHERE tenant_id = @tenantId AND agreementid = @agreementId AND billingperiod = '2026-10'", item);
  assert.equal(invoices.length, 1, 'exactly one invoice per agreement and period');
  const invoice = invoices[0];
  assert.equal(guid(invoice.tenant_id), item.tenantId);
  assert.equal(guid(invoice.propertyid), item.propertyId);
  assert.equal(guid(invoice.renteeid), item.renteeId);
  assert.equal(String(invoice.status), 'draft');
  assert.equal(Number(invoice.totalamount), item.expected);
  const reading = await first(pool,
    'SELECT * FROM utility_readings WHERE tenant_id = @tenantId AND id = @readingId', item);
  assert.equal(guid(reading.invoice_id), guid(invoice.id));
  assert.equal(guid(reading.propertyid), item.propertyId);
  assert.equal(reading.billing_status, 'invoiced');
  const components = await query(pool,
    'SELECT * FROM invoice_components WHERE tenant_id = @tenantId AND invoice_id = @invoiceId',
    { tenantId: item.tenantId, invoiceId: invoice.id });
  assert.equal(components.reduce((sum, row) => sum + Number(row.amount), 0), item.expected);
  assert.ok(components.some(row => row.component_type === 'rent'));
  assert.ok(components.some(row => row.component_type === 'water'));
  const events = await query(pool,
    'SELECT * FROM billing_lifecycle_events WHERE tenant_id = @tenantId AND invoice_id = @invoiceId',
    { tenantId: item.tenantId, invoiceId: invoice.id });
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'invoice_drafted');
  return guid(invoice.id);
}

async function main() {
  const name = 'khrental-billing-test-' + process.pid + '-' + Date.now();
  const password = 'SqlTest!' + crypto.randomBytes(18).toString('base64url') + '9a';
  const database = 'billingproof_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  let started = false, master, pool, closeMssqlPool, httpServer;
  try {
    docker(['run', '-d', '--name', name, '-e', 'ACCEPT_EULA=Y',
      '-e', 'MSSQL_PID=Developer', '-e', 'MSSQL_SA_PASSWORD=' + password,
      '-p', '127.0.0.1::1433',
      process.env.MSSQL_TEST_IMAGE || 'mcr.microsoft.com/mssql/server:2022-latest']);
    started = true;
    const published = docker(['port', name, '1433/tcp']);
    const match = published.match(/:(\d+)\s*$/);
    assert.ok(match, 'test SQL Server port must be published on loopback');
    const port = Number(match[1]);
    for (let attempt = 0; attempt < 45; attempt++) {
      try { master = await connect({ port, password }); break; }
      catch (err) { if (attempt === 44) throw err; await delay(2000); }
    }
    await master.request().query('CREATE DATABASE [' + database + ']');
    await master.close();
    master = null;
    pool = await connect({ port, password, database });
    for (const filename of [
      '20260913_00_create_fresh_mssql_schema.sql',
      '20260916_02_add_staff_permission_bundles.sql',
      '20260916_04_add_billing_payment_lifecycle.sql',
      '20260920_01_add_tenancy_billing_adjustments.sql',
      '20261005_01_add_property_utility_configs.sql'
    ]) {
      await pool.request().batch(fs.readFileSync(path.resolve('migrations', filename), 'utf8'));
    }

    process.env.MSSQL_SERVER = '127.0.0.1';
    process.env.MSSQL_PORT = String(port);
    process.env.MSSQL_DATABASE = database;
    process.env.MSSQL_USER = 'sa';
    process.env.MSSQL_PASSWORD = password;
    process.env.MSSQL_AUTHENTICATION = 'sql-password';
    process.env.MSSQL_ENCRYPT = 'false';
    process.env.MSSQL_TRUST_SERVER_CERTIFICATE = 'true';
    const { generateMonthlyInvoicesForTenant } = await import('../src/api/platform/monthlyBillingService.js');
    ({ closeMssqlPool } = await import('../src/api/mssql/pool.js'));
    const a = await fixture(pool, 'Tenant A', 2000, 125);
    const b = await fixture(pool, 'Tenant B', 3000, 225);
    const generate = tenantId => generateMonthlyInvoicesForTenant({
      tenantId, billingPeriod: '2026-10', source: 'test', authorizeProperty: () => {}
    });
    const resultA = await generate(a.tenantId);
    assert.deepEqual(resultA.errors, []);
    assert.equal(resultA.created.length, 1);
    const invoiceA = await verify(pool, a);

    const beforeB = await first(pool,
      'SELECT invoice_id, billing_status FROM utility_readings WHERE tenant_id = @tenantId AND id = @readingId', b);
    assert.equal(beforeB.invoice_id, null, 'tenant A must not invoice tenant B reading');
    assert.equal(beforeB.billing_status, 'pending_invoice');
    assert.equal((await query(pool, 'SELECT id FROM invoices WHERE tenant_id = @tenantId', b)).length, 0);
    const repeatA = await generate(a.tenantId);
    assert.equal(repeatA.created.length, 0);
    assert.ok(repeatA.skipped.some(row => row.reason === 'already_exists'));
    const foreignAgreement = await generateMonthlyInvoicesForTenant({
      tenantId: a.tenantId, billingPeriod: '2026-10', agreementId: b.agreementId,
      authorizeProperty: () => {}
    });
    assert.equal(foreignAgreement.created.length, 0);
    assert.deepEqual(foreignAgreement.errors, []);

    const resultB = await generate(b.tenantId);
    assert.deepEqual(resultB.errors, []);
    assert.equal(resultB.created.length, 1);
    const invoiceB = await verify(pool, b);
    assert.notEqual(invoiceA, invoiceB);
    const repeatB = await generate(b.tenantId);
    assert.equal(repeatB.created.length, 0);
    assert.ok(repeatB.skipped.some(row => row.reason === 'already_exists'));

    const { getInvoiceById, listInvoices } = await import('../src/api/mssql/repositories.js');
    assert.equal(await getInvoiceById(invoiceB, a.tenantId), null);
    assert.equal(await getInvoiceById(invoiceA, b.tenantId), null);
    assert.equal((await listInvoices({ tenantId: a.tenantId })).length, 1);
    assert.equal((await listInvoices({ tenantId: b.tenantId })).length, 1);
    assert.equal((await query(pool,
      'SELECT id FROM utility_readings WHERE tenant_id = @tenantId AND invoice_id = @invoiceId',
      { tenantId: a.tenantId, invoiceId: invoiceB })).length, 0);

    // Exercise real bearer sessions and actual HTTP routing over loopback,
    // never development identity headers or externally configured SQL.
    const { createAuthRecord, issueAuthSession, createSessionAuthMiddleware } =
      await import('../src/api/auth/index.js');
    const { createPlatformRouter } = await import('../src/api/platform/router.js');
    const { createMssqlRouter } = await import('../src/api/mssql/router.js');
    const { guardBillingMssqlCompatibility } =
      await import('../src/api/platform/billingMutationGuard.js');
    const auth = async item => {
      const record = await createAuthRecord({
        authId: crypto.randomUUID(),
        appUserId: item.renteeId,
        email: 'auth-' + crypto.randomUUID() + '@example.invalid',
        role: 'rentee',
        password: crypto.randomBytes(24).toString('base64url')
      });
      return (await issueAuthSession(record)).accessToken;
    };
    const tokenA = await auth(a);
    const tokenB = await auth(b);
    const app = express();
    app.use(express.json());
    app.use('/api', createSessionAuthMiddleware());
    app.use('/api/platform', createPlatformRouter());
    app.use('/api/mssql', guardBillingMssqlCompatibility, createMssqlRouter());
    app.use((err, req, res, next) => {
      res.status(Number(err?.status) || 500).json({
        error: err.message, code: err.code || null
      });
    });
    httpServer = await new Promise((resolve, reject) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
      server.once('error', reject);
    });
    const origin = 'http://127.0.0.1:' + httpServer.address().port;
    const call = async (path, { token, tenantId, method = 'GET', body } = {}) => {
      const response = await fetch(origin + path, {
        method,
        headers: {
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      return { status: response.status, payload: await response.json() };
    };
    const authContext = await call('/api/platform/auth/context', {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(authContext.status, 200, JSON.stringify(authContext));
    assert.equal(guid(authContext.payload.data.tenantId), a.tenantId);

    // SQL Server returns uppercase UUID strings in some drivers, while
    // clients may send lowercase or uppercase tenant selection headers.
    const upperContext = await call('/api/platform/auth/context', {
      token: tokenA, tenantId: a.tenantId.toUpperCase()
    });
    assert.equal(upperContext.status, 200, JSON.stringify(upperContext));
    assert.equal(guid(upperContext.payload.data.tenantId), a.tenantId);

    const forcedTenant = await call('/api/platform/auth/context', {
      token: tokenA, tenantId: b.tenantId
    });
    assert.equal(forcedTenant.status, 403);
    assert.equal(forcedTenant.payload.code, 'TENANT_ACCESS_DENIED');

    const unauthenticated = await call('/api/platform/query', {
      method: 'POST', tenantId: a.tenantId,
      body: { action: 'select', table: 'utility_readings' }
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.payload.code, 'AUTH_CONTEXT_REQUIRED');

    const pendingA = await call('/api/platform/query', {
      method: 'POST', token: tokenA, tenantId: a.tenantId,
      body: { action: 'select', table: 'utility_readings',
        filters: [{ column: 'propertyid', operator: 'eq', value: b.propertyId }] }
    });
    assert.equal(pendingA.status, 200, JSON.stringify(pendingA));
    assert.deepEqual(pendingA.payload.data, [], 'cross-property reading query must not expose B');

    const ownA = await call('/api/platform/query', {
      method: 'POST', token: tokenA, tenantId: a.tenantId,
      body: { action: 'select', table: 'utility_readings',
        filters: [{ column: 'id', operator: 'eq', value: a.readingId }] }
    });
    assert.equal(ownA.status, 200, JSON.stringify(ownA));
    assert.equal(ownA.payload.data.length, 1, 'A may read own reading');
    assert.equal(guid(ownA.payload.data[0].id), a.readingId);

    const foreignInvoice = await call('/api/mssql/invoices/' + invoiceB, {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(foreignInvoice.status, 404);

    const blockedWrite = await call('/api/mssql/invoices/' + invoiceA, {
      token: tokenA, tenantId: a.tenantId, method: 'PUT',
      body: { status: 'paid' }
    });
    assert.equal(blockedWrite.status, 409);
    assert.equal(blockedWrite.payload.code, 'BILLING_LIFECYCLE_REQUIRED');

    const ownB = await call('/api/platform/query', {
      method: 'POST', token: tokenB, tenantId: b.tenantId,
      body: { action: 'select', table: 'utility_readings',
        filters: [{ column: 'id', operator: 'eq', value: b.readingId }] }
    });
    assert.equal(ownB.status, 200, JSON.stringify(ownB));
    assert.equal(ownB.payload.data.length, 1);
    assert.equal(guid(ownB.payload.data[0].id), b.readingId);

    console.log('PASS: disposable two-tenant SQL Server invoice isolation, rent/utility totals, lifecycle events, correct reading linkage and duplicate prevention');
  } finally {
    if (httpServer) await new Promise(resolve => httpServer.close(resolve));
    if (closeMssqlPool) await closeMssqlPool().catch(() => {});
    if (pool) await pool.close().catch(() => {});
    if (master) await master.close().catch(() => {});
    if (started) { try { docker(['rm', '-f', name]); } catch {} }
  }
}
main().catch(error => {
  console.error('Two-tenant SQL Server billing acceptance FAILED:', error);
  process.exitCode = 1;
});
