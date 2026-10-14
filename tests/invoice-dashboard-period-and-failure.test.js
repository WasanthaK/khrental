import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getInvoiceSummaryDateRange } from '../src/services/invoiceDashboardDateRange.js';

const dashboard = readFileSync(new URL('../src/pages/InvoiceManagementDashboard.jsx', import.meta.url), 'utf8');

test('invoice summary filters include every millisecond of the last local calendar day', () => {
  const now = new Date(2024, 2, 15, 11, 30);
  assert.deepEqual(getInvoiceSummaryDateRange('last_month', now), {
    fromDate: new Date(2024, 1, 1).toISOString(),
    toDate: new Date(2024, 1, 29, 23, 59, 59, 999).toISOString()
  });
  assert.deepEqual(getInvoiceSummaryDateRange('current_month', now), {
    fromDate: new Date(2024, 2, 1).toISOString(),
    toDate: new Date(2024, 2, 31, 23, 59, 59, 999).toISOString()
  });
  assert.deepEqual(getInvoiceSummaryDateRange('current_year', now), {
    fromDate: new Date(2024, 0, 1).toISOString(),
    toDate: new Date(2024, 11, 31, 23, 59, 59, 999).toISOString()
  });
  assert.deepEqual(getInvoiceSummaryDateRange('all_time', now), {});
  assert.throws(() => getInvoiceSummaryDateRange('current_month', new Date(NaN)));
});

test('invoice dashboard does not show old financial totals after selection, filter, or read failures', () => {
  assert.match(dashboard, /summaryRequestId = useRef\(0\)/);
  assert.match(dashboard, /\+\+summaryRequestId\.current/);
  assert.match(dashboard, /if \(requestId !== summaryRequestId\.current\) return;/);
  assert.match(dashboard, /setInvoiceSummary\(\{\}\)/);
  assert.match(dashboard, /setSummaryAvailable\(false\)/);
  assert.match(dashboard, /setSummaryAvailable\(true\)/);
  assert.match(dashboard, /getInvoiceSummaryDateRange\(filterOptions\.period, new Date\(\)\)/);
  for (const property of ['totalInvoices', 'totalAmount', 'pendingAmount', 'paidAmount']) {
    assert.ok(dashboard.includes('summaryAvailable ? '), property + ' gated by loaded-state');
  }
  assert.match(dashboard, /summaryAvailable \? totals\.totalInvoices : '—'/);
  assert.match(dashboard, /summaryAvailable \? formatCurrency\(totals\.totalAmount\) : '—'/);
  assert.match(dashboard, /summaryAvailable \? formatCurrency\(totals\.pendingAmount\) : '—'/);
  assert.match(dashboard, /summaryAvailable \? formatCurrency\(totals\.paidAmount\) : '—'/);
});
