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
