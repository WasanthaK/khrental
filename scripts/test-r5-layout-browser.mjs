// Existing DocumentService + real browser DOM, with disposable data/storage only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
const output='r5-browser-proof';
const model={agreement:{id:'fixture',status:'signed',signature_status:'completed',propertyid:'property'},rentee:{name:'Demo renter'},property:{name:'Demo home'},readiness:{requiredDeposit:125000,securityDepositReceived:125000,checks:{tenantAssigned:true,propertyAssigned:true,accountAccepted:true,membershipActive:true,agreementSigned:true,securityDepositSatisfied:true,moveInChecklistComplete:false},canActivate:false,blockingReasons:['Move-in checklist is not complete.']},checklist:{id:'empty',status:'completed',items:[]},deposit:{confirmationAdvance:0,transactions:[{id:'test',transaction_type:'security_deposit',amount:125000,status:'received',payment_method:'SIMULATED TEST',payment_reference:'SIMULATED-R5-01',received_at:'2026-11-05',notes:'Demo test only; no funds received.'}]}};
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route} from 'react-router-dom';import {PDFPage} from 'pdf-lib';import {saveMergedDocument} from '/src/services/DocumentService.js';import Onboarding from '/src/pages/TenancyOnboarding.jsx';import '/src/index.css';
window.draws=[];const original=PDFPage.prototype.drawText;PDFPage.prototype.drawText=function(text,options){window.draws.push({page:this.ref.toString(),text,x:options.x,y:options.y});return original.call(this,text,options);};
const terms=Array.from({length:65},(_,i)=>'<p>Clause '+(i+1)+': This representative demo agreement reserves the home for the stated term. The parties retain their contract and deposit records. No signature or payment is represented by this fixture.</p>').join('');
const html='<h1>Representative rental agreement</h1>'+terms+'<h2>TENANT SIGNATURE</h2><p>For Tenant: ____________________________</p><h2>LANDLORD SIGNATURE</h2><p>For Landlord: ____________________________</p><p>Closing text: each party keeps a copy of this agreement.</p>';
window.proof=saveMergedDocument(html,'00000000-0000-4000-8000-000000000001').then(()=>({draws:window.draws,pdf:window.fixturePdf}));
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/dashboard/agreements/:id/onboarding" element={<Onboarding/>}/></Routes></BrowserRouter>);`;
const modules={
  platformClient:`const model=${JSON.stringify(model)};export const platform={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{property:{name:'Demo home'},rentee:{name:'Demo renter'},terms:{monthlyRent:125000,depositAmount:125000}}})})})})};export const getTenancyOnboarding=async()=>({data:model});export const initializeMoveInChecklist=async()=>({error:{message:'Add required items to the property checklist.'}});export const activateTenancy=async()=>{throw Error('Must stay blocked')};export const recordManualAgreementSignature=async()=>{throw Error('No signatures')};export const recordTenancyDeposit=async()=>{throw Error('No funds')};export const updateMoveInChecklistItem=async()=>{throw Error('No inspection')};`,
  fileService:`export const STORAGE_BUCKETS={FILES:'files'};export const BUCKET_FOLDERS={files:{AGREEMENTS:'agreements'}};`,
  storageApiService:`export const uploadTenantFile=async({file,path})=>{window.fixturePdf=btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));return {path,url:'fixture.pdf'};};export const buildStorageUrl=()=>'';export const downloadTenantFile=()=>{};export const listTenantFiles=()=>{};`,
  invitationService:`export const resendInvitation=async()=>{throw Error('No invitations')};`
};
const plugin={name:'r5-fixtures',enforce:'pre',resolveId(source,importer){if(source==='virtual:r5')return '\0r5.jsx';if(source.startsWith('\0'))return source;if(!importer?.includes('/src/'))return;const key=source.split('/').at(-1).replace(/\.js$/,'');if(modules[key])return '\0r5-'+key;},async load(id){if(id==='\0r5.jsx')return transformWithEsbuild(entry,'r5.jsx',{loader:'jsx',jsx:'automatic'});if(id.startsWith('\0r5-'))return modules[id.slice(4)];}};
let vite,server,browser;
try {
  await fs.mkdir(output,{recursive:true});
  vite=await createServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
  const app=express();app.use(vite.middlewares);app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,'<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module">import "virtual:r5";</script></body></html>')));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/dashboard/agreements/fixture/onboarding`,{waitUntil:'networkidle0'});
  const result=await page.evaluate(()=>window.proof);assert.ok(result?.pdf,'actual renderer produced PDF');
  const pages=[...new Set(result.draws.map(d=>d.page))];assert.ok(pages.length>=4,'representative multipage contract');
  for(const [i,p] of pages.entries()) {
    const footers=result.draws.filter(d=>d.page===p&&d.y===30);
    assert.deepEqual(footers.map(d=>d.text),[`Page ${i+1} of ${pages.length}`],'exactly one correctly numbered footer on every page');
  }
  const lines=new Map();for(const draw of result.draws){const key=`${draw.page}|${draw.y}`;lines.set(key,(lines.get(key)||'')+draw.text);}
  for(const marker of ['For Tenant:','For Landlord:']) {
    const matches=[...lines].filter(([,text])=>text.includes(marker));assert.equal(matches.length,1);
    const [p,yValue]=matches[0][0].split('|'),y=Number(yValue);
    assert.ok(y>=150,'signature region kept above footer');
    const below=result.draws.filter(d=>d.page===p&&d.y<y&&d.y>30);
    assert.ok(below.every(d=>y-d.y>=100),'signature has clear space before following heading or closing text');
  }
  await fs.writeFile(`${output}/representative-contract.pdf`,Buffer.from(result.pdf,'base64'));
  await fs.writeFile(`${output}/layout-geometry.json`,JSON.stringify(result.draws,null,2));
  for(const width of [1440,390]) {
    await page.setViewport({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const body=await page.evaluate(()=>document.body.innerText);
    assert.match(body,/empty checklist cannot complete move-in/);assert.match(body,/SIMULATED-R5-01/);assert.doesNotMatch(body,/empty checklist is complete/);
    const activate=await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Activate tenancy'))?.disabled);assert.equal(activate,true);
    await page.screenshot({path:`${output}/onboarding-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('R5_LAYOUT_BROWSER=PASS real_renderer signature_clearance every_page_number desktop mobile empty_denial ledger_readback');
} finally {await browser?.close();await vite?.close();await new Promise(r=>server?server.close(r):r());}
