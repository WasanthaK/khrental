import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('routed utility invoicing view cannot synthesize an invoice or mark readings invoiced', () => {
  const view = read('../src/pages/UtilityBillingInvoice.jsx');
  const routes = read('../src/routes.jsx');
  assert.match(routes, /path: 'invoicing',[\s\S]*?<UtilityBillingInvoice \/>/);
  assert.match(view, /fetchReadingsForInvoice/);
  assert.doesNotMatch(view, /markAsInvoiced|mockInvoiceId|INV-\$\{Date\.now\(\)\}|handleCreateInvoice/);
  assert.doesNotMatch(view, /Create Invoice|<Checkbox|selectedItems|setSelectedItems/);
  assert.match(view, /Read-only utility billing preview/);
  assert.match(view, /loadError \?/);
});

test('utility review navigation uses governed invoice management permission and route', () => {
  const view = read('../src/pages/UtilityBillingInvoice.jsx');
  const routes = read('../src/routes.jsx');
  assert.match(view, /hasPermission\([\s\S]*?PERMISSIONS\.INVOICES_MANAGE/);
  assert.match(view, /canManageInvoices &&/);
  assert.match(view, /navigate\('\/dashboard\/invoices\/batch-generate'\)/);
  assert.match(routes, /path: 'batch-generate',[\s\S]*?PERMISSIONS\.INVOICES_MANAGE/);
  assert.match(routes, /path: 'invoicing',[\s\S]*?PERMISSIONS\.UTILITIES_REVIEW/);
});

test('governed generator retains backend invoice authority and transaction-scoped utility linkage', () => {
  const wizard = read('../src/components/invoices/InvoiceGenerationWizard.jsx');
  const monthly = read('../src/api/platform/monthlyBillingService.js');
  assert.match(wizard, /generateMonthlyInvoices/);
  assert.match(monthly, /FROM utility_readings WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(monthly, /invoice_id IS NULL/);
  assert.match(monthly, /WHERE tenant_id = @tenantId/);
});
