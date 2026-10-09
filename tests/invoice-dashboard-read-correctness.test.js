import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const invoiceService = readFileSync(new URL('../src/services/invoiceService.js', import.meta.url), 'utf8');
const summary = invoiceService.slice(
  invoiceService.indexOf('export async function getInvoiceSummaryByProperty'),
  invoiceService.indexOf('export async function getPropertiesWithPendingReadings')
);
const pending = invoiceService.slice(
  invoiceService.indexOf('export async function getPropertiesWithPendingReadings'),
  invoiceService.indexOf('export const getInvoicesByProperty')
);

test('dashboard totals iterate paginated tenant-scoped invoice-list endpoint to completion', () => {
  assert.match(summary, /propertyId,\s*status: options\.status/);
  assert.match(summary, /page,\s*pageSize/);
  assert.match(summary, /invoices\.push\(\.\.\.data\)/);
  assert.match(summary, /if \(data\.length < pageSize\) break/);
  assert.match(summary, /if \(error\) throw error/);
  assert.match(summary, /if \(!Array\.isArray\(data\)\)/);
  assert.match(summary, /pagination limit/);
  assert.doesNotMatch(summary, /pageSize:\s*1000/);
});

test('pending readings dashboard counts from scoped pending reading set, not N+1 queries', () => {
  assert.match(pending, /\.eq\('billing_status', 'pending_invoice'\)/);
  assert.match(pending, /\.is\('invoice_id', null\)/);
  assert.match(pending, /for \(const reading of propertiesData\)/);
  assert.match(pending, /counts\[reading\.property_id\] = \(counts\[reading\.property_id\] \|\| 0\) \+ 1/);
  assert.match(pending, /pendingReadingsCount: counts\[property\.id\] \|\| 0/);
  assert.doesNotMatch(pending, /countError/);
  assert.equal((pending.match(/\.from\('utility_readings'\)/g) || []).length, 1);
});

test('dashboard read changes do not modify invoice mutation guards', () => {
  const guard = readFileSync(new URL('../src/api/platform/billingMutationGuard.js', import.meta.url), 'utf8');
  assert.match(guard, /BILLING_LIFECYCLE_REQUIRED/);
  assert.match(guard, /guardBillingMssqlCompatibility/);
  assert.match(invoiceService, /export const createInvoiceRecord[\s\S]*?throw billingLifecycleRequired\(\)/);
  assert.match(invoiceService, /export const updateInvoiceRecord[\s\S]*?throw billingLifecycleRequired\(\)/);
});
