import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateInvoices, generateInvoicesByProperty } from '../src/services/invoiceService.js';

const source = readFileSync(new URL('../src/services/invoiceService.js', import.meta.url), 'utf8');

test('legacy invoice generators fail closed without a write transport', async () => {
  const grouped = await generateInvoicesByProperty({
    'property-a': { rentees: { 'rentee-a': { readings: [{ id: 'reading-a', calculatedbill: 50 }] } } }
  }, { includeRent: true, sendNotifications: true });
  assert.equal(grouped.success, false);
  assert.deepEqual(grouped.invoiceIds, []);
  assert.equal(grouped.code, 'BILLING_LIFECYCLE_REQUIRED');
  assert.equal(grouped.errors[0].code, 'BILLING_LIFECYCLE_REQUIRED');
  const flat = await generateInvoices([{ id: 'reading-a', rentee_id: 'rentee-a' }], { billing_period: '2026-10' });
  assert.equal(flat.data, null);
  assert.equal(flat.code, 'BILLING_LIFECYCLE_REQUIRED');
});

test('legacy generator implementations cannot create invoices or link readings', () => {
  const start = source.indexOf('export const generateInvoicesByProperty =');
  const end = source.indexOf('export async function getInvoiceSummaryByProperty', start);
  assert.ok(start >= 0 && end > start);
  const generatorRegion = source.slice(start, end);
  assert.doesNotMatch(generatorRegion, /platformClient|\.insert\(|\.update\(|invoice_id\s*:|billing_status\s*:/);
  assert.match(generatorRegion, /billingLifecycleRequired/);
  assert.match(source, /export const getPropertiesWithPendingReadings|export async function getPropertiesWithPendingReadings/);
});
