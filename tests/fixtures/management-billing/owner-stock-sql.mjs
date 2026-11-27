import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
import {createManagementBillingRouter} from '../../../src/api/managementBilling/router.js';

export async function verifyOwnerStockScreen({store, tenantId, actorId, stripe, output = 'owner-stock-proof'}) {
  const identity = {user: {id: actorId}, membership: {tenant_id: tenantId, status: 'active', role: 'admin'}};
  const api = express();
  api.use(express.json());
  api.get('/api/mssql/health', (_req, res) => res.json({ok: true, connection: 'ready'}));
  api.use('/api/management-billing', createManagementBillingRouter({
    store, stripe, env: {MANAGEMENT_BILLING_SCHEMA_READY: 'true'},
    resolveContext(req, res, next) {
      if (req.headers['x-tenant-id'] !== tenantId) { return res.sendStatus(403); }
      Object.assign(req, identity, {tenantId, authSession: {}});
      next();
    }
  }));

  // Only the auth hook is supplied by the fixture. The page controller, HTTP router
  // and billing store handle every inventory read and mutation in the SQL job.
  const fixturePlugin = {
    name: 'disposable-owner-context', enforce: 'pre',
    resolveId(id) { if (id === '../hooks/useAuth') { return '\0fixture-owner-auth'; } },
    load(id) { if (id === '\0fixture-owner-auth') { return 'export const useAuth=()=>' + '(' + JSON.stringify(identity) + ')'; } },
    configureServer(server) { server.middlewares.use(api); }
  };
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'quixo-stock-'));
  const entry = 'tests/fixtures/management-billing/owner-stock.html';
  const vite = await createServer({configFile: false, plugins: [fixturePlugin, react()],
    cacheDir: path.join(temp, 'vite'), optimizeDeps: {entries: [entry]},
    server: {host: '127.0.0.1', port: 0}, logLevel: 'error'});
  let browser;
  try {
    await vite.listen();
    const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
    browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => new URL(request.url()).origin === origin ? request.continue() : request.abort());
    await page.evaluateOnNewDocument(id => localStorage.setItem('khrental.activeTenantId', id), tenantId);
    await page.setViewport({width: 1440, height: 980});
    await page.goto(origin + '/' + entry);
    const waitForText = text => page.waitForFunction(value => document.body.innerText.includes(value), {}, text);
    const staged = () => page.$$eval('#prepared-stock-title ~ div ul li', items => items.map(item => item.innerText).sort());
    const pendingRows = async () => (await store.pendingStock(tenantId)).map(row => [row.id, row.payload_hash]).sort();
    await page.waitForSelector('#prepared-stock-title');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('label')?.textContent), 'Property name');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('form input', input => input.validity.valueMissing), true);
    assert.equal((await pendingRows()).length, 0);
    await page.keyboard.type('Garden cottage');
    for (const expected of ['SELECT', 'SELECT', 'BUTTON']) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.tagName), expected);
    }
    await page.keyboard.press('Enter');
    await waitForText('Inventory prepared for billing confirmation (1 record)');
    await page.reload();
    await waitForText('Garden cottage · Property');
    assert.deepEqual(await staged(), ['Garden cottage · Property']);
    assert.equal((await pendingRows()).length, 1);
    console.log('R5_OWNER_PREPARE_KEYBOARD=PASS empty_validation tab_order confirmation persisted_once');

    const csv = await fs.readFile('public/dwelling-import-template.csv', 'utf8');
    const header = csv.split('\n')[0];
    const upload = async (contents, expected) => {
      const filename = path.join(temp, Math.random().toString(36).slice(2) + '.csv');
      await fs.writeFile(filename, contents);
      await (await page.$('input[type=file]')).uploadFile(filename);
      await waitForText(expected);
    };
    const submit = async () => {
      await page.focus('form[aria-label="Import properties and units"] button');
      await page.keyboard.press('Enter');
    };
    await page.click('summary');
    await upload(header + '\nx,Should stay out,house,LK,\nx,Duplicate,house,LK,', 'unique reference');
    assert.equal(await page.$('form[aria-label="Import properties and units"] button'), null);
    assert.equal((await pendingRows()).length, 1);
    await upload(csv, 'Review 3 records');
    await submit();
    await waitForText('Inventory prepared for billing confirmation (3 records)');
    const labels = ['Garden cottage · Property', 'Garden House · Property', 'Lake Apartments · Property', 'Lake Apartment 1 · Unit'].sort();
    assert.deepEqual(await staged(), labels);
    const before = await pendingRows();
    assert.equal(before.length, 4);
    await fs.mkdir(output, {recursive: true});
    for (const width of [1440, 390]) {
      await page.setViewport({width, height: 980});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({path: path.join(output, 'staged-' + width + '.png'), fullPage: true});
    }
    await page.reload();
    await waitForText('Garden House · Property');
    await page.click('summary');
    await upload(csv, 'Review 3 records');
    await submit();
    await waitForText('Inventory prepared for billing confirmation (3 records)');
    assert.deepEqual(await pendingRows(), before);
    const conflict = header + '\nnew-home,Would be staged first,house,LK,\nhome-01,Changed name,house,LK,';
    await upload(conflict, 'Review 2 records');
    await submit();
    await waitForText('This record identifier already belongs to different stock.');
    await page.reload();
    await waitForText('Garden House · Property');
    assert.deepEqual(await staged(), labels);
    assert.deepEqual(await pendingRows(), before);
    assert.equal((await store.inventory(tenantId)).length, 0);
    assert.equal(await store.account(tenantId), null);
    console.log('R5_OWNER_IMPORT=PASS property_and_unit_readback exact_retry malformed_file atomic_conflict no_managed_or_billed_stock');
    return before.map(([id]) => id);
  } finally {
    await browser?.close();
    await vite.close();
    await fs.rm(temp, {recursive: true, force: true});
  }
}
