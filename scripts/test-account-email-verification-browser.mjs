// Actual owner component and actual isolated verification entry; all API work
// is synthetic and external requests are blocked. No production mail is sent.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {createServer as createViteServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
import {createPublicSignupVerificationLink} from '../src/api/auth/publicSignupVerificationEmail.js';

const token='c'.repeat(43),challengeId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const authFixture=`import React from 'react';
  export const AuthProvider=({children})=>{fetch('/fixture-forbidden-auth');return children;};
  export const useAuth=()=>({loading:false,isAuthenticated:true,user:{id:'synthetic-existing-owner',email:'existing@example.test'}});`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
  import {BrowserRouter,Routes,Route} from 'react-router-dom';import OwnerSetup from '/src/pages/OwnerSetup.jsx';
  import '/src/index.css';createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><Routes>
  <Route path="/owner-start" element={<OwnerSetup/>}/><Route path="/dashboard/properties/new" element={<h1>First property setup fixture</h1>}/>
  </Routes></BrowserRouter></React.StrictMode>);`;
const plugin={name:'existing-verification-fixture',enforce:'pre',resolveId(source,importer){
  if(source.startsWith('\0existing-')){return source;}
  if(source==='virtual:existing-owner'){return '\0existing-owner.jsx';}
  if(!importer?.includes('/src/')){return;}
  if(/\/hooks\/useAuth(?:\.jsx)?$/.test(source)){return '\0existing-auth';}
  if(importer.endsWith('/pages/OwnerSetup.jsx')&&/\/services\/platformClient(?:\.js)?$/.test(source)){return '\0existing-platform';}
},async load(id){
  if(id==='\0existing-owner.jsx'){return transformWithEsbuild(entry,'existing-owner.jsx',{loader:'jsx',jsx:'automatic'});}
  if(id==='\0existing-auth'){return authFixture;}
  if(id==='\0existing-platform'){return `export const getPlatformClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'synthetic-existing-token',user:{id:'synthetic-existing-owner'}}}}),setActiveTenant:async()=>({})}});`;}
}};
let vite,server,browser,verified=false,sends=0,redeems=0,forbiddenAuth=0,lastRequestId;
try{
  vite=await createViteServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
  const app=express();app.use(express.json());
  app.get('/fixture-forbidden-auth',(_req,res)=>{forbiddenAuth++;res.sendStatus(500);});
  app.post('/api/platform/owner-setup',(req,res)=>{
    assert.equal(req.get('authorization'),'Bearer synthetic-existing-token');
    assert.equal(req.body.name,'Synthetic owner draft');assert.equal(req.body.country,'BN');
    if(lastRequestId){assert.equal(req.body.requestId,lastRequestId);}lastRequestId=req.body.requestId;
    if(!verified){return res.status(403).json({code:'OWNER_VERIFICATION_REQUIRED',error:'Verify your email before setting up a property workspace.'});}
    res.status(201).json({data:{id:workspaceId,testing:true}});
  });
  app.post('/api/public-signup/account-challenge',(req,res)=>{
    sends++;assert.equal(req.get('authorization'),'Bearer synthetic-existing-token');
    assert.deepEqual(req.body,{country:'BN'});
    if(sends===1){return res.status(503).json({error:'Synthetic mail outage. Try again.'});}
    res.json({data:{accepted:true,message:'Verification email requested. Check your inbox and spam folder.'}});
  });
  app.post('/api/public-signup/account-redeem',(req,res)=>{
    redeems++;assert.equal(req.get('authorization'),undefined);assert.equal(req.get('x-tenant-id'),undefined);
    assert.deepEqual(req.body,{token,challengeId});
    if(redeems===1){return res.status(503).json({error:'Synthetic temporary verification error. Please retry.'});}
    verified=true;res.json({data:{verified:true}});
  });
  app.use('/api',(_req,res)=>res.sendStatus(404));app.use(vite.middlewares);
  app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>window._env_={VITE_PUBLIC_SIGNUP_UI_ENABLED:"true"};</script><script type="module" src="'+(req.path==='/verify-email'?'/src/main.jsx':'/@id/__x00__existing-owner.jsx')+'"></script></body></html>')));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();page.setDefaultTimeout(20000);
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  await page.evaluateOnNewDocument(()=>{
    localStorage.setItem('khrental.local.session','synthetic-existing-session-preserved');
    localStorage.setItem('khrental.activeTenantId','synthetic-existing-workspace-preserved');
  });
  await page.setViewport({width:1365,height:900});
  await page.goto(origin+'/owner-start?country=BN',{waitUntil:'networkidle0'});
  await page.type('#owner-workspace','Synthetic owner draft');
  await page.click('button[type="submit"]');await page.waitForSelector('section[aria-label="Verify your existing account"]');
  await page.click('button[type="button"]');await page.waitForFunction(()=>document.body.innerText.includes('Synthetic mail outage'));
  assert.equal(await page.$eval('#owner-workspace',e=>e.value),'Synthetic owner draft');
  await page.click('button[type="button"]');await page.waitForFunction(()=>document.body.innerText.includes('Verification email requested'));
  await fs.mkdir('enquiry-browser-proof',{recursive:true});
  await page.screenshot({path:'enquiry-browser-proof/existing-owner-send-desktop.png',fullPage:true});
  await page.setViewport({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Owner verification must fit mobile');
  await page.screenshot({path:'enquiry-browser-proof/existing-owner-send-mobile.png',fullPage:true});
  await page.reload({waitUntil:'networkidle0'});
  assert.equal(await page.$eval('#owner-workspace',e=>e.value),'Synthetic owner draft');
  assert.equal(await page.$eval('#owner-country',e=>e.value),'BN');
  const storageBefore=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
  const link=createPublicSignupVerificationLink({token,accountChallenge:challengeId,ownerCountry:'BN',baseUrl:origin});
  await page.goto(link,{waitUntil:'networkidle0'});await page.waitForSelector('button[type="submit"]');
  assert.equal(new URL(page.url()).hash,'');assert.equal(redeems,0);assert.equal(forbiddenAuth,0);
  assert.equal(await page.$('input[type="password"]'),null,'Existing verification never asks for a password');
  assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),storageBefore);
  await page.click('button[type="submit"]');await page.waitForFunction(()=>document.body.innerText.includes('Synthetic temporary verification error'));
  await page.click('button[type="submit"]');await page.waitForFunction(()=>document.body.innerText.includes('Email verified'));
  assert.equal(redeems,2);assert.equal(forbiddenAuth,0);
  assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),storageBefore);
  await page.screenshot({path:'enquiry-browser-proof/existing-owner-verified-mobile.png',fullPage:true});
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click('a[href="/owner-start?country=BN"]')]);
  assert.equal(await page.$eval('#owner-workspace',e=>e.value),'Synthetic owner draft');
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click('button[type="submit"]')]);
  assert.equal(new URL(page.url()).pathname,'/dashboard/properties/new');
  assert.ok((await page.$eval('body',e=>e.innerText)).includes('First property setup fixture'));
  console.log('ACCOUNT_EMAIL_VERIFICATION_BROWSER=PASS existing_owner_send retry draft_reload country request_identity token_scrub explicit_verification no_password no_account_switch isolated_entry desktop_mobile first_property_continuation');
}finally{await browser?.close();await new Promise(r=>server?server.close(r):r());await vite?.close();}
