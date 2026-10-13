import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guardBillingMssqlCompatibility, guardBillingPlatformQuery } from '../src/api/platform/billingMutationGuard.js';

const service = readFileSync(new URL('../src/services/invoiceService.js', import.meta.url), 'utf8');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('MSSQL invoice-list failures do not silently fall back to another transport', () => {
  const list = service.slice(service.indexOf('export const listInvoices ='), service.indexOf('export const createInvoiceRecord ='));
  assert.match(list, /catch \(mssqlError\)[\s\S]*?return \{ data: null, error: mssqlError \}/);
  assert.doesNotMatch(list, /falling back to the local compatibility layer/);
});

test('legacy invoice record mutation exports are fail-closed and do not write through compatibility', () => {
  const start = service.indexOf('export const createInvoiceRecord =');
  const end = service.indexOf('Fetch utility readings ready for invoicing', start);
  const mutations = service.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(mutations, /createInvoiceRecord[\s\S]*?throw billingLifecycleRequired\(\)/);
  assert.match(mutations, /updateInvoiceRecord[\s\S]*?throw billingLifecycleRequired\(\)/);
  assert.doesNotMatch(mutations, /\.from\(['"]invoices['"]\)/);
  assert.doesNotMatch(mutations, /requestMssqlApi\(/);
  assert.match(service, /error\.code = 'BILLING_LIFECYCLE_REQUIRED'/);
  assert.match(service, /error\.status = 409/);
});

test('MSSQL compatibility mutation guard blocks invoice POST/PUT but permits GET', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = response();
    let next = false;
    guardBillingMssqlCompatibility({ method, path: '/invoices/test-id' }, res, () => { next = true; });
    assert.equal(next, false, method);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.code, 'BILLING_LIFECYCLE_REQUIRED');
  }
  const res = response();
  let passed = false;
  guardBillingMssqlCompatibility({ method: 'GET', path: '/invoices' }, res, () => { passed = true; });
  assert.equal(passed, true);
});

test('generic platform invoice mutations remain prohibited', () => {
  const res = response();
  let passed = false;
  guardBillingPlatformQuery({ body: { table: 'invoices', action: 'insert' } }, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.code, 'BILLING_LIFECYCLE_REQUIRED');
});

test('legacy invoice list enforces owner and draft constraints inside SQL before pagination', () => {
  const repository = readFileSync(new URL('../src/api/mssql/repositories.js', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../src/api/mssql/router.js', import.meta.url), 'utf8');
  const list = repository.slice(repository.indexOf('export const listInvoices ='), repository.indexOf('export const getInvoiceById ='));
  const handler = route.slice(route.indexOf("router.get('/invoices'"), route.indexOf("router.get('/invoices/:id'"));
  assert.ok(list.includes("filters.push('renteeid = @viewerRenteeId')"));
  assert.ok(list.includes('params.viewerRenteeId = viewerRenteeId'));
  assert.ok(list.includes('LOWER(status)'));
  assert.ok(list.includes("draft"));
  assert.ok(list.indexOf('viewerRenteeId !== null') < list.indexOf('paginateQuery('));
  assert.ok(handler.includes('viewerRenteeId: renterView ? req.user.id : null'));
  assert.ok(handler.includes('excludeDrafts: renterView'));
  assert.ok(!handler.includes('invoices.filter('));
});
test('renter invoice detail denies another renter with indistinguishable 404', () => {
  const route = readFileSync(new URL('../src/api/mssql/router.js', import.meta.url), 'utf8');
  const start = route.indexOf("router.get('/invoices/:id'");
  const handler = route.slice(start, route.indexOf('router.', start + 1));
  assert.ok(handler.includes('invoice.renteeid'));
  assert.ok(handler.includes('req.user?.id'));
  assert.ok(handler.includes('res.status(404)'));
});

test('invoice MSSQL read filters statuses before SQL pagination and allowlists stable sort', () => {
  const repo = readFileSync(new URL('../src/api/mssql/repositories.js', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../src/api/mssql/router.js', import.meta.url), 'utf8');
  const list = repo.slice(repo.indexOf('export const listInvoices ='), repo.indexOf('export const getInvoiceById ='));
  assert.match(list, /Array\.isArray\(status\)/);
  assert.match(list, /status IN \(/);
  assert.match(list, /allowedSort/);
  assert.match(list, /id ASC/);
  assert.match(list, /viewerRenteeId !== null/);
  assert.match(list, /excludeDrafts/);
  assert.match(route, /sortBy: req\.query\.sortBy/);
  assert.match(route, /sortOrder: req\.query\.sortOrder/);
});

test('invoice client sends repeated statuses and explicit sort for MSSQL reads', () => {
  const list = service.slice(service.indexOf('const buildInvoiceQuery'), service.indexOf('export const createInvoiceRecord'));
  assert.match(list, /query\.append\('status', status\)/);
  assert.match(list, /query\.set\('sortBy', options\.sortBy\)/);
  assert.match(list, /query\.set\('sortOrder', options\.sortOrder\)/);
  assert.match(list, /options\.status\.length === 0/);
});
