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

test('pending readings dashboard uses the explicit scoped read client and preserves counts', () => {
  assert.match(pending, /listPendingInvoiceReadingPage\(page, pageSize\)/);
  assert.match(pending, /listPendingInvoiceProperties\(propertyIds\)/);
  assert.match(pending, /for \(const reading of propertiesData\)/);
  assert.match(pending, /counts\[reading\.propertyid\] = \(counts\[reading\.propertyid\] \|\| 0\) \+ 1/);
  assert.match(pending, /pendingReadingsCount: counts\[property\.id\] \|\| 0/);
  assert.match(pending, /if \(data\.length < pageSize\) break/);
  assert.match(pending, /pagination limit/);
  assert.doesNotMatch(pending, /platformClient/);
});

test('explicit pending reading transport retains scoped filters and avoids compatibility facade', () => {
  const client = readFileSync(new URL('../src/services/pendingInvoiceDashboardReadClient.js', import.meta.url), 'utf8');
  assert.match(client, /buildRequestContextHeaders/);
  assert.match(client, /\/api\/platform\/query/);
  assert.match(client, /billing_status/);
  assert.match(client, /pending_invoice/);
  assert.match(client, /invoice_id/);
  assert.match(client, /ascending: true/);
  assert.match(client, /missingTable/);
  assert.match(client, /databaseConfigured === false/);
  // Guard actual compatibility imports/calls, not comments describing the migration.
  assert.doesNotMatch(client, /from ['\"][^'\"]*platformClient/);
  assert.doesNotMatch(client, /platformClient\\./);
});

test('dashboard read changes do not modify invoice mutation guards', () => {
  const guard = readFileSync(new URL('../src/api/platform/billingMutationGuard.js', import.meta.url), 'utf8');
  assert.match(guard, /BILLING_LIFECYCLE_REQUIRED/);
  assert.match(guard, /guardBillingMssqlCompatibility/);
  assert.match(invoiceService, /export const createInvoiceRecord[\s\S]*?throw billingLifecycleRequired\(\)/);
  assert.match(invoiceService, /export const updateInvoiceRecord[\s\S]*?throw billingLifecycleRequired\(\)/);
});

test('dashboard clears stale pending data and surfaces utility query failures', () => {
  const dashboard = readFileSync(new URL('../src/pages/InvoiceManagementDashboard.jsx', import.meta.url), 'utf8');
  const pendingLoader = dashboard.slice(
    dashboard.indexOf('const loadPropertiesWithReadings = async'),
    dashboard.indexOf('const handleFilterChange', dashboard.indexOf('const loadPropertiesWithReadings = async'))
  );
  assert.match(pendingLoader, /setPropertiesWithReadings\(\[\]\)/);
  assert.match(pendingLoader, /setError\(err\?\.message/);
});

test('shared invoice property selector uses supported context selection contracts', () => {
  const selector = readFileSync(new URL('../src/components/properties/PropertySelector.jsx', import.meta.url), 'utf8');
  const context = readFileSync(new URL('../src/contexts/PropertyContext.jsx', import.meta.url), 'utf8');
  assert.match(selector, /togglePropertySelection\(propertyId\)/);
  assert.match(selector, /clearPropertySelection\(\)/);
  assert.match(selector, /selectAllProperties\(\)/);
  assert.doesNotMatch(selector, /selectMultipleProperties/);
  assert.match(selector, /onChange \? \(Array\.isArray\(value\) \? value : \[\]\) : selectedPropertyIds/);
  for (const name of ['togglePropertySelection', 'clearPropertySelection', 'selectAllProperties']) {
    assert.ok(context.includes(name), name + ' must be implemented by PropertyContext');
  }
});
