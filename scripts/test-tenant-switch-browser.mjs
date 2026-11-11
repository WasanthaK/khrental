// Actual switcher and route policy, synthetic memberships only; no external API.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';

const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation} from 'react-router-dom';import {Toaster} from 'react-hot-toast';
import Switcher from '/src/components/common/TenantSwitcher.jsx';
import {useAuth} from '/src/hooks/useAuth';import {getDefaultLandingPath} from '/src/utils/accessPolicy.js';
import '/src/index.css';
function Shell(){const auth=useAuth(),location=useLocation();const landing=getDefaultLandingPath({user:auth.user,membership:auth.user.membership});
return <main style={{padding:24}}><h1>{location.pathname===landing?(landing==='/rentee'?'Renter dashboard':'Management dashboard'):'Access Denied'}</h1><Switcher compact/><p>Fixture organization: {auth.activeTenantId}</p></main>;}
function App(){const auth=useAuth();return <BrowserRouter key={auth.activeTenantId}><Shell/><Toaster/></BrowserRouter>;}
createRoot(document.getElementById('root')).render(<App/>);`;
const auth=`import React,{useState} from 'react';
const memberships=[{tenant_id:'manager',role:'admin',status:'active',tenant:{id:'manager',name:'Management fixture'}},{tenant_id:'renter',role:'rentee',status:'active',tenant:{id:'renter',name:'Renter fixture'}}];
let state,update;export function useAuth(){const [current,setCurrent]=useState(localStorage.getItem('tenant')||'manager');
state??=current;update??=setCurrent;const active=memberships.find(m=>m.tenant_id===state);
return {user:{role:'authenticated',tenantContextVerified:true,membership:active},activeTenant:active.tenant,activeTenantId:state,hasMultipleTenants:true,hasTenantAccess:true,isAuthenticated:true,isSwitchingTenant:false,memberships,
switchTenant:async id=>{const mode=new URLSearchParams(location.search).get('mode');if(mode==='failure')return {error:Error('Fixture switch unavailable')};
if(mode==='mismatch')return {data:{tenantContextVerified:true,membership:active}};
if(mode==='unverified')return {data:{tenantContextVerified:false,membership:memberships.find(m=>m.tenant_id===id)}};
localStorage.setItem('tenant',id);state=id;update(id);return {data:{role:'authenticated',tenantContextVerified:true,membership:memberships.find(m=>m.tenant_id===id)}};}};}`;
const plugin={name:'tenant-switch-fixture',enforce:'pre',resolveId(source,importer){
  if(source==='virtual:switch'){return '\0switch-entry.jsx';}
  if(source.endsWith('/hooks/useAuth')||source.endsWith('/hooks/useAuth.jsx')){return '\0switch-auth.jsx';}
},async load(id){
  if(id==='\0switch-entry.jsx'){return transformWithEsbuild(entry,'switch-entry.jsx',{loader:'jsx',jsx:'automatic'});}
  if(id==='\0switch-auth.jsx'){return transformWithEsbuild(auth,'switch-auth.jsx',{loader:'jsx',jsx:'automatic'});}
}};
let vite,server,browser;
try{
  vite=await createServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
  const app=express();app.use(vite.middlewares);app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module">import "virtual:switch";</script></body></html>')));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  await fs.mkdir('enquiry-browser-proof',{recursive:true});
  for(const width of [1440,390]){
    const context=await browser.createBrowserContext(),page=await context.newPage();page.setDefaultTimeout(15000);
    await page.setViewport({width,height:900});
    await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
    await page.goto(origin+'/dashboard',{waitUntil:'networkidle0'});
    await page.waitForSelector('select');
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.select('select','renter')]);
    assert.equal(new URL(page.url()).pathname,'/rentee');
    assert.match(await page.$eval('h1',e=>e.innerText),/Renter dashboard/);
    await page.screenshot({path:'enquiry-browser-proof/tenant-switch-renter-'+width+'.png',fullPage:true});
    await page.reload({waitUntil:'networkidle0'});assert.match(await page.$eval('h1',e=>e.innerText),/Renter dashboard/);
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.select('select','manager')]);
    assert.equal(new URL(page.url()).pathname,'/dashboard');
    assert.match(await page.$eval('h1',e=>e.innerText),/Management dashboard/);
    await page.screenshot({path:'enquiry-browser-proof/tenant-switch-admin-'+width+'.png',fullPage:true});
    for(const mode of ['failure','mismatch','unverified']){
      await page.goto(origin+'/dashboard?mode='+mode,{waitUntil:'networkidle0'});
      await page.select('select','renter');
      await page.waitForFunction(()=>document.body.innerText.includes('Fixture switch unavailable')||document.body.innerText.includes('We could not open this organization'));
      assert.equal(new URL(page.url()).pathname,'/dashboard');assert.match(await page.$eval('h1',e=>e.innerText),/Management dashboard/);
    }
    await context.close();
    console.log('TENANT_SWITCH_BROWSER=PASS viewport='+width+' admin_to_renter renter_to_admin reload failure mismatch unverified');
  }
}finally{await browser?.close();await vite?.close();if(server){await new Promise(r=>server.close(r));}}
