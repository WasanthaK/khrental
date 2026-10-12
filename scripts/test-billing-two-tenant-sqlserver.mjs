import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import express from 'express';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';

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
  return { tenantId, propertyId, renteeId, email: 'sqlbilling-' + suffix + '@example.invalid', agreementId: guid(agreement.id),
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

// Seed synthetic payment history directly into the disposable fixture only.
// This proves authenticated account/receipt READ behavior, not payment creation.
async function seedAccountHistory(pool, item, invoiceId, tag, verifiedAmount, pendingAmount) {
  const verified = await first(pool,
    `INSERT INTO payments
       (tenant_id, invoiceid, propertyid, renteeid, amount, paymentmethod,
        transactionreference, paymentdate, status)
     OUTPUT INSERTED.id
     VALUES (@tenantId, @invoiceId, @propertyId, @renteeId, @amount,
             'bank_transfer', @reference, '2026-10-05', 'verified')`,
    { tenantId: item.tenantId, invoiceId, propertyId: item.propertyId,
      renteeId: item.renteeId, amount: verifiedAmount,
      reference: 'FIXTURE-' + tag + '-VERIFIED' });
  await query(pool,
    `INSERT INTO payments
       (tenant_id, invoiceid, propertyid, renteeid, amount,
        paymentmethod, transactionreference, paymentdate, status)
     VALUES (@tenantId, @invoiceId, @propertyId, @renteeId, @amount,
             'bank_transfer', @reference, '2026-10-06', 'pending')`,
    { tenantId: item.tenantId, invoiceId, propertyId: item.propertyId,
      renteeId: item.renteeId, amount: pendingAmount,
      reference: 'FIXTURE-' + tag + '-PENDING' });
  item.receiptNumber = 'TEST-RECEIPT-' + tag;
  item.outstanding = item.expected - verifiedAmount;
  item.verifiedAmount = verifiedAmount;
  item.pendingAmount = pendingAmount;
  await query(pool,
    `INSERT INTO payment_receipts
       (tenant_id, invoice_id, payment_id, receipt_number, amount)
     VALUES (@tenantId, @invoiceId, @paymentId, @receiptNumber, @amount)`,
    { tenantId: item.tenantId, invoiceId, paymentId: verified.id,
      receiptNumber: item.receiptNumber, amount: verifiedAmount });
}

async function main() {
  const name = 'khrental-billing-test-' + process.pid + '-' + Date.now();
  const password = 'SqlTest!' + crypto.randomBytes(18).toString('base64url') + '9a';
  const database = 'billingproof_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  let started = false, master, pool, closeMssqlPool, httpServer, browser, vite;
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
    const { createBillingRouter } = await import('../src/api/platform/billingRouter.js');
    const { createMssqlRouter } = await import('../src/api/mssql/router.js');
    const { guardBillingMssqlCompatibility } =
      await import('../src/api/platform/billingMutationGuard.js');
    const auth = async item => {
      // Reproduce the real auth identity -> app_users profile relationship.
      // An authenticated browser must resolve profileId via the server, not a
      // fabricated browser-local ID or a development bypass.
      const authId = crypto.randomUUID();
      const record = await createAuthRecord({
        authId,
        appUserId: item.renteeId,
        email: item.email,
        role: 'rentee',
        password: crypto.randomBytes(24).toString('base64url')
      });
      const linked = await query(pool,
        'UPDATE app_users SET auth_id = @authId OUTPUT INSERTED.id WHERE tenant_id = @tenantId AND id = @renteeId',
        { authId, tenantId: item.tenantId, renteeId: item.renteeId });
      assert.equal(linked.length, 1, 'disposable renter must link to its real auth identity');
      item.authId = authId;
      return (await issueAuthSession(record)).accessToken;
    };
    const tokenA = await auth(a);
    const tokenB = await auth(b);
    const app = express();
    app.use(express.json());
    app.use('/api', createSessionAuthMiddleware());
    app.use('/api/platform', createPlatformRouter());
    app.use('/api/billing', createBillingRouter());
    app.use('/api/mssql', guardBillingMssqlCompatibility, createMssqlRouter());
    // Serve the real React application through Vite middleware on the same
    // loopback origin as the fixture API; no dev-bypass headers or production.
    delete process.env.VITE_ENABLE_DEV_BYPASS;
    vite = await createViteServer({
      plugins: [react()],
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
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


    // Billing generator intentionally drafts invoices; the renter invoice list
    // intentionally hides drafts. Promote only disposable fixture rows to the
    // legacy visible "pending" state to test the actual renter-facing display.
    await query(pool,
      "UPDATE invoices SET status = 'pending' WHERE id IN (@invoiceA, @invoiceB)",
      { invoiceA, invoiceB });
    // Only the isolated Docker test database receives these synthetic records.
    await seedAccountHistory(pool, a, invoiceA, 'A', 500, 125);
    await seedAccountHistory(pool, b, invoiceB, 'B', 750, 150);

    // Audit that browser navigation and account GET calls never create, settle,
    // update, or verify payments, receipts, invoice states, or lifecycle events.
    const readOnlySnapshot = async () => ({
      invoices: (await query(pool,
        'SELECT id, status, totalamount FROM invoices ORDER BY id'))
        .map(row => ({ id: guid(row.id), status: row.status, amount: Number(row.totalamount) })),
      paymentCount: Number((await first(pool, 'SELECT COUNT(*) AS n FROM payments')).n),
      receiptCount: Number((await first(pool, 'SELECT COUNT(*) AS n FROM payment_receipts')).n),
      eventCount: Number((await first(pool, 'SELECT COUNT(*) AS n FROM billing_lifecycle_events')).n)
    });
    const beforeAccountReads = await readOnlySnapshot();
    assert.equal(beforeAccountReads.paymentCount, 4);
    assert.equal(beforeAccountReads.receiptCount, 2);
    assert.equal(beforeAccountReads.eventCount, 2);

    // Verify the same authorized projection used by the React invoice screen.
    // This differentiates missing API data from a browser/profile rendering defect.
    for (const item of [a, b]) {
      const ownToken = item.tenantId === a.tenantId ? tokenA : tokenB;
      const ownProperty = item.tenantId === a.tenantId ? 'Tenant A Property' : 'Tenant B Property';
      const ownInvoiceQuery = await call('/api/platform/query', {
        token: ownToken, tenantId: item.tenantId, method: 'POST',
        body: {
          action: 'select', table: 'invoices',
          select: '*, properties!propertyid(id, name, address)',
          filters: [{ column: 'renteeid', operator: 'eq', value: item.renteeId }],
          order: [{ column: 'createdat', ascending: false }]
        }
      });
      assert.equal(ownInvoiceQuery.status, 200, JSON.stringify(ownInvoiceQuery));
      assert.equal(ownInvoiceQuery.payload.data?.length, 1,
        'tenant must receive exactly its own invoice from the authenticated API');
      assert.equal(ownInvoiceQuery.payload.data[0]?.properties?.name, ownProperty,
        'tenant-scoped invoice API must resolve its own property relationship');
      assert.equal(Number(ownInvoiceQuery.payload.data[0].totalamount), item.expected);
    }
    // Exercise real dedicated billing GET authority with genuine tenant sessions.
    for (const [ownItem, ownToken, ownInvoice, foreignItem, foreignInvoiceId] of [
      [a, tokenA, invoiceA, b, invoiceB],
      [b, tokenB, invoiceB, a, invoiceA]
    ]) {
      const response = await call('/api/billing/invoices/' + ownInvoice + '/account', {
        token: ownToken, tenantId: ownItem.tenantId
      });
      assert.equal(response.status, 200, JSON.stringify(response));
      const account = response.payload.data;
      assert.equal(guid(account.invoice.id), ownInvoice);
      assert.equal(guid(account.invoice.renteeid), ownItem.renteeId);
      assert.equal(Number(account.invoice.totalamount), ownItem.expected);
      assert.equal(Number(account.outstandingBalance), ownItem.outstanding,
        'pending payment must not reduce outstanding balance');
      assert.equal(account.payments.length, 2);
      assert.deepEqual(new Set(account.payments.map(p => p.status)), new Set(['verified', 'pending']));
      assert.equal(account.receipts.length, 1);
      assert.equal(account.receipts[0].receipt_number, ownItem.receiptNumber);
      assert.equal(Number(account.receipts[0].amount), ownItem.verifiedAmount);
      assert.equal(account.components.reduce((sum, row) => sum + Number(row.amount), 0), ownItem.expected);
      const foreign = await call('/api/billing/invoices/' + foreignInvoiceId + '/account', {
        token: ownToken, tenantId: ownItem.tenantId
      });
      assert.equal(foreign.status, 404, 'billing account lookup must hide foreign tenant invoices');
      assert.equal(foreign.payload.code, 'INVOICE_NOT_FOUND');
      assert.notEqual(ownItem.receiptNumber, foreignItem.receiptNumber);
    }
    const anonymousAccount = await call('/api/billing/invoices/' + invoiceA + '/account', {
      tenantId: a.tenantId
    });
    assert.equal(anonymousAccount.status, 401, 'anonymous billing account query must be denied');

    browser = await puppeteer.launch({
      headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const browserVisit = async (item, token, route, { visibleInvoice = false } = {}) => {
      const page = await browser.newPage();
      try {
        await page.evaluateOnNewDocument((sessionToken, tenantId, authId, email) => {
          localStorage.removeItem('dev_bypass_role');
          localStorage.setItem('khrental.activeTenantId', tenantId);
          localStorage.setItem('khrental.local.session', JSON.stringify({
            access_token: sessionToken,
            user: { id: authId, email, role: 'rentee' }
          }));
        }, token, item.tenantId, item.authId, item.email);
        await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForFunction(() => (
          !document.body.innerText.includes('Loading application...')
          && document.body.innerText.trim().length > 0
        ), { timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        const state = await page.evaluate(() => ({
          path: window.location.pathname, text: document.body.innerText.slice(0, 12000)
        }));
        // Only disposable fixture content is included in a failure; no bearer tokens.
        const browserEvidence = 'Path: ' + state.path + '\\nPage: ' + state.text.slice(-3000);
        assert.notEqual(state.path, '/login', 'valid fixture session must not bounce to login; ' + browserEvidence);
        assert.notEqual(state.path, '/unauthorized', 'valid rentee session must reach its portal');
        assert.ok(state.path.startsWith('/rentee/'), 'tenant portal route must be preserved');
        const ownProperty = item.tenantId === a.tenantId ? 'Tenant A Property' : 'Tenant B Property';
        const foreignProperty = item.tenantId === a.tenantId ? 'Tenant B Property' : 'Tenant A Property';
        assert.doesNotMatch(state.text, new RegExp(foreignProperty),
          'rentee-facing browser must not leak another tenant property');
        if (visibleInvoice) {
          assert.match(state.text, /My Invoices/, 'actual renter invoice screen must load');
          assert.match(state.text, new RegExp(ownProperty), 'own property must be visible on invoice; ' + browserEvidence);
          assert.match(state.text, new RegExp(item.expected.toLocaleString('en-US')),
            'the tenant-specific invoice total must be visible');
          assert.doesNotMatch(state.text, /No invoices found\./,
            'visible test invoice must not be silently omitted');

          // Click only the READ-only Account & Receipts button. Never submit
          // a payment proof or invoke a billing/payment mutation from the browser.
          await page.evaluate(() => {
            const button = [...document.querySelectorAll('button')]
              .find(entry => entry.textContent.trim() === 'Account & Receipts');
            if (!button) throw new Error('Account & Receipts read button is missing');
            button.click();
          });
          await page.waitForFunction(
            receiptNumber => document.body.innerText.includes(receiptNumber),
            { timeout: 30000 }, item.receiptNumber
          );
          const accountText = await page.evaluate(() => document.body.innerText);
          assert.match(accountText, /Invoice Account/);
          assert.match(accountText, /Payments/);
          assert.match(accountText, /Receipts/);
          assert.match(accountText, new RegExp(item.receiptNumber));
          assert.match(accountText, new RegExp(item.outstanding.toLocaleString('en-US')),
            'actual browser account view must show verified-payment outstanding balance');
          assert.match(accountText, /FIXTURE-[AB]-VERIFIED/,
            'real account view must show the verified transaction reference');
          const foreignReceipt = item.tenantId === a.tenantId ? b.receiptNumber : a.receiptNumber;
          assert.doesNotMatch(accountText, new RegExp(foreignReceipt),
            'foreign tenant receipt must never be rendered');
        }
      } finally { await page.close(); }
    };
    await browserVisit(a, tokenA, '/rentee/utilities/history');
    await browserVisit(b, tokenB, '/rentee/utilities/history');
    await browserVisit(a, tokenA, '/rentee/invoices', { visibleInvoice: true });
    await browserVisit(b, tokenB, '/rentee/invoices', { visibleInvoice: true });
    assert.deepEqual(await readOnlySnapshot(), beforeAccountReads,
      'account and receipt views must not mutate invoice/payment/receipt/lifecycle data');

    // One global app_users identity with active memberships in both A and B.
    // Keep the original independent renter sessions above as a separate guard.
    const sharedEmail = 'shared-renter-' + crypto.randomBytes(6).toString('hex') + '@example.invalid';
    const sharedRecord = await first(pool,
      "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, 'Shared Test Renter', @email, 'rentee', 'rentee')",
      { tenantId: a.tenantId, email: sharedEmail });
    const sharedId = guid(sharedRecord.id);
    const shared = { renteeId: sharedId, tenantId: a.tenantId, email: sharedEmail };
    const scopedShared = [];
    for (const [item, suffix, total, verified] of [
      [a, 'A', 1300, 300],
      [b, 'B', 2500, 700]
    ]) {
      await query(pool,
        "INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default) VALUES (@tenantId, @renteeId, 'rentee', 'active', @default)",
        { tenantId: item.tenantId, renteeId: sharedId, default: suffix === 'A' ? 1 : 0 });
      const agreement = await first(pool,
        "INSERT INTO agreements (tenant_id, renteeid, propertyid, status, rentamount, startdate) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'active', @amount, '2026-01-01')",
        { tenantId: item.tenantId, renteeId: sharedId, propertyId: item.propertyId, amount: total });
      const invoice = await first(pool,
        "INSERT INTO invoices (tenant_id, renteeid, propertyid, agreementid, status, totalamount, billingperiod) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, @agreementId, 'pending', @amount, '2026-09')",
        { tenantId: item.tenantId, renteeId: sharedId, propertyId: item.propertyId,
          agreementId: agreement.id, amount: total });
      const invoiceId = guid(invoice.id);
      await query(pool,
        "INSERT INTO invoice_components (tenant_id, invoice_id, component_type, description, amount) VALUES (@tenantId, @invoiceId, 'rent', 'Disposable fixture rent', @amount)",
        { tenantId: item.tenantId, invoiceId, amount: total });
      const record = { tenantId: item.tenantId, renteeId: sharedId,
        propertyId: item.propertyId, expected: total, invoiceId,
        propertyName: suffix === 'A' ? 'Tenant A Property' : 'Tenant B Property' };
      await seedAccountHistory(pool, record, invoiceId, 'SWITCH-' + suffix, verified, 50);
      scopedShared.push(record);
    }
    const [sharedA, sharedB] = scopedShared;
    const sharedToken = await auth(shared);
    assert.equal(shared.authId !== null, true);

    const distinctGlobalUsers = await query(pool, 'SELECT id, email FROM app_users WHERE email = @email',
      { email: sharedEmail });
    assert.equal(distinctGlobalUsers.length, 1, 'switching must preserve a single global app_users identity');
    assert.equal(guid(distinctGlobalUsers[0].id), sharedId);
    const sharedMemberships = await query(pool,
      "SELECT tenant_id FROM tenant_memberships WHERE app_user_id = @renteeId AND status = 'active'",
      { renteeId: sharedId });
    assert.deepEqual(
      new Set(sharedMemberships.map(row => guid(row.tenant_id))),
      new Set([a.tenantId, b.tenantId]),
      'same global user must have two active tenant memberships'
    );
    const nonMemberTenant = await first(pool,
      "INSERT INTO tenants (name, slug, status, [plan]) OUTPUT INSERTED.id VALUES ('Unentitled Fixture Tenant', @slug, 'active', 'test')",
      { slug: 'unentitled-' + crypto.randomBytes(5).toString('hex') });
    const deniedSelection = await call('/api/platform/auth/context', {
      token: sharedToken, tenantId: guid(nonMemberTenant.id)
    });
    assert.equal(deniedSelection.status, 403);
    assert.equal(deniedSelection.payload.code, 'TENANT_ACCESS_DENIED');

    // One bearer token remains valid across authorized selections but all data
    // access must be scoped by the requested and verified active membership.
    for (const [own, foreign] of [[sharedA, sharedB], [sharedB, sharedA], [sharedA, sharedB]]) {
      const context = await call('/api/platform/auth/context', {
        token: sharedToken, tenantId: own.tenantId
      });
      assert.equal(context.status, 200, JSON.stringify(context));
      assert.equal(guid(context.payload.data.user.id), sharedId);
      assert.equal(guid(context.payload.data.tenantId), own.tenantId);
      assert.equal(context.payload.data.memberships.length, 2);
      const projection = await call('/api/platform/query', {
        token: sharedToken, tenantId: own.tenantId, method: 'POST',
        body: {
          action: 'select', table: 'invoices',
          select: '*, properties!propertyid(id, name, address)',
          filters: [{ column: 'renteeid', operator: 'eq', value: sharedId }]
        }
      });
      assert.equal(projection.status, 200, JSON.stringify(projection));
      assert.equal(projection.payload.data.length, 1, 'only the selected tenant invoice is visible');
      assert.equal(guid(projection.payload.data[0].id), own.invoiceId);
      assert.equal(projection.payload.data[0].properties?.name, own.propertyName);
      const ownAccount = await call('/api/billing/invoices/' + own.invoiceId + '/account', {
        token: sharedToken, tenantId: own.tenantId
      });
      assert.equal(ownAccount.status, 200, JSON.stringify(ownAccount));
      assert.equal(Number(ownAccount.payload.data.outstandingBalance), own.outstanding);
      assert.equal(ownAccount.payload.data.receipts[0].receipt_number, own.receiptNumber);
      const hiddenAccount = await call('/api/billing/invoices/' + foreign.invoiceId + '/account', {
        token: sharedToken, tenantId: own.tenantId
      });
      assert.equal(hiddenAccount.status, 404, 'shared identity does not bypass tenant invoice scope');
    }

    const beforeTenantSwitch = await readOnlySnapshot();
    const switchPage = await browser.newPage();
    try {
      await switchPage.evaluateOnNewDocument((token, tenantId, authId, email) => {
        localStorage.removeItem('dev_bypass_role');
        localStorage.setItem('khrental.activeTenantId', tenantId);
        localStorage.setItem('khrental.local.session', JSON.stringify({
          access_token: token,
          user: { id: authId, email, role: 'rentee' }
        }));
      }, sharedToken, a.tenantId, shared.authId, sharedEmail);
      await switchPage.goto(origin + '/rentee/invoices',
        { waitUntil: 'domcontentloaded', timeout: 45000 });

      const assertScopedBrowser = async (own, foreign) => {
        await switchPage.waitForFunction(
          ({ property, other }) => {
            const body = document.body.innerText;
            return body.includes('My Invoices') && body.includes(property)
              && !body.includes(other) && !body.includes('Loading your invoices...');
          },
          { timeout: 30000 },
          { property: own.propertyName, other: foreign.propertyName }
        );
        const beforeClick = await switchPage.evaluate(() => ({
          path: location.pathname, content: document.body.innerText,
          activeTenant: localStorage.getItem('khrental.activeTenantId'),
          sessionId: JSON.parse(localStorage.getItem('khrental.local.session') || '{}')?.user?.id
        }));
        assert.equal(beforeClick.path, '/rentee/invoices');
        assert.equal(guid(beforeClick.activeTenant), own.tenantId);
        assert.equal(guid(beforeClick.sessionId), shared.authId,
          'tenant switching must never replace the global auth identity');
        assert.match(beforeClick.content, new RegExp(own.expected.toLocaleString('en-US')));
        assert.doesNotMatch(beforeClick.content, new RegExp(foreign.propertyName));
        await switchPage.evaluate(() => {
          const button = [...document.querySelectorAll('button')]
            .find(entry => entry.textContent.trim() === 'Account & Receipts');
          if (!button) throw new Error('Missing read-only account button');
          button.click();
        });
        await switchPage.waitForFunction(
          receipt => document.body.innerText.includes(receipt),
          { timeout: 30000 }, own.receiptNumber
        );
        const opened = await switchPage.evaluate(() => document.body.innerText);
        assert.match(opened, /Invoice Account/);
        assert.match(opened, new RegExp(own.receiptNumber));
        assert.match(opened, new RegExp(own.outstanding.toLocaleString('en-US')));
        assert.doesNotMatch(opened, new RegExp(foreign.receiptNumber));
        await switchPage.evaluate(() => {
          const closeButton = [...document.querySelectorAll('button')]
            .find(entry => entry.textContent.trim() === 'Close');
          if (!closeButton) throw new Error('Cannot close account read-only view');
          closeButton.click();
        });
        await switchPage.waitForFunction(
          () => !document.body.innerText.includes('Invoice Account'),
          { timeout: 15000 }
        );
      };
      await assertScopedBrowser(sharedA, sharedB);

      // Interact with the actual React tenant selector rather than editing
      // localStorage or bypassing the application's switchTenant() flow.
      for (const [next, foreign] of [[sharedB, sharedA], [sharedA, sharedB]]) {
        await switchPage.waitForFunction(
          ({ first, second }) => [...document.querySelectorAll('header select')].some(select => (
            [...select.options].some(option => option.value.toLowerCase() === first)
            && [...select.options].some(option => option.value.toLowerCase() === second)
          )),
          { timeout: 30000 }, { first: a.tenantId, second: b.tenantId }
        );
        const optionValue = await switchPage.evaluate(wanted => {
          const selector = document.querySelector('header.hidden select');
          return [...selector.options].find(option => option.value.toLowerCase() === wanted)?.value || null;
        }, next.tenantId);
        assert.ok(optionValue, 'authorized tenant must be selectable');
        await switchPage.select('header.hidden select', optionValue);
        await assertScopedBrowser(next, foreign);
      }
    } finally {
      await switchPage.close();
    }
    assert.deepEqual(await readOnlySnapshot(), beforeTenantSwitch,
      'actual A-B-A tenant switches and account reads must not write billing data');

    console.log('PASS: disposable two-tenant SQL Server invoice and account/receipt read isolation, verified-only outstanding balances, non-mutating browser interaction and lifecycle contracts');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (vite) await vite.close().catch(() => {});
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
