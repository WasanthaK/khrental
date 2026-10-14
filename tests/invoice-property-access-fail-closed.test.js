import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/invoiceService.js', import.meta.url), 'utf8');

test('legacy property access helper cannot widen permission to all properties', () => {
  const offset = source.indexOf('export async function getCurrentUserPropertyAccess()');
  assert.ok(offset >= 0);
  const helper = source.slice(offset);
  assert.match(helper, /PROPERTY_ACCESS_AUTHORITY_REQUIRED/);
  assert.match(helper, /data: null/);
  assert.doesNotMatch(helper, /platformClient|\.from\('properties'\)|allProperties|properties_access/);
});

test('active invoice dashboard and tenant-scoped billing reads remain untouched', () => {
  assert.match(source, /export const listInvoices/);
  assert.match(source, /export async function getInvoiceSummaryByProperty/);
  assert.match(source, /export async function getPropertiesWithPendingReadings/);
  assert.match(source, /export const getInvoicesByProperty/);
});
