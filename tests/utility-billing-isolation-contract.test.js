import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizePlatformQuery } from '../src/api/platform/authorization.js';
import { isProtectedBillingMutation } from '../src/api/platform/billingMutationGuard.js';

const tenant = { id: 'rentee-1', role: 'rentee' };
const membership = {
  tenant_id: 'tenant-a',
  role: 'rentee',
  status: 'active'
};

test('pending utility-reading query always includes owner filter for rentee even with another user filter', () => {
  const result = authorizePlatformQuery({
    action: 'select',
    table: 'utility_readings',
    user: tenant,
    membership,
    filters: [
      { column: 'renteeid', operator: 'eq', value: 'rentee-other' },
      { column: 'billing_status', operator: 'eq', value: 'pending_invoice' },
      { column: 'invoice_id', operator: 'is', value: null }
    ]
  });
  assert.ok(result.filters.some(f => f.column === 'renteeid' && f.operator === 'eq' && f.value === tenant.id));
  assert.ok(result.filters.some(f => f.column === 'billing_status' && f.value === 'pending_invoice'));
  assert.ok(result.filters.some(f => f.column === 'invoice_id' && f.operator === 'is'));
});

test('tenant cannot mutate invoiced utility readings through generic update', () => {
  assert.throws(
    () => authorizePlatformQuery({
      action: 'update',
      table: 'utility_readings',
      user: tenant,
      membership,
      filters: [{ column: 'id', operator: 'eq', value: 'reading-1' }],
      payload: { invoice_id: 'invoice-elsewhere', billing_status: 'invoiced' }
    }),
    error => error?.status === 403
  );
});

test('invoice and payment generic mutations remain reserved for lifecycle', () => {
  for (const table of ['invoices', 'payments']) {
    for (const action of ['insert', 'update', 'upsert', 'delete']) {
      assert.equal(isProtectedBillingMutation({ table, action }), true);
    }
  }
});

test('pending dashboard uses canonical scoped platform-read API and stable pagination', () => {
  const service = readFileSync(new URL('../src/services/invoiceService.js', import.meta.url), 'utf8');
  const start = service.indexOf('export async function getPropertiesWithPendingReadings');
  const end = service.indexOf('export const getInvoicesByProperty', start);
  assert.ok(start !== -1 && end > start);
  const pending = service.slice(start, end);
  assert.match(pending, /platformClient[\s\S]*?\.from\('utility_readings'\)/);
  assert.match(pending, /\.select\('id, propertyid'\)/);
  assert.match(pending, /\.eq\('billing_status', 'pending_invoice'\)/);
  assert.match(pending, /\.is\('invoice_id', null\)/);
  assert.match(pending, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(pending, /\.range\(page \* pageSize, \(page \+ 1\) \* pageSize - 1\)/);
});

test('monthly invoice generator retains tenant-specific transactional reading linkage', () => {
  const source = readFileSync(new URL('../src/api/platform/monthlyBillingService.js', import.meta.url), 'utf8');
  assert.match(source, /FROM utility_readings WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(source, /WHERE tenant_id = @tenantId/);
  assert.match(source, /invoice_id IS NULL/);
  assert.match(source, /billing_status = 'pending_invoice'/);
  assert.match(source, /UPDATE utility_readings[\s\S]*?WHERE tenant_id = @tenantId/);
});
