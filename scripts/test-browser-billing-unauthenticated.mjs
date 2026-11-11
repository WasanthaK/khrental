import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import express from 'express';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {createSecurityHeaders} from '../src/api/securityHeaders.js';
import { assertEviaEvidenceDeletionAllowed } from '../src/api/storage/eviaEvidenceRetention.js';

// Check server-side Evia evidence protection alongside the browser smoke.
assert.throws(() => assertEviaEvidenceDeletionAllowed('documents'), { code: 'EVIA_EVIDENCE_DELETE_DENIED' });

// Browser security-boundary smoke only: isolated built frontend, no credentials,
// no production URL, and no development authentication bypass.
delete process.env.VITE_ENABLE_DEV_BYPASS;
const app = express();
app.use(createSecurityHeaders({production:true}));
app.use(express.static(resolve('dist')));
app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
const server = createServer(app);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
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
  // This isolated frontend has no SQL backend. Supply readiness only; actual
  // authentication and protected-route checks still run without a session.
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/mssql/health') {
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, connection: 'ready' }) });
    }
    if (url.origin === 'http://127.0.0.1:' + port || url.protocol === 'data:') {return request.continue();}
    return request.abort();
  });
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
  const inlineBlocked=await page.evaluate(async()=>{
    window.inlineSecurityProbe=0;
    const script=document.createElement('script');script.textContent='window.inlineSecurityProbe=1';document.body.appendChild(script);
    await new Promise(resolve=>setTimeout(resolve,50));return window.inlineSecurityProbe===0;
  });
  assert.equal(inlineBlocked,true,'Production CSP must block injected inline script');
  assert.match(await page.evaluate(()=>document.body.innerText),/sign in|log in/i,'Built login must render under production CSP');
  console.log('PASS: production-header built frontend loads login, blocks anonymous billing navigation and rejects inline script');
} finally {
  if (browser) {await browser.close();}
  await new Promise(resolve => server.close(resolve));
}
