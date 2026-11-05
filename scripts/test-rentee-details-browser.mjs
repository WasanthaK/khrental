// Render the real renter detail cards with disposable data; no live sessions/API.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {createServer, transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
const source=await fs.readFile('src/pages/RenteeDetails.jsx','utf8');
const cards=source.slice(source.indexOf('const AgreementSummaryCard ='),source.indexOf('const RenteeDetails ='));
assert.ok(cards.includes('const RenteePropertyCard'));
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const imagePath=`/storage/images/tenants/${tenant}/properties/fixture.jpg`;
const entry=`import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Link} from 'react-router-dom';import {formatDate,formatAgreementRent} from '/src/utils/helpers.js';import {getPrimaryPropertyImageUrl,propertyImageDisplayUrl} from '/src/utils/propertyDetailFields.js';import '/src/index.css';
${cards}
const cases=['LKR','BND','missing','malformed'];
createRoot(document.getElementById('root')).render(<BrowserRouter><main className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">{cases.map((currency,i)=>{
 const agreement={id:'fixture-'+i,propertyid:'p',status:'active',rentamount:i===1?0:125000,terms:currency==='malformed'?'broken':JSON.stringify(currency==='missing'?{}:{currency}),startdate:'2026-12-02',enddate:'2027-12-01'};
 const property={id:'p',tenant_id:'${tenant}',name:'Demo home '+currency,address:'Demo location',propertytype:'house',status:'rented',images:i===2?[]:i===3?[{image_url:'/missing-image.jpg'}]:i===1?JSON.stringify([{image_url:'${imagePath}'}]):[{image_url:'https://khrental-app.proudpebble-f58b5187.southeastasia.azurecontainerapps.io${imagePath}',order:0}]};
 return <section key={currency} data-case={currency} className="min-w-0 space-y-3"><h1>{currency}</h1><RenteePropertyCard property={property} agreement={agreement}/><AgreementSummaryCard agreement={agreement} property={property}/></section>;
})}</main></BrowserRouter>);`;
let vite,server,browser;
try {
 const plugin={name:'rentee-detail-proof',resolveId(id){if(id==='virtual:rentee-detail')return '\0rentee-detail.jsx';},load(id){if(id==='\0rentee-detail.jsx')return transformWithEsbuild(entry,'rentee-detail.jsx',{loader:'jsx',jsx:'automatic'});}};
 vite=await createServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
 const app=express();
 app.get(imagePath,(_req,res)=>res.type('png').send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8N8AAAAASUVORK5CYII=','base64')));
 app.get('/missing-image.jpg',(_req,res)=>res.sendStatus(404));
 app.use(vite.middlewares);app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import "virtual:rentee-detail";</script></body></html>')));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
 await fs.mkdir('r5-browser-proof',{recursive:true});
 for(const width of [1440,390]) {
  await page.setViewport({width,height:1000});await page.goto(origin,{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.querySelectorAll('[data-case] img').length===2&&[...document.querySelectorAll('[data-case] img')].every(i=>i.complete&&i.naturalWidth>0));
  const text=await page.$eval('[data-case="LKR"]',e=>e.innerText);assert.match(text,/LKR\s125,000\.00/);assert.ok(!text.includes('$'));
  assert.match(await page.$eval('[data-case="BND"]',e=>e.innerText),/BND\s0\.00/);
  for(const kind of ['missing','malformed']){const body=await page.$eval(`[data-case="${kind}"]`,e=>e.innerText);assert.match(body,/currency not recorded/);assert.doesNotMatch(body,/LKR|BND|\$/);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok((await page.$$eval('img',images=>images.map(i=>i.getAttribute('src')))).every(s=>s===imagePath));
  await page.screenshot({path:`r5-browser-proof/rentee-detail-${width}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('RENTEE_DETAIL_BROWSER=PASS LKR BND zero missing malformed protected_photo object_json failed_image_fallback desktop mobile');
} finally {await browser?.close();await vite?.close();await new Promise(r=>server?server.close(r):r());}
