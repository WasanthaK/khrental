// Actual agreement form, signing review and authenticated viewer; disposable service fixtures only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
const owner = { id: 'owner-global', email: 'owner@example.invalid', name: 'Workspace Owner' };
const counts = { contexts: 0, saves: [], generated: 0, sent: 0, previews: 0 };
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {Toaster} from 'react-hot-toast';import Form from '/src/components/agreements/AgreementFormContainer.jsx';import 'bootstrap/dist/css/bootstrap.min.css';import '/src/index.css';createRoot(document.getElementById('root')).render(<BrowserRouter><Toaster/><Form/></BrowserRouter>);`;
const modules = {
  platformClient: `export const platform={auth:{getTenantContext:async()=>{const r=await fetch('/api/context');return r.json();},getSession:async()=>({data:{session:{user:{id:'owner-global'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`,
  agreementService: `export const listTemplates=async()=>[{id:'template',name:'Fixture'}];export const listProperties=async()=>[{id:'property',name:'House',propertytype:'house',rentalvalues:{rent:100,deposit:0}}];export const listPropertyUnits=async()=>[];export const fetchProperty=async()=>({id:'property',propertytype:'house',rentalvalues:{rent:100,deposit:0}});export const fetchPropertyUnit=async()=>null;export const getTemplate=async()=>({content:'<p>For Tenant:</p><p>For Landlord:</p>'});export const fetchAgreement=async()=>null;`,
  appUserService: `export const fetchAppUser=async()=>({id:'renter-global',name:'Membership Renter',email:'renter@example.invalid'});`,
  agreementWorkflowService: `const call=async(path,body)=>{const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};export const renderAgreementContent=()=>'<p>Test contract</p>';export const saveAgreementForStatus=async(args)=>call('/api/save',args);export const generateAndAttachAgreementDocument=async(args)=>call('/api/prepare',args);export const updateAgreementCanonical=async(id,body)=>call('/api/update',{id,...body});`,
  eviaSignService: `export const getAuthorizationUrl=async()=>{throw Error('Unexpected real authentication')};export const handleAuthCallback=async()=>{};export const getEviaAgreementCallbackUrl=async()=>'/fixture-callback';export const sendDocumentForSignature=async(body)=>{const r=await fetch('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json();};`,
  databaseReadiness: `export const ensureDatabaseReady=async()=>{};`,
  env: `export const getApiBaseUrl=()=>location.origin;export const isMssqlApiEnabled=()=>true;`,
  requestContext: `export const buildRequestContextHeaders=()=>({'x-fixture-context':'selected-workspace'});`
};
const plugin = { name: 'agreement-identity-proof', enforce: 'pre', resolveId(source, importer) {
  if (source === 'virtual:proof') return '\0proof.jsx';
  if (source.startsWith('\0')) return source;
  if (!importer?.includes('/src/')) return;
  const name = source.split('/').at(-1).replace(/\.js$/, '');
  if (modules[name]) return '\0fixture-' + name;
}, async load(id) {
  if (id === '\0proof.jsx') return transformWithEsbuild(entry, 'proof.jsx', { loader: 'jsx', jsx: 'automatic' });
  if (id.startsWith('\0fixture-')) return modules[id.slice(9)];
}};
let vite, server, browser, saved;
const click = async (page, text) => {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === text && !button.disabled), {}, text);
  await page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text && !button.disabled).click(), text);
};
try {
  vite = await createServer({ configFile: false, plugins: [plugin, react()], server: { middlewareMode: true }, appType: 'custom' });
  const app = express(); app.use(express.json());
  app.get('/api/mssql/rentees', (req, res) => {
    assert.equal(req.query.status, 'active');
    res.json({ data: [{ id: 'renter-global', name: 'Membership Renter', email: 'renter@example.invalid', directory_role: 'rentee' }] });
  });
  app.get('/api/context', (req, res) => {
    counts.contexts++;
    res.json(counts.contexts === 1 ? { data: null, error: { message: 'Transient' } } : { data: { user: owner, tenantId: 'selected-workspace' }, error: null });
  });
  app.post('/api/save', (req, res) => {
    counts.saves.push(req.body.existingId);
    saved = { ...req.body.formData, id: 'saved', status: req.body.status };
    res.json(saved);
  });
  app.post('/api/prepare', (req, res) => {
    counts.generated++;
    if (counts.generated === 1) return res.status(503).json({ error: 'Preparation temporarily unavailable' });
    saved = { ...saved, documenturl: `http://${req.headers.host}/storage/files/agreements/fixture.pdf`, status: req.body.finalStatus };
    res.json(saved);
  });
  app.post('/api/update', (req, res) => { saved = { ...saved, ...req.body }; res.json(saved); });
  app.post('/api/send', async (req, res) => {
    counts.sent++;
    assert.equal(req.body.documentUrl, saved.documenturl, 'Send exactly the previewed document');
    assert.equal(req.body.signatories.length, 2);
    await new Promise(resolve => setTimeout(resolve, 200));
    res.json({ success: true, requestId: 'fixture-request' });
  });
  app.get('/storage/files/agreements/fixture.pdf', (req, res) => {
    assert.equal(req.headers['x-fixture-context'], 'selected-workspace'); counts.previews++;
    res.type('pdf').send('%PDF-1.4\n% transport fixture only\n%%EOF');
  });
  app.use('/api', (req, res) => res.status(500).json({ error: 'Unexpected legacy request' }));
  app.use(vite.middlewares);
  app.use(async (req, res) => res.type('html').send(await vite.transformIndexHtml(req.originalUrl, '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module">import "virtual:proof";</script></body></html>')));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  await fs.mkdir('enquiry-browser-proof', { recursive: true });
  for (const width of [1440, 390]) {
    counts.contexts = 0; counts.saves = []; counts.generated = 0; counts.sent = 0; counts.previews = 0;
    const page = await browser.newPage(); page.setDefaultTimeout(15000);
    await page.setViewport({ width, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(origin) || /^(data:|blob:)/.test(request.url()) ? request.continue() : request.abort());
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(() => localStorage.setItem('eviaSignAuth', JSON.stringify({ authToken: 'fixture-only', expiresAt: Date.now() + 600000 })));
    await page.goto(origin, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.innerText.includes('Membership Renter'));
    const fieldLabels=await page.$$eval('form label',labels=>labels.map(label=>({text:label.textContent.trim(),id:label.control?.id,disabled:label.control?.disabled})));
    assert.equal(fieldLabels.length,11,'Every agreement field has an accessible label');
    assert.equal(new Set(fieldLabels.map(label=>label.id)).size,11,'Labels target distinct form fields');
    for(const label of fieldLabels){
      assert.ok(label.id,'Visible field label is associated with its control: '+label.text);
      if(!label.disabled){
        await page.click('label[for="'+label.id+'"]');
        assert.equal(await page.evaluate(()=>document.activeElement.id),label.id,'Clicking label focuses '+label.text);
      }
    }
    await click(page, 'Review and send');
    assert.equal(counts.contexts, 0, 'Invalid form cannot save or open signing');
    const selects = await page.$$('select'); await selects[0].select('template'); await selects[1].select('property'); await selects[3].select('renter-global');
    await page.waitForFunction(() => document.querySelector('form').checkValidity());
    await page.screenshot({ path: `enquiry-browser-proof/agreement-form-${width}.png`, fullPage: true });
    await click(page, 'Review and send');
    await page.waitForFunction(() => document.body.innerText.includes('Unable to load your signing profile'));
    assert.equal(counts.saves.length, 0, 'No save with missing signing profile');
    await click(page, 'Review and send');
    await page.waitForFunction(() => document.body.innerText.includes('Preparation temporarily unavailable'));
    await click(page, 'Review and send');
    await page.waitForFunction(() => document.body.innerText.includes('Review and send agreement'));
    assert.deepEqual(counts.saves, [null, 'saved'], 'Preparation retry reuses saved agreement');
    assert.equal(counts.sent, 0, 'Review does not send invitations');
    assert.equal(counts.generated, 2);
    await click(page, 'Preview agreement');
    await page.waitForFunction(() => document.querySelector('iframe')?.src.startsWith('blob:'));
    assert.equal(counts.previews, 1, 'Preview uses authenticated viewer');
    await page.click('[aria-label="Close document viewer"]');
    await page.waitForSelector('iframe', { hidden: true });
    await page.waitForFunction(() => !document.body.innerText.includes('Agreement saved and prepared.'));
    await page.screenshot({ path: `enquiry-browser-proof/agreement-review-${width}.png`, fullPage: true });
    await page.evaluate(() => { const modal = [...document.querySelectorAll('div')].find(element => element.className.includes('max-h-[90dvh]')); if (modal) modal.scrollTop = modal.scrollHeight; });
    await page.screenshot({ path: `enquiry-browser-proof/agreement-review-actions-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    await page.evaluate(() => {
      const form = [...document.querySelectorAll('form')].at(-1);
      form.requestSubmit(); form.requestSubmit();
    });
    await page.waitForFunction(() => location.pathname === '/dashboard/agreements');
    assert.equal(counts.sent, 1, 'Rapid duplicate submission sends only once');
    assert.equal(counts.generated, 2, 'Send does not regenerate reviewed document');
    assert.equal(saved.eviasignreference, 'fixture-request');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('AGREEMENT_REVIEW_SEND_BROWSER=PASS desktop mobile validation profile_retry preparation_retry exact_document duplicate_submit');
} finally {
  await browser?.close(); await vite?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve());
}
