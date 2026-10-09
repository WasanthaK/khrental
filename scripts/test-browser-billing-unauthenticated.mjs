import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { preview } from 'vite';

// Browser security-boundary smoke only: isolated built frontend, no credentials,
// no production URL, and no development authentication bypass.
delete process.env.VITE_ENABLE_DEV_BYPASS;
const app = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: false }
});
const server = app.httpServer;
const port = server.address().port;
let browser;

const visit = async (page, route) => {
  await page.goto('http://127.0.0.1:' + port + route, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() => {
    const url = new URL(window.location.href);
    return url.pathname === '/login' || url.pathname === '/unauthorized';
  }, { timeout: 15000 });
  const routeAfter = await page.evaluate(() => window.location.pathname);
  assert.ok(['/login', '/unauthorized'].includes(routeAfter),
    'unauthenticated visitor must not enter protected route ' + route);
  const text = await page.evaluate(() => document.body.innerText);
  assert.doesNotMatch(text, /pending readings count|invoice management dashboard|create invoice/i,
    'protected billing content must not render anonymously');
};

try {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  for (const route of [
    '/dashboard/invoices',
    '/dashboard/utilities',
    '/rentee/invoices',
    '/rentee/utilities',
    '/rentee/utilities/history'
  ]) {
    await visit(page, route);
  }
  console.log('PASS: built frontend blocks anonymous invoice and utility browser navigation');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
