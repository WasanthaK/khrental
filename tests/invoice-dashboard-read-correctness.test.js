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


test('Phase 5 browser: real PropertySelector selects, toggles, clears, and respects controlled empty state', { timeout: 120000 }, async () => {
  const { fileURLToPath } = await import('node:url');
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { default: puppeteer } = await import('puppeteer');

  // Never use live URLs, sessions or SQL. Vite aliases ONLY the selector's
  // PropertyContext import to the in-memory fixture; the rendered component
  // itself is the actual production PropertySelector.jsx.
  const root = fileURLToPath(new URL('../', import.meta.url));
  const mockContext = fileURLToPath(new URL('./fixtures/property-selector/mockPropertyContext.jsx', import.meta.url));
  const vite = await createServer({
    root, configFile: false, logLevel: 'error',
    plugins: [react()],
    resolve: { alias: [
      { find: '../../contexts/PropertyContext', replacement: mockContext }
    ] },
    server: { host: '127.0.0.1', port: 0, strictPort: false }
  });
  let browser;
  try {
    await vite.listen();
    const port = vite.httpServer.address().port;
    browser = await puppeteer.launch({
      headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.setViewport({ width: 1280, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', request => {
      try {
        const destination = new URL(request.url());
        if (destination.hostname !== '127.0.0.1') {
          request.abort();
          return;
        }
        request.continue();
      } catch {
        request.abort();
      }
    });
    await page.goto('http://127.0.0.1:' + port + '/tests/fixtures/property-selector/index.html',
      { waitUntil: 'networkidle2', timeout: 30000 });
    const selected = async (name, expected) => {
      await page.waitForFunction((fixture, value) => {
        const output = document.querySelector('[data-selection="' + fixture + '"]');
        return output && output.textContent.trim() === value;
      }, { timeout: 12000 }, name, expected);
    };
    const card = (section, index) =>
      'section[data-fixture="' + section + '"] .max-h-60 > div:nth-child(' + index + ')';
    const action = (section, index) =>
      'section[data-fixture="' + section + '"] .flex.justify-between button:nth-child(' + index + ')';

    // Controlled [] must NOT accidentally inherit the shared context's Beta.
    await selected('controlled', 'none');
    await selected('uncontrolled', 'beta');
    await page.click(card('controlled', 1));
    await selected('controlled', 'alpha');
    await page.click(card('controlled', 2));
    await selected('controlled', 'alpha,beta');
    await page.click(card('controlled', 1));
    await selected('controlled', 'beta');
    await page.click(action('controlled', 2));
    await selected('controlled', 'none');
    await selected('uncontrolled', 'beta');

    // Controlled select-all works over search-filtered visible properties.
    await page.type('section[data-fixture="controlled"] input[type="text"]', 'Alpha');
    await page.click(action('controlled', 1));
    await selected('controlled', 'alpha');
    await page.click(action('controlled', 2));
    await selected('controlled', 'none');

    // Uncontrolled selection is owned by PropertyContext and is independent.
    await page.click(card('uncontrolled', 1));
    await selected('uncontrolled', 'beta,alpha');
    await page.click(card('uncontrolled', 2));
    await selected('uncontrolled', 'alpha');
    await page.click(action('uncontrolled', 1));
    await selected('uncontrolled', 'alpha,beta,gamma');
    await page.click(action('uncontrolled', 2));
    await selected('uncontrolled', 'none');

    // Single selection replaces rather than appending an unrelated property.
    await page.click(card('single', 3));
    await selected('single', 'gamma');
    await page.click(card('single', 1));
    await selected('single', 'alpha');

    assert.deepEqual(browserErrors, [], 'real React selector must render without browser exceptions');
  } finally {
    if (browser) await browser.close();
    await vite.close();
  }
});
