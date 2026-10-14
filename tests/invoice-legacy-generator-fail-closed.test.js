import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/invoiceService.js', import.meta.url), 'utf8');

test('legacy invoice generators only return an explicit billing-lifecycle rejection', () => {
  const start = source.indexOf('export const generateInvoicesByProperty =');
  const end = source.indexOf('export async function getInvoiceSummaryByProperty', start);
  assert.ok(start >= 0 && end > start);
  const region = source.slice(start, end);
  assert.match(region, /billingLifecycleRequired\(\)/);
  assert.match(region, /success: false/);
  assert.match(region, /invoiceIds: \[\]/);
  assert.match(region, /data: null, error: error\.message, code: error\.code/);
  assert.doesNotMatch(region, /platformClient|\.insert\(|\.update\(|invoice_id\s*:|billing_status\s*:/);
});

test('governed monthly billing and live invoice reads remain independently present', () => {
  assert.match(source, /export const createInvoiceRecord =/);
  assert.match(source, /export const updateInvoiceRecord =/);
  assert.match(source, /export const listInvoices =/);
  assert.match(source, /export async function getPropertiesWithPendingReadings/);
  const monthly = readFileSync(new URL('../src/api/platform/monthlyBillingService.js', import.meta.url), 'utf8');
  assert.match(monthly, /FROM utility_readings WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(monthly, /invoice_id IS NULL/);
});
