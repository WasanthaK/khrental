// Actual AuthProvider, Login, route guards and owner entry. Destination pages
// and API responses are synthetic; no external account, email or tenant write.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';

const tenantId='11111111-1111-4111-8111-111111111111';
const cases=[
  {email:'owner-a@example.test',role:'admin',member:'admin',path:'/dashboard/properties'},
  {email:'owner-b@example.test',role:'authenticated',member:'admin',path:'/dashboard/properties'},
  {email:'staff@example.test',role:'authenticated',member:'staff',path:'/dashboard/properties'},
  {email:'tenant@example.test',role:'authenticated',member:'rentee',path:'/rentee'},
  {email:'new-owner@example.test',role:'authenticated',member:null,path:'/owner-start?country=BN'},
  {email:'seeker@example.test',role:'authenticated',member:null,path:'/seeker'}
].map((x,i)=>({...x,id:`22222222-2222-4222-8222-${String(i+1).padStart(12,'0')}`,profileId:`33333333-3333-4333-8333-${String(i+1).padStart(12,'0')}`}));
const authModule=`const listeners=new Set();
  const stored=JSON.parse(localStorage.getItem('fixture-session')||'null');let session=stored;
  const emit=()=>listeners.forEach(f=>f('FIXTURE',session));
  const auth={getSession:async()=>({data:{session}}),
    onAuthStateChange:callback=>{listeners.add(callback);return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}};},
    getTenantContext:async()=>({data:await fetch('/fixture/context',{headers:{Authorization:'Bearer '+session?.access_token}}).then(r=>r.json())})};
  export const getPlatformClient=()=>({auth});
  export const signIn=async(email,password)=>{const r=await fetch('/fixture/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const result=await r.json();session=result.data.session;localStorage.setItem('fixture-session',JSON.stringify(session));emit();return result;};
  export const getCurrentUser=async()=>session?.user;export const signOut=async()=>({});
  export const signUp=async()=>({});export const resetPassword=async()=>({});export const updatePassword=async()=>({});`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
  import {AuthProvider} from '/src/hooks/useAuth.jsx';import AppRouter from '/src/routes.jsx';import '/src/index.css';
  createRoot(document.getElementById('root')).render(<React.StrictMode><AuthProvider><AppRouter/></AuthProvider></React.StrictMode>);`;
const plugin={name:'returning-owner-proof',enforce:'pre',resolveId(source,importer){
  if(source.startsWith('\0returning-')){return source;}
  if(!importer?.includes('/src/')){return;}
  if(/\/(?:hooks\/useAuth\.jsx|pages\/Login\.jsx|pages\/OwnerSetup\.jsx|components\/auth\/VerifiedSeekerBoundary\.jsx)$/.test(importer)&&/\/services\/platformClient(?:\.js)?$/.test(source)){return '\0returning-platform';}
  if(importer.endsWith('/hooks/useAuth.jsx')&&source.endsWith('/services/mssqlApiClient')){return '\0returning-mssql';}
  if(importer.endsWith('/routes.jsx')&&/\/components\/layouts\//.test(source)){return '\0returning-layout.jsx';}
  if(importer.endsWith('/routes.jsx')&&/\/pages\/(?:PropertyList|Dashboard|rentee\/RenteePortal)$/.test(source)){return '\0returning-destination.jsx';}
  if(importer.endsWith('/auth/VerifiedSeekerBoundary.jsx')&&source.endsWith('/pages/SeekerHome')){return '\0returning-destination.jsx';}
},async load(id){
  if(id==='\0returning-entry.jsx'){return transformWithEsbuild(entry,'returning-entry.jsx',{loader:'jsx',jsx:'automatic'});}
  if(id==='\0returning-platform'){return authModule;}
  if(id==='\0returning-layout.jsx'){return `import React from 'react';import {Outlet} from 'react-router-dom';export default ()=>React.createElement(Outlet);`;}
  if(id==='\0returning-destination.jsx'){return `import React from 'react';export default ()=>React.createElement('h1',null,'Synthetic destination '+location.pathname);`;}
  if(id==='\0returning-mssql'){return `export const isMssqlApiEnabled=()=>true;export const requestMssqlApi=async(_p,options)=>fetch('/fixture/profile',{headers:{'x-auth-id':options.headers['x-auth-id']}}).then(r=>r.json());`;}
}};
let vite,server,browser,seekerChecks=0,ownerWrites=0;
const byToken=req=>cases.find(x=>'fixture-'+x.id===String(req.get('authorization')||'').replace(/^Bearer /,''));
const context=x=>{
  const membership=x?.member?{tenant_id:tenantId,role:x.member,status:'active',permission_bundle:'read_only',tenant:{id:tenantId,name:'Example Rentals'}}:null;
  return {tenantId:membership?tenantId:null,membership,memberships:membership?[membership]:[],tenant:membership?.tenant||null,resolution:membership?'single-membership':'none'};
};
try{
  vite=await createServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
  const app=express();app.use(express.json());
  app.post('/fixture/sign-in',(req,res)=>{
    const x=cases.find(x=>x.email===req.body.email);assert.ok(x);assert.equal(req.body.password,'SyntheticPassword8!');
    const user={id:x.id,email:x.email,role:x.role,user_metadata:{user_type:'seeker'}};
    res.json({data:{user,session:{access_token:'fixture-'+x.id,user}}});
  });
  app.get('/fixture/context',(req,res)=>res.json(context(byToken(req))));
  app.get('/fixture/profile',(req,res)=>{
    const x=cases.find(x=>x.id===req.get('x-auth-id'));assert.ok(x);
    res.json({id:x.profileId,role:x.role,user_type:'seeker',name:'Example customer'});
  });
  app.get('/api/platform/auth/seeker-context',(req,res)=>{
    seekerChecks++;const x=byToken(req);
    if(x?.member){return res.status(403).json({error:'Fixture denies business accounts in seeker API'});}
    res.json({data:{verified:true,eligible:true,userType:'seeker',tenantId:null}});
  });
  app.post('/api/platform/owner-setup',(_req,res)=>{ownerWrites++;res.sendStatus(500);});
  app.use('/api',(_req,res)=>res.sendStatus(404));app.use(vite.middlewares);
  app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>window._env_={VITE_PUBLIC_SIGNUP_UI_ENABLED:"true",VITE_PUBLIC_SEEKER_LANDING_ENABLED:"true",VITE_USE_MSSQL_API:"true"};</script><script type="module" src="/@id/__x00__returning-entry.jsx"></script></body></html>')));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  await fs.mkdir('enquiry-browser-proof',{recursive:true});
  for(const x of cases){
    const browserContext=await browser.createBrowserContext();const page=await browserContext.newPage();page.setDefaultTimeout(20000);
    await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
    page.on('pageerror',e=>console.error('RETURNING_OWNER_FIXTURE_ERROR='+e.message));
    const before=seekerChecks;
    const query=x.email==='tenant@example.test'||x.email==='seeker@example.test'?'':'?ownerCountry=BN';
    await page.goto(origin+'/login'+query,{waitUntil:'networkidle0'});
    await page.type('#email-address',x.email);await page.type('#password','SyntheticPassword8!');
    await page.click('button[type="submit"]');
    await page.waitForFunction(path=>location.pathname+location.search===path,{},x.path);
    if(x.member){assert.equal(seekerChecks,before,'Business sign-in never depends on seeker certification');}
    assert.equal(ownerWrites,0,'Returning users never create a duplicate workspace');
    if(x.member==='admin'){
      await page.goto(origin+'/owner-start?country=BN',{waitUntil:'networkidle0'});
      await page.waitForFunction(()=>document.body.innerText.includes('Continue in Example Rentals'));
      assert.equal(await page.$('#owner-workspace'),null);assert.ok((await page.$eval('body',e=>e.innerText)).includes('One workspace can manage many properties'));
      await page.setViewport({width:1365,height:900});await page.screenshot({path:'enquiry-browser-proof/returning-owner-desktop.png',fullPage:true});
      await page.setViewport({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:'enquiry-browser-proof/returning-owner-mobile.png',fullPage:true});
      await page.goto(origin+'/seeker',{waitUntil:'networkidle0'});
      await page.waitForFunction(()=>location.pathname==='/dashboard');
      await page.goto(origin+'/owner-sign-up?country=BN',{waitUntil:'networkidle0'});
      await page.waitForFunction(()=>location.pathname==='/dashboard/properties');
    }
    if(x.email==='new-owner@example.test'){
      await page.waitForSelector('#owner-workspace');
      assert.ok((await page.$eval('body',e=>e.innerText)).includes('A workspace is your account for managing properties'));
      await page.setViewport({width:390,height:844});await page.screenshot({path:'enquiry-browser-proof/new-owner-workspace-explanation-mobile.png',fullPage:true});
    }
    await browserContext.close();
  }
  console.log('RETURNING_OWNER_ENTRY_BROWSER=PASS actual_auth_provider actual_login actual_public_route multiple_emails membership_based_routing no_business_seeker_probe existing_workspace no_duplicate_creation seeker_to_owner_portal renter_portal new_owner_explanation desktop_mobile');
}finally{await browser?.close();await vite?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
