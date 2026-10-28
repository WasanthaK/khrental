// Real offer/history React components with an isolated synthetic API. No external
// account, signature, mail, billing or production rental decision is performed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {createServer as createViteServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
import {parseOfferAction} from '../src/api/enquiries/offerContract.js';
const id='22222222-2222-4222-8222-222222222222',templateId='33333333-3333-4333-8333-333333333333',agreementId='44444444-4444-4444-8444-444444444444';
const enquiry={id,title:'Synthetic rental',country:'LK',status:'responded',message:'Synthetic enquiry',response:'Synthetic reply'};
let offer=null,open=true,failNext=false,pendingRead=null,releaseRead=null,readStarted=null;
const requests=new Map();
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
 import PropertyOffer from '/src/components/properties/PropertyOffer.jsx';import RentalJourney from '/src/pages/RentalJourney.jsx';import '/src/index.css';
 const enquiry=${JSON.stringify(enquiry)};
 const call=async({path,method='GET',body})=>{const r=await fetch('/api/owner-enquiries'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok)throw Object.assign(new Error(p.error),{code:p.code});return p.data;};
 createRoot(document.getElementById('root')).render(<BrowserRouter>{location.pathname==='/owner'?<div className="max-w-3xl m-auto p-5"><PropertyOffer enquiry={enquiry} owner call={call}/></div>:<RentalJourney/>}</BrowserRouter>);`;
const plugin={name:'rental-offer-fixture',enforce:'pre',resolveId(source,importer){
 if(source.startsWith('\0rental-'))return source;
 if(source==='virtual:rental-proof')return '\0rental-proof.jsx';
 if(!importer?.includes('/src/'))return;
 if(source.endsWith('/hooks/useAuth'))return '\0rental-auth';
 if(source.endsWith('/services/platformClient'))return '\0rental-platform';
},async load(id){
 if(id==='\0rental-proof.jsx')return transformWithEsbuild(entry,'rental-proof.jsx',{loader:'jsx',jsx:'automatic'});
 if(id==='\0rental-auth')return `export const useAuth=()=>({user:{id:'synthetic-verified-identity'},isAuthenticated:true,loading:false});`;
 if(id==='\0rental-platform')return `export const getPlatformClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'synthetic-only'}}})}});`;
}};
let vite,server,browser,page;
const snapshot=()=>({offer,actionsEnabled:open,applicationAccepted:true,applicationVersion:1,units:[],templates:[{id:templateId,name:'Synthetic template',version:1}],agreement:offer?.agreementId?{id:agreementId,status:'draft',signatureStatus:null}:null});
try{
 vite=await createViteServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
 const app=express();app.use(express.json());
 app.get('/api/property-enquiries/journey',(req,res)=>res.json({data:{items:[enquiry],hasMore:false}}));
 app.get(['/api/owner-enquiries/:id/offer','/api/property-enquiries/:id/offer'],async(req,res)=>{
  const data=structuredClone(snapshot());
  if(pendingRead){const notify=readStarted;readStarted=null;pendingRead=false;notify?.();await new Promise(resolve=>{releaseRead=resolve;});}
  res.json({data});
 });
 app.post(['/api/owner-enquiries/:id/offer','/api/property-enquiries/:id/offer'],(req,res)=>{
  const owner=req.path.startsWith('/api/owner');
  try{
   const input=parseOfferAction(req.body,owner);
   if(failNext){failNext=false;return res.status(503).json({error:'Synthetic retryable failure'});}
   if(requests.has(input.requestId)){assert.equal(requests.get(input.requestId),input.payloadHash);return res.json({data:snapshot()});}
   assert.equal(input.version,offer?.version??0);
   if(input.action==='issue'){offer={...input,status:'offered',currency:'LKR',unitLabel:null,applicationVersion:1,version:(offer?.version??0)+1};}
   else if(input.action==='accept'){assert.equal(input.consent,true);offer={...offer,status:'accepted',version:offer.version+1,acceptedAt:new Date().toISOString()};}
   else if(input.action==='agreement'){offer={...offer,status:'agreement',agreementId,version:offer.version+1};}
   else{offer={...offer,status:input.action==='decline'?'declined':'withdrawn',version:offer.version+1};}
   requests.set(input.requestId,input.payloadHash);res.json({data:snapshot()});
  }catch(error){res.status(409).json({error:error.message});}
 });
 app.use(vite.middlewares);app.use(async(req,res,next)=>{
  if(req.method!=='GET')return next();res.type('html').send(await vite.transformIndexHtml(req.originalUrl,'<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module" src="/@vite/client"></script><script type="module">import "virtual:rental-proof";</script></body></html>'));
 });
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await puppeteer.launch({headless:true,protocolTimeout:20000,args:['--no-sandbox','--disable-dev-shm-usage']});
 page=await browser.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
 const click=async text=>{await page.evaluate(text=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);if(!b)throw new Error('Missing button '+text);b.click();},text);};
 const fill=async(selector,value)=>page.$eval(selector,(e,value)=>{Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await page.setViewport({width:1280,height:1000});await page.goto(origin+'/owner',{waitUntil:'networkidle0'});
 await page.waitForSelector('[id$="-rent"]');
 for(const [key,value] of Object.entries({rent:'100.00',deposit:'200.00',fees:'0',startDate:'2027-01-01',endDate:'2028-01-01',offerUntil:'2026-11-01T12:00',holdUntil:'2026-11-02T12:00',terms:'Exact rental terms. The reservation ends at the stated deadline.'})){await fill('[id$="-'+key+'"]',value);}
 failNext=true;await click('Issue rental offer');await page.waitForSelector('[role="alert"]');await click('Issue rental offer');
 await page.waitForFunction(()=>document.body.innerText.includes('Offer version 1'));
 assert.equal(offer.offerUntil,'2026-11-01T06:30:00.000Z','Property-local deadline is independent of browser timezone');
 await page.goto(origin+'/rental-journey',{waitUntil:'networkidle0'});await page.waitForSelector('input[type="checkbox"]');
 assert.equal(await page.$$eval('button',bs=>bs.find(b=>b.textContent==='Accept offer and reserve').disabled),true);
 await page.click('input[type="checkbox"]');await click('Accept offer and reserve');await page.waitForFunction(()=>document.body.innerText.includes('Offer version 2'));
 assert.equal(offer.status,'accepted');assert.equal(offer.agreementId,undefined,'Acceptance is not an agreement or signature');
 await page.goto(origin+'/owner',{waitUntil:'networkidle0'});await page.waitForSelector('[id$="-template"]');await page.select('[id$="-template"]',templateId);
 await click('Prepare agreement for existing account');await page.waitForSelector('a[href$="/onboarding"]');assert.equal(offer.status,'agreement');
 await page.goto(origin+'/rental-journey',{waitUntil:'networkidle0'});await page.waitForSelector('a[href="/rentee/agreements"]');
 await page.setViewport({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await fs.mkdir('enquiry-browser-proof',{recursive:true});await page.screenshot({path:'enquiry-browser-proof/rental-offer-to-agreement.png',fullPage:true});
 // A stale response cannot paint a pre-withdrawal offer over the new version.
 pendingRead=true;const started=new Promise(resolve=>{readStarted=resolve;});await click('Refresh rental offer');await started;
 await click('Withdraw offer or reservation');await page.waitForFunction(()=>document.body.innerText.includes('Offer version 4'));
 releaseRead();await new Promise(resolve=>setTimeout(resolve,200));assert.equal(await page.evaluate(()=>document.body.innerText.includes('withdrawn')),true);
 open=false;await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$('input[type="checkbox"]'),null);
 assert.deepEqual(errors,[]);
 console.log('RENTAL_OFFERS_BROWSER=PASS exact_terms market_deadlines consent retry acceptance_no_signature existing_account_agreement onboarding_links mobile withdrawal delayed_refresh rollback_readonly');
}catch(error){if(page){await fs.mkdir('enquiry-browser-proof',{recursive:true});await page.screenshot({path:'enquiry-browser-proof/rental-offer-failure.png',fullPage:true}).catch(()=>{});}throw error;}
finally{releaseRead?.();await browser?.close();await vite?.close();await new Promise(resolve=>server?server.close(resolve):resolve());}
