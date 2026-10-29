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
let authRequests=0,redemptions=0;
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
    res.status(201).json({data:{user:{role:'authenticated',user_type:'seeker'},session:{access_token:'fixture-only'}}});
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
  await page.evaluateOnNewDocument(()=>localStorage.setItem('verification-owner-marker','unchanged'));
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
  await page.type('#seeker-password','SyntheticFixtureOnly!');
  await page.type('#seeker-password-confirm','SyntheticFixtureOnly!');
  await page.click('button[type="submit"]');
  await page.waitForFunction(()=>document.body.innerText.includes('Your email has been verified'));
  assert.equal(redemptions,1);
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
  assert.equal(redemptions,1);
  await page.evaluateOnNewDocument(()=>{history.replaceState=()=>{throw new Error('fixture scrub denied');};});
  await page.goto(origin+'/verify-email#token='+token,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.innerText.includes('missing or invalid'));
  assert.equal(await page.$('#seeker-password'),null);
  assert.equal(redemptions,1);
  console.log('SEEKER_VERIFICATION_BROWSER=PASS entry_isolation auth_hydration fragment_scrub explicit_redemption session_preservation full_navigation invalid_fragment scrub_failure');
} finally {
  if(releaseAuth)releaseAuth();
  if(browser)await browser.close();
  if(server)await new Promise(r=>server.close(r));
  if(vite)await vite.close();
}
