// Actual AuthProvider, Login, route guards and owner entry. Destination pages
// and API responses are synthetic; no external account, email or tenant write.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
import {normalizePropertyRentalValues} from '../src/utils/listingCategories.js';

const tenantId='11111111-1111-4111-8111-111111111111';
const cases=[
  {email:'owner-a@example.test',role:'admin',member:'admin',path:'/dashboard/properties'},
  {email:'owner-b@example.test',role:'authenticated',member:'admin',path:'/dashboard/properties'},
  {email:'staff@example.test',role:'authenticated',member:'staff',path:'/dashboard/properties'},
  {email:'tenant@example.test',role:'authenticated',member:'rentee',path:'/rentee'},
  {email:'new-owner@example.test',role:'authenticated',member:null,path:'/owner-start?country=BN'},
  {email:'seeker@example.test',role:'authenticated',member:null,path:'/seeker'}
].map((x,i)=>({...x,id:`22222222-2222-4222-8222-${String(i+1).padStart(12,'0')}`,profileId:`33333333-3333-4333-8333-${String(i+1).padStart(12,'0')}`}));
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
  import {AuthProvider} from '/src/hooks/useAuth.jsx';import AppRouter from '/src/routes.jsx';import '/src/index.css';
  createRoot(document.getElementById('root')).render(<React.StrictMode><AuthProvider><AppRouter/></AuthProvider></React.StrictMode>);`;
const plugin={name:'returning-owner-proof',enforce:'pre',resolveId(source,importer){
  if(source.startsWith('\0returning-')){return source;}
  if(!importer?.includes('/src/')){return;}
  if(/\/(?:hooks\/useAuth\.jsx|pages\/Login\.jsx|pages\/OwnerSetup\.jsx|components\/auth\/VerifiedSeekerBoundary\.jsx)$/.test(importer)&&/\/services\/platformClient(?:\.js)?$/.test(source)){return new URL('../src/services/platformClientCore.js',import.meta.url).pathname;}
  if(importer.endsWith('/routes.jsx')&&/\/components\/layouts\//.test(source)){return '\0returning-layout.jsx';}
  if(importer.endsWith('/routes.jsx')&&/\/pages\/(?:PropertyList|Dashboard|rentee\/RenteePortal)$/.test(source)){return '\0returning-destination.jsx';}
  if(importer.endsWith('/auth/VerifiedSeekerBoundary.jsx')&&source.endsWith('/pages/SeekerHome')){return '\0returning-destination.jsx';}
},async load(id){
  if(id==='\0returning-entry.jsx'){return transformWithEsbuild(entry,'returning-entry.jsx',{loader:'jsx',jsx:'automatic'});}
  if(id==='\0returning-layout.jsx'){return `import React from 'react';import {Outlet} from 'react-router-dom';export default ()=>React.createElement(Outlet);`;}
  if(id==='\0returning-destination.jsx'){return `import React from 'react';export default ()=>React.createElement('h1',null,'Synthetic destination '+location.pathname);`;}
}};
let vite,server,browser,seekerChecks=0,ownerWrites=0;
const propertyWrites=[];
const byToken=req=>cases.find(x=>'fixture-'+x.id===String(req.get('authorization')||'').replace(/^Bearer /,''));
const progressById=new Map(cases.filter(x=>x.email==='new-owner@example.test').map(x=>[x.id,{name:'',country:'BN',requestId:'44444444-4444-4444-8444-444444444444'}]));
const context=x=>{
  const membership=x?.member?{tenant_id:tenantId,role:x.member,status:'active',permission_bundle:'read_only',tenant:{id:tenantId,name:'Example Rentals'}}:null;
  return {ownerOnboarding:progressById.has(x?.id)?{...progressById.get(x.id),step:'workspace'}:null,tenantId:membership?tenantId:null,membership,memberships:membership?[membership]:[],tenant:membership?.tenant||null,resolution:membership?'single-membership':'none'};
};
try{
  vite=await createServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
  const app=express();app.use(express.json());
  app.post('/api/platform/auth/sign-in',async(req,res)=>{
    // Let React commit the pending state before returning an actual HTTP error.
    await new Promise(resolve=>setTimeout(resolve,150));
    if(req.body.password==='RejectedFixturePassword8!'){return res.status(401).json({error:'Invalid login credentials'});}
    if(req.body.password==='UnavailableFixturePassword8!'){return res.status(503).json({error:'Sign-in is temporarily unavailable. Please try again.'});}
    const x=cases.find(x=>x.email===req.body.email);assert.ok(x);assert.equal(req.body.password,'SyntheticPassword8!');
    const user={id:x.id,email:x.email,role:x.role,user_metadata:{user_type:'seeker'}};
    res.json({data:{user,session:{access_token:'fixture-'+x.id,user}}});
  });
  app.get('/api/platform/auth/context',(req,res)=>res.json({data:context(byToken(req))}));
  app.get('/api/mssql/me',(req,res)=>{
    const x=cases.find(x=>x.id===req.get('x-auth-id'));assert.ok(x);
    res.json({data:{id:x.profileId,role:x.role,user_type:'seeker',name:'Example customer'}});
  });
  app.get('/api/platform/auth/seeker-context',(req,res)=>{
    seekerChecks++;const x=byToken(req);
    if(x?.member){return res.status(403).json({error:'Fixture denies business accounts in seeker API'});}
    res.json({data:{verified:true,eligible:true,userType:'seeker',tenantId:null}});
  });
  app.post('/api/platform/query',(req,res)=>{
    if(req.body.action==='select'){return res.json({data:req.body.table==='properties'?[{...propertyWrites.at(-1),id:'55555555-5555-4555-8555-555555555555'}]:[]});}
    if(req.body.table!=='properties'||!['insert','update'].includes(req.body.action)){return res.sendStatus(400);}
    const payload=req.body.payload;
    assert.ok(['residential','retail','office'].includes(payload.rentalvalues.listingCategory));
    assert.equal(Object.hasOwn(payload.rentalvalues,'listingcategory'),false,'Shared client preserves JSON key case');
    const rentalvalues=normalizePropertyRentalValues(payload.rentalvalues,{requireCategory:true});
    propertyWrites.push({...payload,rentalvalues});
    res.json({data:[{...payload,id:'55555555-5555-4555-8555-555555555555',rentalvalues}]});
  });
  app.get('/api/properties/:id/fixed-utilities',(_req,res)=>res.json({data:{configs:[]}}));
  app.put('/api/properties/:id/fixed-utilities',(_req,res)=>res.json({data:{configs:[]}}));
  app.post('/api/platform/owner-setup/progress',(req,res)=>{const x=byToken(req);assert.ok(x);progressById.set(x.id,req.body);res.json({data:req.body});});
  app.post('/api/platform/owner-setup',(_req,res)=>{ownerWrites++;res.sendStatus(500);});
  app.use('/api',(_req,res)=>res.sendStatus(404));app.use(vite.middlewares);
  app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>window._env_={VITE_PUBLIC_SIGNUP_UI_ENABLED:"true",VITE_PUBLIC_SEEKER_LANDING_ENABLED:"true",VITE_USE_MSSQL_API:"true"};</script><script type="module" src="/@id/__x00__returning-entry.jsx"></script></body></html>')));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  await fs.mkdir('enquiry-browser-proof',{recursive:true});
  // Use the production auth client/storage/listeners, AuthProvider and Login.
  // An unsuccessful request must leave its form mounted with a usable retry.
  for(const failure of [
    {password:'RejectedFixturePassword8!',message:'Invalid login credentials'},
    {password:'UnavailableFixturePassword8!',message:'Sign-in is temporarily unavailable. Please try again.'}
  ]){
    const isolated=await browser.createBrowserContext();const page=await isolated.newPage();
    await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
    await page.goto(origin+'/login?ownerCountry=BN',{waitUntil:'networkidle0'});
    await page.waitForSelector('#email-address');
    await page.type('#email-address','new-owner@example.test');await page.type('#password',failure.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('[role="alert"]');
    assert.equal(await page.$eval('[role="alert"]',e=>e.innerText),failure.message);
    assert.equal(await page.$eval('#email-address',e=>e.value),'new-owner@example.test');
    assert.equal(await page.$eval('button[type="submit"]',e=>e.disabled),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('khrental.local.session')),null);
    await page.setViewport({width:1365,height:900});await page.screenshot({path:'enquiry-browser-proof/login-failure-desktop.png',fullPage:true});
    await page.setViewport({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'enquiry-browser-proof/login-failure-mobile.png',fullPage:true});
    await page.$eval('#password',e=>e.select());await page.type('#password','SyntheticPassword8!');
    await page.click('button[type="submit"]');
    await page.waitForFunction(()=>location.pathname==='/owner-start');
    // A fresh document must restore the successful session through production storage.
    await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#owner-workspace');
    await isolated.close();
  }
  for(const x of cases){
    const browserContext=await browser.createBrowserContext();const page=await browserContext.newPage();page.setDefaultTimeout(20000);
    await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
    page.on('pageerror',e=>console.error('RETURNING_OWNER_FIXTURE_ERROR='+e.message));
    const before=seekerChecks;
    const query=['tenant@example.test','seeker@example.test','new-owner@example.test'].includes(x.email)?'':'?ownerCountry=BN';
    await page.goto(origin+'/login'+query,{waitUntil:'networkidle0'});
    await page.type('#email-address',x.email);await page.type('#password','SyntheticPassword8!');
    await page.click('button[type="submit"]');
    await page.waitForFunction(path=>location.pathname+location.search===path,{},x.path);
    if(x.member){assert.equal(seekerChecks,before,'Business sign-in never depends on seeker certification');}
    assert.equal(ownerWrites,0,'Returning users never create a duplicate workspace');
    if(x.email==='owner-b@example.test'){
      // Render the actual PropertyForm and use the production save client.
      for(const category of ['residential','retail','office']){
        await page.goto(origin+'/dashboard/properties/new?country=BN',{waitUntil:'networkidle0'});
        await page.waitForSelector('#name');
        for(const [selector,value]of [['#name','Example first property'],['#address','Example address'],['#bank_name','Example bank'],['#bank_branch','Example branch'],['#bank_account_number','0000000000'],['#rent','125000'],['#deposit','125000']]){
          await page.type(selector,value);
        }
        await page.select('#listingCategory',category);
        await page.select('#propertytype','house');
        assert.deepEqual(await page.$$eval(':invalid',nodes=>nodes.map(node=>node.id)),[], 'Fixture completes every required property field');
        await page.click('button[type="submit"]');
        await page.waitForFunction(()=>location.pathname==='/dashboard/properties');
        assert.equal(propertyWrites.at(-1).rentalvalues.listingCategory,category);
        assert.equal(propertyWrites.at(-1).rentalvalues.rent,125000);
        // Existing records may contain the earlier lowercase spelling.
        propertyWrites.at(-1).rentalvalues={rent:125000,deposit:125000,listingcategory:category};
        await page.goto(origin+'/dashboard/properties/55555555-5555-4555-8555-555555555555/edit',{waitUntil:'networkidle0'});
        await page.waitForFunction(code=>document.querySelector('#listingCategory')?.value===code,{},category);
        await page.click('button[type="submit"]');
        await page.waitForFunction(()=>location.pathname==='/dashboard/properties');
        assert.equal(propertyWrites.at(-1).rentalvalues.listingCategory,category);

      }
    }
    if(x.member==='admin'){
      await page.goto(origin+'/owner-start?country=BN',{waitUntil:'networkidle0'});
      await page.waitForFunction(()=>document.body.innerText.includes('Continue in Example Rentals'));
      assert.equal(await page.$('#owner-workspace'),null);assert.ok((await page.$eval('body',e=>e.innerText)).includes('One workspace can manage many properties'));
      await page.setViewport({width:1365,height:900});await page.screenshot({path:'enquiry-browser-proof/returning-owner-desktop.png',fullPage:true});
      await page.setViewport({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:'enquiry-browser-proof/returning-owner-mobile.png',fullPage:true});
      await page.click('a[href="/owner-start?country=BN&newWorkspace=1"]');await page.waitForSelector('#owner-workspace');
      assert.equal(ownerWrites,0,'An additional workspace remains an explicit optional setup');
      await page.click('a[href="/owner-start?country=BN"]');await page.waitForSelector('section[aria-label="Your existing workspace"]');
      await page.goto(origin+'/seeker',{waitUntil:'networkidle0'});
      await page.waitForFunction(()=>location.pathname==='/dashboard');
      await page.goto(origin+'/owner-sign-up?country=BN',{waitUntil:'networkidle0'});
      await page.waitForFunction(()=>location.pathname==='/dashboard/properties');
    }
    if(x.email==='new-owner@example.test'){
      await page.waitForSelector('#owner-workspace');
      assert.ok((await page.$eval('body',e=>e.innerText)).includes('A workspace is your account for managing properties'));
      await page.setViewport({width:390,height:844});await page.screenshot({path:'enquiry-browser-proof/new-owner-workspace-explanation-mobile.png',fullPage:true});
      const savedDraft=page.waitForResponse(r=>r.url().endsWith('/api/platform/owner-setup/progress')&&JSON.parse(r.request().postData()||'{}').name==='Durable example rentals');
      await page.type('#owner-workspace','Durable example rentals');
      await savedDraft;
      await page.waitForFunction(()=>document.body.innerText.includes('Setup saved.'));
      assert.equal(progressById.get(x.id).name,'Durable example rentals');
      // A separate browser has none of the first tab's sessionStorage or session.
      const nextContext=await browser.createBrowserContext();const next=await nextContext.newPage();
      await next.setRequestInterception(true);next.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
      await next.goto(origin+'/login',{waitUntil:'networkidle0'});
      await next.type('#email-address',x.email);await next.type('#password','SyntheticPassword8!');await next.click('button[type="submit"]');
      await next.waitForSelector('#owner-workspace');
      assert.equal(await next.$eval('#owner-workspace',e=>e.value),'Durable example rentals');
      assert.equal(await next.$eval('#owner-country',e=>e.value),'BN');
      await nextContext.close();
    }
    await browserContext.close();
  }
  console.log('RETURNING_OWNER_ENTRY_BROWSER=PASS actual_property_form three_category_save actual_auth_client actual_auth_storage actual_auth_provider actual_login failed_login_visible retry reload actual_public_route multiple_emails membership_based_routing no_business_seeker_probe existing_workspace no_duplicate_creation seeker_to_owner_portal renter_portal new_owner_explanation desktop_mobile');
}finally{await browser?.close();await vite?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
