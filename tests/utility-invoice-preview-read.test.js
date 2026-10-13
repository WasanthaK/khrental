import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizePlatformQuery } from '../src/api/platform/authorization.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('utility invoice preview routes through scoped read and never mutates', () => {
  const service = read('../src/services/utilityBillingService.js');
  const start = service.indexOf('export const fetchReadingsForInvoice =');
  const end = service.indexOf('// Array of months for date calculations', start);
  const body = service.slice(start, end);
  assert.ok(start > -1 && end > start);
  assert.match(body, /listUtilityInvoicePreviewRows\(options\)/);
  assert.doesNotMatch(body, /platformClient|markAsInvoiced|\.update\(|\.insert\(/);

  const client = read('../src/services/utilityInvoicePreviewReadClient.js');
  assert.match(client, /\/api\/platform\/query/);
  assert.match(client, /buildRequestContextHeaders/);
  assert.match(client, /action: 'select'/);
  assert.match(client, /table: 'utility_readings'/);
  assert.match(client, /billing_status/);
  assert.match(client, /pending_invoice/);
  assert.match(client, /invoice_id/);
  assert.match(client, /value: null/);
  assert.match(client, /order: \[\{ column: 'id', ascending: true \}\]/);
  assert.match(client, /MAX_PAGES/);
  assert.match(client, /databaseConfigured === false/);
  assert.match(client, /missingTable/);
  assert.doesNotMatch(client, /markAsInvoiced|\.update\(|\.insert\(|platformClient/);
});

test('preview applies calendar filters in UTC and preserves persisted amount', () => {
  const client = read('../src/services/utilityInvoicePreviewReadClient.js');
  assert.match(client, /Date\.UTC\(numericYear, monthIndex, 1\)/);
  assert.match(client, /operator: 'gte'/);
  assert.match(client, /operator: 'lt'/);
  assert.match(client, /page \* pageSize/);
  assert.match(client, /return readings\.map\(mapUtilityInvoicePreviewRow\)/);
  assert.match(client, /toFinite\(reading\.calculatedbill\)/);
  assert.doesNotMatch(client, /properties\?\.electricity_rate|properties\?\.water_rate/);
  assert.match(read('../src/pages/UtilityBillingInvoice.jsx'), /Not calculated/);
});

test('tenant and staff authorization still own the utility preview scope', () => {
  const owner = authorizePlatformQuery({
    action: 'select', table: 'utility_readings',
    user: { id: 'rentee-a', role: 'rentee' },
    membership: { tenant_id: 'tenant-a', status: 'active', role: 'rentee' },
    filters: [{ column: 'renteeid', operator: 'eq', value: 'rentee-b' }]
  });
  assert.ok(owner.filters.some(f => f.column === 'renteeid' && f.value === 'rentee-a'));
  assert.ok(owner.filters.some(f => f.column === 'renteeid' && f.value === 'rentee-b'));
  const monthly = read('../src/api/platform/monthlyBillingService.js');
  assert.match(monthly, /FROM utility_readings WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(monthly, /invoice_id IS NULL/);
  assert.match(monthly, /WHERE tenant_id = @tenantId/);
});
