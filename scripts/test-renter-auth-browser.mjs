// Real AuthProvider lifecycle with synthetic sessions; no external account or API.
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';

const authModule=`
  const listeners=new Set();
  const user=id=>({id,email:id+'@example.test',role:'authenticated'});
  const session=id=>({access_token:'fixture-'+id,user:user(id)});
  const state=window.authFixture={session:session('account-a'),holdProfile:null,releaseProfile:null};
  const emit=()=>listeners.forEach(f=>f('FIXTURE',state.session));
  const auth={getSession:async()=>({data:{session:state.session}}),
    onAuthStateChange:callback=>{listeners.add(callback);return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}};},
    getTenantContext:async()=>({data:{tenantId:null,membership:null,memberships:[]}})};
  export const getPlatformClient=()=>({auth});
  export const signIn=async id=>{state.session=session(id);emit();return {data:{user:state.session.user,session:state.session}};};
  export const signOut=async()=>{state.session=null;emit();return {};};
  export const getCurrentUser=async()=>({data:{user:state.session?.user||null}});
  export const signUp=async()=>({});export const resetPassword=async()=>({});export const updatePassword=async()=>({});
`;
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {AuthProvider,useAuth} from '/src/hooks/useAuth.jsx';
  function Status(){const auth=useAuth();return <section>
    <output id="auth-state" data-id={auth.user?.id||''} data-loading={String(auth.loading)}>{auth.user?.id||'Signed out'}</output>
    <button onClick={()=>auth.login('account-a','FixtureOnly!')}>Sign in A</button>
    <button onClick={()=>auth.login('account-b','FixtureOnly!')}>Sign in B</button>
    <button onClick={()=>auth.logout()}>Sign out</button>
    <button id="retry-context" onClick={()=>auth.refreshTenantContext()}>Retry workspace lookup</button>
  </section>;}
  function Harness(){const [key,setKey]=useState(0);return <><button id="remount" onClick={()=>setKey(n=>n+1)}>Remount app</button><AuthProvider key={key}><Status/></AuthProvider></>;}
  createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);`;
const plugin={name:'renter-auth-fixture',enforce:'pre',resolveId(source,importer){
  if(source==='virtual:renter-auth')return '\0renter-auth-entry.jsx';
  if(!importer?.endsWith('/src/hooks/useAuth.jsx'))return;
  if(source.endsWith('/services/platformClient'))return '\0renter-auth-platform';
  if(source.endsWith('/services/mssqlApiClient'))return '\0renter-auth-mssql';
  if(source.endsWith('/utils/env'))return '\0renter-auth-env';
},load(id){
  if(id==='\0renter-auth-entry.jsx')return {code:entry,loader:'jsx'};
  if(id==='\0renter-auth-platform')return authModule;
  if(id==='\0renter-auth-env')return 'export const isDevBypassEnabled=()=>false;';
  if(id==='\0renter-auth-mssql')return `export const isMssqlApiEnabled=()=>true;
    export const requestMssqlApi=async(_path,options)=>{
      const id=options.headers['x-auth-id'];
      if(window.authFixture.holdProfile===id)await new Promise(resolve=>{
        const state=window.authFixture;state.releases??=[];state.releases.push(resolve);
        state.releaseProfile=()=>state.releases.splice(0).forEach(release=>release());
      });
      return {id:'profile-'+id,role:'authenticated',user_type:'seeker'};
    };`;
}};
let vite,server,browser;
try {
  const {transformWithEsbuild}=await import('vite');
  const originalLoad=plugin.load;
  plugin.load=async id=>id==='\0renter-auth-entry.jsx'?transformWithEsbuild(entry,'renter-auth-entry.jsx',{loader:'jsx',jsx:'automatic'}):originalLoad(id);
  vite=await createServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
  const app=express();app.use(vite.middlewares);
  app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,
    '<html><body><div id="root"></div><script type="module">import "virtual:renter-auth";</script></body></html>')));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',e=>console.error('AUTH_FIXTURE_ERROR='+e.message));
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  await page.goto(origin,{waitUntil:'networkidle0'});
  await page.waitForSelector('#auth-state[data-id="account-a"][data-loading="false"]');
  await page.click('#remount');
  await page.waitForSelector('#auth-state[data-loading="false"]');
  assert.equal(await page.$eval('#auth-state',e=>e.dataset.id),'account-a',
    'A valid same-account session must hydrate after a provider remount instead of returning to sign-in');
  // A delayed response for A must not replace the newer signed-in B.
  await page.evaluate(()=>{window.authFixture.holdProfile='account-a';});
  await page.click('#remount');
  await page.waitForFunction(()=>typeof window.authFixture.releaseProfile==='function');
  await page.click('::-p-text(Sign in B)');
  await page.waitForSelector('#auth-state[data-id="account-b"][data-loading="false"]');
  await page.evaluate(()=>{window.authFixture.releaseProfile();window.authFixture.holdProfile=null;});
  await page.waitForNetworkIdle({idleTime:300});
  assert.equal(await page.$eval('#auth-state',e=>e.dataset.id),'account-b');
  // A retry started by B must not replace A after an account change.
  await page.evaluate(()=>{window.authFixture.holdProfile='account-b';window.authFixture.releaseProfile=null;});
  await page.click('#retry-context');
  await page.waitForFunction(()=>typeof window.authFixture.releaseProfile==='function');
  await page.click('::-p-text(Sign in A)');
  await page.waitForSelector('#auth-state[data-id="account-a"][data-loading="false"]');
  await page.evaluate(()=>{window.authFixture.releaseProfile();window.authFixture.holdProfile=null;});
  await page.waitForNetworkIdle({idleTime:300});
  assert.equal(await page.$eval('#auth-state',e=>e.dataset.id),'account-a','Old workspace retry cannot overwrite the newer account');
  // Also guard the explicit login path's outstanding profile request.
  await page.evaluate(()=>{window.authFixture.holdProfile='account-a';window.authFixture.releaseProfile=null;});
  await page.click('::-p-text(Sign in A)');
  await page.waitForFunction(()=>typeof window.authFixture.releaseProfile==='function');
  await page.click('::-p-text(Sign out)');
  await page.waitForSelector('#auth-state[data-id=""][data-loading="false"]');
  await page.evaluate(()=>{window.authFixture.releaseProfile();window.authFixture.holdProfile=null;});
  await page.waitForNetworkIdle({idleTime:300});
  assert.equal(await page.$eval('#auth-state',e=>e.dataset.id),'');
  console.log('RENTER_AUTH_BROWSER=PASS same_account_provider_remount delayed_old_identity late_login_after_logout');
} finally {
  await browser?.close();await vite?.close();
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
}
