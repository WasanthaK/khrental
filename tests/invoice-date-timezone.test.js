import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { formatInvoiceDate } from '../src/utils/invoiceDate.js';

test('invoice calendar dates agree with the PDF across browser timezones', () => {
  const script = `
    import { formatInvoiceDate } from './src/utils/invoiceDate.js';
    console.log(JSON.stringify([
      formatInvoiceDate('2027-03-01'),
      formatInvoiceDate('2027-03-01T00:00:00.000Z'),
      formatInvoiceDate('2026-10-23T00:00:00.000Z'),
      formatInvoiceDate('2024-02-29T00:00:00.000Z'),
      formatInvoiceDate('2027-01-01T00:00:00.000Z')
    ]));
  `;
  for (const TZ of ['America/Los_Angeles', 'Pacific/Honolulu', 'UTC', 'Asia/Colombo', 'Pacific/Kiritimati']) {
    const actual = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8'
    }));
    assert.deepEqual(actual, ['March 1, 2027', 'March 1, 2027', 'October 23, 2026', 'February 29, 2024', 'January 1, 2027'], TZ);
  }
});

test('missing or invalid invoice dates do not invent a billing date', () => {
  for (const value of [null, undefined, '', 'invalid']) assert.equal(formatInvoiceDate(value), '');
});
