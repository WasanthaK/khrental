// Real React enquiry/login/inbox components and router, isolated synthetic API.
// External requests are blocked. No production account, enquiry or email is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';

const listingId='11111111-1111-4111-8111-111111111111';
const enquiryId='22222222-2222-4222-8222-222222222222';
const fixtureAuth=`import {useEffect,useState} from 'react';
  let signedIn=false;const listeners=new Set();
  export const getSession=async()=>({data:{session:signedIn?{access_token:'synthetic-proof-token',user:{id:'synthetic-auth'}}:null}});
  export const useAuth=()=>{const [,render]=useState(0);useEffect(()=>{const f=()=>render(x=>x+1);listeners.add(f);return()=>listeners.delete(f);},[]);
    return {user:signedIn?{id:'synthetic-auth'}:null,isAuthenticated:signedIn,loading:false,activeTenantId:'synthetic-workspace',
      login:async()=>{signedIn=true;listeners.forEach(f=>f());return {data:{user:{id:'synthetic-auth'}}};},setDevBypass:()=>{}};};`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
  import {BrowserRouter,Routes,Route} from 'react-router-dom';
  import PropertyEnquiry from '/src/pages/PropertyEnquiry.jsx';
  import OwnerEnquiries from '/src/pages/OwnerEnquiries.jsx';
  import Login from '/src/pages/Login.jsx';
  import '/src/index.css';
  createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
    <Route path="/enquire" element={<PropertyEnquiry/>}/><Route path="/login" element={<Login/>}/>
    <Route path="/dashboard/enquiries" element={<OwnerEnquiries/>}/></Routes></BrowserRouter>);`;
const plugin={name:'isolated-enquiry-fixture',enforce:'pre',resolveId(source,importer){
  if(source.startsWith('\0enquiry-')){return source;}
  if(source==='virtual:enquiry-proof'){return '\0enquiry-proof.jsx';}
  if(!importer?.includes('/src/')){return;}
  if(source.endsWith('/hooks/useAuth')){return '\0enquiry-auth';}
  if(source.endsWith('/services/platformClient')){return '\0enquiry-platform';}
  if(source.endsWith('/services/mssqlApiClient')){return '\0enquiry-mssql';}
  if(source.endsWith('/utils/env')||source.endsWith('/utils/env.js')){return '\0enquiry-env';}
},load(id){
  if(id==='\0enquiry-proof.jsx'){return entry;}
  if(id==='\0enquiry-auth'){return fixtureAuth;}
  if(id==='\0enquiry-platform'){return `import {getSession} from '\0enquiry-auth';export const getPlatformClient=()=>({auth:{getSession}});`;}
  if(id==='\0enquiry-env'){return `export const isDevBypassEnabled=()=>false;export const isPublicSeekerLandingEnabled=()=>true;export const isPublicSignupUiEnabled=()=>false;export const isPropertyEnquiriesEnabled=()=>!location.search.includes('off=1');`;}
  if(id==='\0enquiry-mssql'){return `export const requestMssqlApi=async(path,options={})=>{const r=await fetch(path,{method:options.method||'GET',headers:{'Content-Type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const p=await r.json();if(!r.ok)throw new Error(p.error);return p.data;};`;}
}};
let vite,browser,server;let row=null,submissions=0,ownerWrites=0,failNext=false;
try {
  vite=await createViteServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
  const app=express();app.use(express.json());
  app.get('/api/public-listings/:id',(req,res)=>res.json({data:{id:listingId,country:'LK',title:'Synthetic rental',location:'General location'}}));
  app.get('/api/platform/auth/seeker-context',(req,res)=>res.json({data:{verified:true,eligible:true,userType:'seeker',tenantId:null}}));
  app.get('/api/property-enquiries',(req,res)=>res.json({data:{items:row?[row]:[],hasMore:false}}));
  app.post('/api/property-enquiries',(req,res)=>{
    submissions++;
    assert.equal(req.get('authorization'),'Bearer synthetic-proof-token');
    assert.equal(req.get('x-tenant-id'),undefined);
    assert.equal(req.body.listingId,listingId);assert.equal(req.body.consent,true);
    if(failNext){failNext=false;return res.status(503).json({error:'Temporarily unavailable. Retry your enquiry.'});}
    row={id:enquiryId,listingId,country:'LK',title:'Synthetic rental',message:req.body.message,
      status:'pending',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),response:null};
    res.status(201).json({data:row});
  });
  app.get('/api/owner-enquiries',(req,res)=>res.json({data:{items:row?[{...row,propertyId:listingId,seekerName:'Synthetic seeker',seekerEmail:'seeker@example.test'}]:[],hasMore:false}}));
  app.patch('/api/owner-enquiries/:id',(req,res)=>{ownerWrites++;row={...row,status:req.body.status,response:req.body.response,version:row.version+1};res.json({data:row});});
  app.patch('/api/property-enquiries/:id',(req,res)=>{row={...row,status:'withdrawn',version:row.version+1};res.json({data:row});});
  app.use(vite.middlewares);
  app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,
    '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/__x00__enquiry-proof.jsx"></script></body></html>')));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  await page.setViewport({width:1280,height:900});
  await page.goto(origin+'/enquire?listingId='+listingId+'&country=LK',{waitUntil:'networkidle0'});
  await page.waitForSelector('a[href^="/login?listingId="]');
  await page.click('a[href^="/login?listingId="]');
  await page.waitForSelector('#email-address');
  await page.type('#email-address','seeker@example.test');await page.type('#password','SyntheticFixtureOnly!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('textarea');
  assert.equal(new URL(page.url()).searchParams.get('listingId'),listingId);
  await page.type('textarea','May I arrange a viewing?');
  assert.equal(await page.$eval('form button',e=>e.disabled),true);
  await page.click('input[type="checkbox"]');failNext=true;
  await page.click('form button');await page.waitForSelector('[role="alert"]');
  assert.match(await page.$eval('[role="alert"]',e=>e.textContent),/Temporarily unavailable/);
  await page.click('form button');await page.waitForFunction(()=>document.body.innerText.includes('Your enquiry was saved'));
  assert.equal(submissions,2);assert.equal(row.status,'pending');
  const ownerPage=await browser.newPage();
  await ownerPage.setRequestInterception(true);
  ownerPage.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  await ownerPage.goto(origin+'/dashboard/enquiries',{waitUntil:'networkidle0'});
  await ownerPage.waitForSelector('textarea');await ownerPage.type('textarea','Please suggest a convenient time.');
  await ownerPage.click('article button');
  await ownerPage.waitForFunction(()=>document.body.innerText.includes('Enquiry updated'));
  assert.equal(ownerWrites,1);assert.equal(row.status,'responded');
  await page.click('::-p-text(Refresh responses)');
  await page.waitForFunction(()=>document.body.innerText.includes('Please suggest a convenient time.'));
  await page.setViewport({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout must fit viewport');
  const output=process.env.ENQUIRY_PROOF_DIR||'/tmp/quixo-enquiry-browser-proof';
  await fs.mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'seeker-enquiry.png'),fullPage:true});
  await ownerPage.screenshot({path:path.join(output,'owner-inbox.png'),fullPage:true});
  await page.click('::-p-text(Withdraw enquiry)');
  await page.waitForFunction(()=>document.body.innerText.includes('Enquiry withdrawn.'));
  assert.equal(row.status,'withdrawn');
  await page.goto(origin+'/enquire?off=1',{waitUntil:'networkidle0'});
  assert.match(await page.$eval('body',e=>e.innerText),/not open yet/);
  assert.equal(await page.$('textarea'),null);
  assert.deepEqual(errors,[]);
  console.log('PROPERTY_ENQUIRIES_BROWSER=PASS listing_login_return consent retry inbox_reply mobile withdrawal default_off');
} finally {
  await browser?.close();await vite?.close();
  if(server){await new Promise(r=>server.close(r));}
}
