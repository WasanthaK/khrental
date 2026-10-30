// Actual application entry point; synthetic token/API only. No external requests.
import assert from 'node:assert/strict';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';

const token='b'.repeat(43);
const authFixture=`import React,{createContext,useContext,useEffect,useState} from 'react';
  const Context=createContext({loading:true,activeTenantId:null});
  export function AuthProvider({children}) {
    const [value,setValue]=useState({loading:true,activeTenantId:null});
    useEffect(()=>{let live=true;fetch('/fixture-auth').then(r=>r.json()).then(()=>{
      if(live)setValue({loading:false,activeTenantId:'fixture-owner-workspace',
        isAuthenticated:true,user:{id:'fixture-owner',role:'admin'}});
    });return()=>{live=false;};},[]);
    return React.createElement(Context.Provider,{value},children);
  }
  export const useAuth=()=>useContext(Context);`;
let vite,server,browser,releaseAuth;
let authRequests=0,redemptions=0,replyMode="password";
const generatedId='abcdefab-abcd-4abc-8abc-abcdefabcdef';
const plugin={name:'verification-bootstrap-fixture',enforce:'pre',resolveId(source,importer){
  if(!importer?.includes('/src/'))return;
  if(/\/hooks\/useAuth(?:\.jsx)?$/.test(source))return '\0verification-auth';
  if(source.endsWith('/components/contexts/SafePropertyProvider'))return '\0verification-properties';
},load(id){
  if(id==='\0verification-auth')return authFixture;
  if(id==='\0verification-properties')return 'export default function Provider({children}){return children;}';
}};
try {
  vite=await createViteServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
  const app=express();app.use(express.json());
  app.get('/fixture-auth',(req,res)=>{authRequests++;releaseAuth=()=>{if(!res.writableEnded)res.json({ok:true});};});
  app.post('/api/public-signup/redeem',(req,res)=>{
    redemptions++;
    assert.equal(req.body.token,token);
    assert.equal(req.get('authorization'),undefined);
    assert.equal(req.get('x-tenant-id'),undefined);
    if(replyMode==='password')return res.status(400).json({code:'SIGNUP_PASSWORD_INVALID'});
    if(replyMode==='unavailable')return res.status(503).json({code:'PUBLIC_SIGNUP_NOT_READY'});
    if(replyMode==='malformed')return res.status(201).json({data:{user:{id:generatedId,role:'authenticated',user_type:'seeker'},session:{access_token:'fixture-only',user:{id:'different-account'}}}});
    res.status(201).json({data:{user:{id:generatedId,role:'authenticated',user_type:'seeker'},session:{access_token:'fixture-only',user:{id:generatedId.toUpperCase()}}}});
  });
  app.get('/api/platform/auth/seeker-context',(req,res)=>{
    assert.equal(req.get('authorization'),'Bearer fixture-only');assert.equal(req.get('x-tenant-id'),undefined);
    res.json({data:{verified:true,eligible:true,userType:'seeker',tenantId:null}});
  });
  app.get('/api/platform/auth/context',(req,res)=>{
    assert.equal(req.get('authorization'),'Bearer fixture-owner-token');assert.equal(req.get('x-tenant-id'),undefined);
    res.json({data:{user:{id:'fixture-owner'}}});
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'Fixture denies all other API work'}));
  app.use(vite.middlewares);
  app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>window._env_={VITE_PUBLIC_SIGNUP_UI_ENABLED:"true"};</script><script type="module" src="/src/main.jsx"></script></body></html>')));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>console.error('VERIFICATION_FIXTURE_PAGE_ERROR='+error.message));
  await page.setRequestInterception(true);
  page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  await page.evaluateOnNewDocument(()=>{
    localStorage.setItem('verification-owner-marker','unchanged');
    localStorage.setItem('khrental.local.session',JSON.stringify({access_token:'fixture-owner-token',user:{id:'fixture-owner'}}));
    localStorage.setItem('khrental.activeTenantId','fixture-owner-workspace');
  });
  await page.goto(origin+'/verify-email#token='+token,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#seeker-password');
  assert.equal(new URL(page.url()).hash,'');
  // Before the fix auth hydration replaces the tenant-keyed router and loses
  // the already-scrubbed fragment. After the fix this provider never starts.
  if(releaseAuth){
    releaseAuth();
    await page.waitForFunction(()=>document.body.innerText.includes('missing or invalid'));
    console.log('VERIFICATION_AUTH_HYDRATION_REPRODUCED=token_lost_after_tenant_tree_remount');
  }
  assert.equal(await page.$('#seeker-password')!==null,true,'verification form must survive application initialization');
  assert.equal(authRequests,0,'verification must not start the owner auth/tenant shell');
  assert.equal(redemptions,0,'opening a link never redeems it');
  const stored=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},history:history.state}));
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.equal(stored.local['verification-owner-marker'],'unchanged');
  assert.ok((await page.$eval('#seeker-password-hint',e=>e.textContent)).includes('8 to 256'));
  await page.type('#seeker-password','Bird8!x');await page.type('#seeker-password-confirm','Bird8!x');
  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="alert"]');assert.equal(redemptions,0,'Too-short input never consumes a request or challenge');
  await page.type('#seeker-password','x');await page.type('#seeker-password-confirm','x');
  await page.click('button[type="button"]');
  assert.equal(await page.$eval('#seeker-password',e=>e.type),'text');
  await page.click('button[type="button"]');
  await page.click('button[type="submit"]');await page.waitForNetworkIdle({idleTime:200});
  assert.equal(redemptions,1);assert.ok((await page.$eval('[role="alert"]',e=>e.textContent)).includes('8 to 256'));
  replyMode='unavailable';await page.click('button[type="submit"]');
  await page.waitForFunction(()=>document.body.innerText.includes('you don’t need to request another link yet'));
  assert.equal(redemptions,2);
  replyMode='ok';await page.click('button[type="submit"]');
  await page.waitForFunction(()=>document.body.innerText.includes('Another account is open in this browser'));
  assert.equal(redemptions,3,'The same in-memory verification context survives policy/service retries');
  assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},history:history.state})),stored);
  // Leaving the isolated entry must boot the normal application, not keep
  // the completed verification component alive under a changed URL.
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('a[href="/login"]')]);
  assert.equal(new URL(page.url()).pathname,'/login');
  assert.equal(await page.$('#seeker-password'),null);
  if(releaseAuth)releaseAuth();
  await page.goto(origin+'/verify-email#token=short',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.innerText.includes('missing or invalid'));
  assert.equal(new URL(page.url()).hash,'');
  assert.equal(redemptions,3);
  replyMode='malformed';
  await page.goto(origin+'/verify-email#token='+token,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#seeker-password');
  await page.type('#seeker-password','Bird8!xx');await page.type('#seeker-password-confirm','Bird8!xx');
  await page.click('button[type="submit"]');
  await page.waitForFunction(()=>document.body.innerText.includes('Try signing in with the password you just chose'));
  assert.equal(await page.$('#seeker-password'),null,'An accepted setup must not offer another credential redemption');
  assert.equal(redemptions,4);
  assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},history:history.state})),stored,'A mismatched identity never changes the existing session');
  await page.evaluateOnNewDocument(()=>{history.replaceState=()=>{throw new Error('fixture scrub denied');};});
  await page.goto(origin+'/verify-email#token='+token,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.innerText.includes('missing or invalid'));
  assert.equal(await page.$('#seeker-password'),null);
  assert.equal(redemptions,4);
  console.log('SEEKER_VERIFICATION_BROWSER=PASS entry_isolation auth_hydration fragment_scrub explicit_redemption eight_character_policy inline_validation retry_same_link sql_uuid_casing accepted_setup_no_replay session_preservation full_navigation invalid_fragment scrub_failure');
} finally {
  if(releaseAuth)releaseAuth();
  if(browser)await browser.close();
  if(server)await new Promise(r=>server.close(r));
  if(vite)await vite.close();
}
