import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireInvoiceListRows } from '../src/services/invoiceListReadContract.js';

test('valid empty invoice list is distinct from an invalid response', () => {
  assert.deepEqual(requireInvoiceListRows([]), []);
  const rows = [{ id: '9aef5217-20a1-4b15-b74d-b5e7fb04251a', status: 'issued', totalamount: 0 }];
  assert.equal(requireInvoiceListRows(rows), rows);
});

test('malformed invoice list responses fail closed with explicit error', () => {
  for (const value of [null, undefined, '', '{}', {}, { data: [] }, 0, false,
    [null], ['invoice-id'], [[{ id: 'ok' }]], [{}], [{ id: '' }], [{ id: 100 }]]) {
    assert.throws(() => requireInvoiceListRows(value),
      error => error.code === 'INVALID_INVOICE_LIST_RESPONSE');
  }
});

test('both invoice list transports preserve authorization failures and reject bad data', () => {
  const service = readFileSync(new URL('../src/services/invoiceService.js', import.meta.url), 'utf8');
  const list = service.slice(service.indexOf('export const listInvoices ='), service.indexOf('// Invoice and payment mutations'));
  assert.match(list, /const invoices = requireInvoiceListRows\(data\)\.map\(normalizeInvoiceRecord\)/);
  assert.match(list, /data: requireInvoiceListRows\(data\)\.map\(normalizeInvoiceRecord\)/);
  assert.match(list, /return \{ data: null, error: mssqlError \}/);
  assert.doesNotMatch(list, /Array\.isArray\(data\) \? data\.map\(normalizeInvoiceRecord\) : \[\]/);
  assert.match(list, /if \(Array\.isArray\(options\.status\) && options\.status\.length === 0\)/);
  assert.match(list, /query\.append\('status', status\)/);
});
