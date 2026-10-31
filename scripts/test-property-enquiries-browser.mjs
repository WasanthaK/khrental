// Real React enquiry/login/inbox components and router, isolated synthetic API.
// External requests are blocked. No production account, enquiry or email is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import {createServer as createViteServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
import {parseApplicationAction,nextApplication,applicationReceipt} from '../src/api/enquiries/applicationContract.js';
import {parseViewingAction,nextViewing,viewingReceipt} from '../src/api/enquiries/viewingContract.js';
import {createPublicSignupVerificationLink} from '../src/api/auth/publicSignupVerificationEmail.js';

const listingId='11111111-1111-4111-8111-111111111111';
const enquiryId='22222222-2222-4222-8222-222222222222';
const fixtureAuth=`import {useEffect,useState} from 'react';
  let signedIn=!!localStorage.getItem('khrental.local.session');const listeners=new Set();
  export const getSession=async()=>({data:{session:window.ownerFixtureSession|| (signedIn?{access_token:'synthetic-proof-token',user:{id:'synthetic-auth'}}:null)}});
  export const useAuth=()=>{const [,render]=useState(0);useEffect(()=>{const f=()=>render(x=>x+1);listeners.add(f);return()=>listeners.delete(f);},[]);
    return {user:signedIn?{id:'synthetic-auth'}:null,isAuthenticated:signedIn,loading:false,activeTenantId:'synthetic-workspace',
      login:async()=>{await fetch('/fixture/login',{method:'POST'});signedIn=true;localStorage.setItem('khrental.local.session',JSON.stringify({access_token:'synthetic-proof-token',user:{id:'synthetic-auth'}}));listeners.forEach(f=>f());return {data:{user:{id:'synthetic-auth'}}};},
      logout:async()=>{localStorage.removeItem('khrental.local.session');signedIn=false;listeners.forEach(f=>f());},setDevBypass:()=>{}};};`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
  import {BrowserRouter,Routes,Route} from 'react-router-dom';
  import PropertyEnquiry from '/src/pages/PropertyEnquiry.jsx';
  import SeekerHome from '/src/pages/SeekerHome.jsx';
  import RentalJourney from '/src/pages/RentalJourney.jsx';
  import RootLayout from '/src/components/layouts/RootLayout.jsx';
  import OwnerSetup from '/src/pages/OwnerSetup.jsx';
  import OwnerEnquiries from '/src/pages/OwnerEnquiries.jsx';
  import Login from '/src/pages/Login.jsx';
  import SeekerSignUp from '/src/pages/SeekerSignUp.jsx';
  import VerifySeekerEmail from '/src/pages/VerifySeekerEmail.jsx';
  import '/src/index.css';
  createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
    <Route path="/seeker" element={<SeekerHome user={{id:"synthetic-profile",role:"authenticated",user_type:"seeker",tenant_id:null}} membership={null} memberships={[]} tenantContextVerified={true}/>}/><Route path="/rental-journey" element={<RootLayout/>}><Route index element={<RentalJourney/>}/></Route><Route path="/enquire" element={<PropertyEnquiry/>}/><Route path="/login" element={<Login/>}/>
    <Route path="/seeker-sign-up" element={<SeekerSignUp/>}/><Route path="/verify-email" element={<VerifySeekerEmail/>}/>
    <Route path="/owner-sign-up" element={<SeekerSignUp/>}/><Route path="/owner-start" element={<RootLayout/>}><Route index element={<OwnerSetup/>}/></Route>
    <Route path="/dashboard/properties/new" element={<h1>First property setup fixture</h1>}/>
    <Route path="/dashboard/enquiries" element={<OwnerEnquiries/>}/></Routes></BrowserRouter>);`;
const plugin={name:'isolated-enquiry-fixture',enforce:'pre',resolveId(source,importer){
  if(source.startsWith('\0enquiry-')){return source;}
  if(source==='virtual:enquiry-proof'){return '\0enquiry-proof.jsx';}
  if(!importer?.includes('/src/')){return;}
  if(importer.endsWith('/layouts/RootLayout.jsx')){
    if(source.endsWith('/services/appInitService')){return '\0enquiry-app-init';}
    if(source.endsWith('/contexts/ConfirmContext')){return '\0enquiry-confirm';}
    if(['/ScrollToTop','/RouteChangeHandler','/ForceRefresh','/NavigationRegistrar','/WelcomeGuide'].some(s=>source.endsWith(s))){return '\0enquiry-shell-child';}
  }
  if(source.endsWith('/hooks/useAuth')){return '\0enquiry-auth';}
  if(source.endsWith('/services/platformClient')){return '\0enquiry-platform';}
  if(source.endsWith('/services/mssqlApiClient')){return '\0enquiry-mssql';}
  if(source.endsWith('/utils/env')||source.endsWith('/utils/env.js')){return '\0enquiry-env';}
},async load(id){
  if(id==='\0enquiry-proof.jsx'){return transformWithEsbuild(entry,'enquiry-proof.jsx',{loader:'jsx',jsx:'automatic'});}
  if(id==='\0enquiry-auth'){return fixtureAuth;}
  if(id==='\0enquiry-app-init'){return `export const initializeApp=async()=>{await fetch('/fixture/management-init',{method:'POST'});return {error:'Synthetic management storage error',isStorageError:true};};`;}
  if(id==='\0enquiry-confirm'){return `export const ConfirmContextProvider=({children})=>children;`;}
  if(id==='\0enquiry-shell-child'){return `export default ()=>null;`;}
  if(id==='\0enquiry-platform'){return `import {getSession} from '\0enquiry-auth';export const getPlatformClient=()=>({auth:{getSession,setActiveTenant:async id=>{localStorage.setItem('khrental.activeTenantId',id);return {};}}});`;}
  if(id==='\0enquiry-env'){return `export const isDevBypassEnabled=()=>false;export const isPublicSeekerLandingEnabled=()=>true;export const isPublicSignupUiEnabled=()=>true;export const isPropertyEnquiriesEnabled=()=>!location.search.includes('off=1');`;}
  if(id==='\0enquiry-mssql'){return `export const requestMssqlApi=async(path,options={})=>{const r=await fetch(path,{method:options.method||'GET',headers:{'Content-Type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{})});const p=await r.json();if(!r.ok)throw Object.assign(new Error(p.error),{code:p.code});return p.data??p;};`;}
}};
let vite,browser,server,activePage;let row=null,submissions=0,ownerWrites=0,failNext=false,verificationLink=null,normalLogins=0;
let application=null,applicationsOpen=true;
let publicListingMode='ready',photoMode='ready';
let managementInitializations=0;
let ownerSetupAttempts=0,ownerSetupRequest=null,ownerVerificationLink=null;
let releaseOwnerSetup,notifyOwnerSetup;
const ownerSetupHeld=new Promise(resolve=>{notifyOwnerSetup=resolve;});
const ownerWorkspaceId='44444444-4444-4444-8444-444444444444';
const photoId='abcdefab-abcd-4abc-8abc-abcdefabcdef';
const photoUrl='/api/public-listings/'+listingId+'/media/'+photoId+'?country=LK';
// Existing stock asset is used only for the clearly synthetic property fixture.
const fixturePhoto=await fs.readFile(new URL('../marketing/assets/residential-villa.webp',import.meta.url));
let viewing=null,viewingsOpen=true,holdViewingRead=false,releaseViewingRead=null,notifyViewingRead=null;
const verificationToken='b'.repeat(43);
try {
  vite=await createViteServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
  const app=express();app.use(express.json());
  app.post('/fixture/management-init',(req,res)=>{managementInitializations++;res.json({ok:true});});
  app.post('/api/platform/owner-setup',(req,res)=>{
    assert.equal(req.get('authorization'),'Bearer synthetic-proof-token');assert.equal(req.get('x-tenant-id'),undefined);
    assert.equal(req.body.country,'BN');assert.equal(req.body.name,'Synthetic owner workspace');
    if(ownerSetupRequest){assert.deepEqual(req.body,ownerSetupRequest);}else{ownerSetupRequest=req.body;}
    ownerSetupAttempts++;
    if(ownerSetupAttempts===1){return res.status(503).json({error:'Synthetic temporary failure. Please retry.'});}
    if(ownerSetupAttempts===2){notifyOwnerSetup();releaseOwnerSetup=()=>res.status(201).json({data:{id:ownerWorkspaceId,name:req.body.name,testing:true}});return;}
    res.status(201).json({data:{id:ownerWorkspaceId,name:req.body.name,testing:true}});
  });
  app.post('/fixture/login',(req,res)=>{normalLogins++;res.json({ok:true});});
  app.get('/api/public-listings/:id/media/:mediaId',(req,res)=>photoMode==='missing'?res.sendStatus(404):res.type('image/webp').send(fixturePhoto));
  app.get('/api/public-listings/:id',(req,res)=>publicListingMode==='missing'?res.sendStatus(404):res.json({data:{id:listingId,country:'LK',title:'Synthetic rental',location:'General location',monthlyRent:100000,currency:'LKR',images:[{url:photoUrl,alt:'Synthetic approved property photo'}]}}));
  app.get('/api/platform/auth/seeker-context',(req,res)=>res.json({data:{verified:true,eligible:true,userType:'seeker',tenantId:null}}));
  app.post('/api/public-signup/challenge',(req,res)=>{
    if(req.body.ownerCountry){
      assert.equal(req.body.ownerCountry,'BN');assert.equal(req.body.enquiry,undefined);
      ownerVerificationLink=createPublicSignupVerificationLink({token:verificationToken,baseUrl:'http://'+req.get('host'),ownerCountry:req.body.ownerCountry});
    }else{
      assert.deepEqual(req.body.enquiry,{listingId,country:'LK'});
      verificationLink=createPublicSignupVerificationLink({token:verificationToken,baseUrl:'http://'+req.get('host'),enquiry:req.body.enquiry});
    }
    assert.equal(req.get('authorization'),undefined);assert.equal(req.get('x-tenant-id'),undefined);
    res.json({data:{accepted:true}});
  });
  app.post('/api/public-signup/redeem',(req,res)=>{
    assert.equal(req.body.token,verificationToken);assert.equal(req.get('authorization'),undefined);
    assert.equal(req.get('x-tenant-id'),undefined);
    res.status(201).json({data:{user:{id:'synthetic-auth',role:'authenticated',user_type:'seeker'},session:{access_token:'synthetic-registration-only',user:{id:'synthetic-auth'}}}});
  });
  app.get(['/api/property-enquiries/:id/viewing','/api/owner-enquiries/:id/viewing'],(req,res)=>{
    if(!viewingsOpen){return res.status(404).json({code:'VIEWINGS_UNAVAILABLE',error:'Viewing appointments are not open yet.'});}
    const data=viewingReceipt(viewing);
    if(holdViewingRead){
      holdViewingRead=false;releaseViewingRead=()=>res.json({data});notifyViewingRead?.();return;
    }
    res.json({data});
  });
  app.post(['/api/property-enquiries/:id/viewing','/api/owner-enquiries/:id/viewing'],(req,res)=>{
    const owner=req.path.startsWith('/api/owner-');
    if(!owner){assert.equal(req.get('authorization'),'Bearer synthetic-proof-token');assert.equal(req.get('x-tenant-id'),undefined);}
    try {
      const input=parseViewingAction(req.body,owner);
      const next=nextViewing(viewing,input,owner,{country_code:'LK',status:row.status},new Date());
      viewing={status:next.status,starts_at:next.startsAt,ends_at:next.endsAt,timezone:next.timeZone,
        instructions:next.instructions,version:(viewing?.version??0)+1,updated_at:new Date().toISOString()};
      res.json({data:viewingReceipt(viewing)});
    } catch(err){res.status(err.status||500).json({code:err.code,error:err.message});}
  });
  const applicationState=()=>({application:applicationReceipt(application),canSubmit:(!application||application.status==='needs_information')&&viewing?.status==='completed'&&['pending','responded'].includes(row?.status)});
  app.get(['/api/property-enquiries/:id/application','/api/owner-enquiries/:id/application'],(req,res)=>{
    if(!applicationsOpen){return res.status(404).json({code:'APPLICATIONS_UNAVAILABLE',error:'Rental applications are not open yet.'});}
    res.json({data:applicationState()});
  });
  app.post(['/api/property-enquiries/:id/application','/api/owner-enquiries/:id/application'],(req,res)=>{
    const owner=req.path.startsWith('/api/owner-');
    if(!owner){assert.equal(req.get('authorization'),'Bearer synthetic-proof-token');assert.equal(req.get('x-tenant-id'),undefined);}
    try{
      const input=parseApplicationAction(req.body,owner);
      application={...nextApplication(application,input,owner,{country_code:'LK',status:row.status},viewing?.status==='completed',new Date()),
        version:(application?.version??0)+1,updated_at:new Date().toISOString()};
      res.json({data:applicationState()});
    }catch(err){res.status(err.status||500).json({code:err.code,error:err.message});}
  });
  app.get('/api/property-enquiries/journey',(req,res)=>res.json({data:{items:row?[row]:[],hasMore:false}}));
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
  if(process.env.ENQUIRY_FIXTURE_ONLY==='true'){
    for(const resource of ['/@id/__x00__enquiry-proof.jsx','/src/pages/PropertyEnquiry.jsx','/@id/__x00__enquiry-auth']){
      const response=await fetch(origin+resource);
      const compiled=await response.text();
      assert.equal(response.status,200);
      assert.ok(!compiled.includes('.render(<BrowserRouter>'),'Virtual fixture JSX must be compiled');
      console.log('FIXTURE_COMPILE=PASS '+resource);
    }
  } else {
  browser=await puppeteer.launch({headless:true,protocolTimeout:20000,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();activePage=page;const errors=[];
  page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);
  page.on('pageerror',e=>{errors.push(e.message);console.error('FIXTURE_PAGE_ERROR='+e.message);});
  page.on('response',r=>{if(r.status()>=400){console.error('FIXTURE_HTTP_ERROR='+r.status()+' '+r.url());}});
  await page.setRequestInterception(true);
  page.on('request',r=>{if(r.url().startsWith('https://quixo.homes/'))return r.respond({status:200,contentType:'text/html',body:'<h1>Public browsing fixture</h1>'});return r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort();});
  await page.setViewport({width:1280,height:900});
  await page.goto(origin+'/enquire?listingId='+listingId+'&country=LK',{waitUntil:'networkidle0'});
  console.log('BROWSER_STAGE=anonymous_listing');
  await page.waitForSelector('a[href^="/login?listingId="]');
  await page.click('a[href^="/login?listingId="]');
  await page.waitForSelector('#email-address');
  await page.type('#email-address','seeker@example.test');await page.type('#password','SyntheticFixtureOnly!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('textarea');
  console.log('BROWSER_STAGE=login_return');
  await page.waitForFunction(()=>document.querySelector('.enquiry-photo')?.naturalWidth>0);
  assert.match(await page.$eval('.enquiry-rent',e=>e.textContent),/LKR.*100,000.*month/);
  assert.equal(await page.$('.enquiry-heading .seeker-button'),null,'Selected property has no competing browse CTA');
  assert.equal(await page.$('.enquiry-compose .seeker-empty'),null);
  assert.equal(await page.$eval('#enquiry-message',e=>e.value),'','Never invent a customer message');
  assert.equal(await page.$eval('input[type="checkbox"]',e=>e.checked),false,'Consent stays explicit');
  assert.ok(await page.$eval('#enquiry-message',e=>e.placeholder.includes('still available')));
  const designOutput=process.env.ENQUIRY_PROOF_DIR||'/tmp/quixo-enquiry-browser-proof';
  await fs.mkdir(designOutput,{recursive:true});
  await page.screenshot({path:path.join(designOutput,'property-enquiry-desktop.png'),fullPage:true});
  await page.focus('#enquiry-message');await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.type),'checkbox','Keyboard moves from message to explicit consent');
  await page.setViewport({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Selected property form fits mobile');
  await page.screenshot({path:path.join(designOutput,'property-enquiry-mobile.png'),fullPage:true});
  await page.setViewport({width:320,height:740});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Selected property form fits a narrow phone');
  assert.ok(await page.$eval('.enquiry-rent',e=>e.scrollWidth<=e.clientWidth+1),'Rent and its monthly period remain fully visible inside the card');
  await page.screenshot({path:path.join(designOutput,'property-enquiry-mobile-small.png'),fullPage:true});
  await page.setViewport({width:390,height:844});
  photoMode='missing';await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('.enquiry-photo-empty');
  await page.waitForSelector('#enquiry-message');
  assert.ok(await page.$('#enquiry-message'),'A failed public photo does not block contact');
  await page.screenshot({path:path.join(designOutput,'property-enquiry-photo-fallback.png'),fullPage:true});
  publicListingMode='missing';await page.reload({waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.body.innerText.includes('This property is no longer publicly available'));
  assert.equal(await page.$('#enquiry-message'),null,'Unavailable listing cannot be submitted');
  publicListingMode='ready';photoMode='ready';
  await page.click('::-p-text(Try loading again)');await page.waitForSelector('#enquiry-message');
  await page.setViewport({width:1280,height:900});
  console.log('PROPERTY_ENQUIRY_DESIGN=PASS public_photo rent property_context guidance explicit_consent mobile missing_photo unavailable_retry');
  // Customer experience: a fresh account always has a useful next action.
  const uxOutput=process.env.ENQUIRY_PROOF_DIR||'/tmp/quixo-enquiry-browser-proof';
  await fs.mkdir(uxOutput,{recursive:true});
  await page.click('nav[aria-label="Your rental search"] a[href="/seeker"]');
  await page.waitForSelector('#browse-rentals');
  assert.equal(await page.$eval('a[href="https://quixo.homes/lk/search/"]',e=>e.textContent),'Browse Sri Lanka');
  assert.equal(await page.$eval('a[href="https://quixo.homes/bn/search/"]',e=>e.textContent),'Browse Brunei');
  assert.doesNotMatch(await page.$eval('body',e=>e.innerText),/not currently linked|No properties, leases|subscription billing/);
  await page.screenshot({path:path.join(uxOutput,'seeker-overview-desktop.png'),fullPage:true});
  await page.setViewport({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overview fits mobile');
  await page.screenshot({path:path.join(uxOutput,'seeker-overview-mobile.png'),fullPage:true});
  await page.click('nav[aria-label="Your rental search"] a[href="/enquire"]');
  await page.waitForSelector('.seeker-empty');
  assert.equal(await page.$eval('.seeker-empty a',e=>e.getAttribute('href')),'/seeker#browse-rentals');
  assert.equal(await page.$('.seeker-pagination'),null,'An empty first page has no paging controls');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Empty inbox fits mobile');
  await page.screenshot({path:path.join(uxOutput,'seeker-empty-enquiries-mobile.png'),fullPage:true});
  await page.click('nav[aria-label="Your rental search"] a[href="/rental-journey"]');
  await page.waitForSelector('.seeker-empty');
  assert.equal(managementInitializations,0,'Rental journey must not initialize organization storage');
  assert.doesNotMatch(await page.$eval('body',e=>e.innerText),/Storage Notice|storage buckets|Synthetic management storage error/);
  assert.equal(await page.$('.seeker-pagination'),null);
  assert.ok(await page.$('.seeker-empty a[href="/seeker#browse-rentals"]'));
  await page.setViewport({width:1280,height:900});
  await page.screenshot({path:path.join(uxOutput,'seeker-empty-offers-desktop.png'),fullPage:true});
  await page.setViewport({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Offers fit mobile');
  await page.screenshot({path:path.join(uxOutput,'seeker-empty-offers-mobile.png'),fullPage:true});
  await page.setViewport({width:1280,height:900});
  console.log('RENTAL_JOURNEY_SHELL=PASS actual_root_layout no_management_initialization no_storage_notice desktop mobile');
  // Return through client history to the same selected-property enquiry.
  await page.goBack();await page.goBack();await page.goBack();
  await page.waitForSelector('textarea');
  console.log('SEEKER_UX_BROWSER=PASS overview markets useful_empty_states consistent_navigation mobile no_empty_pagination');

  assert.equal(new URL(page.url()).searchParams.get('listingId'),listingId);
  await page.type('textarea','May I arrange a viewing?');
  assert.equal(await page.$eval('form button',e=>e.disabled),true);
  await page.click('input[type="checkbox"]');failNext=true;
  await page.click('form button');await page.waitForSelector('[role="alert"]');
  console.log('BROWSER_STAGE=retry_error_visible');
  assert.match(await page.$eval('[role="alert"]',e=>e.textContent),/Temporarily unavailable/);
  await page.click('form button');await page.waitForFunction(()=>document.body.innerText.includes('Your enquiry was sent'));
  console.log('BROWSER_STAGE=enquiry_saved');
  assert.equal(submissions,2);assert.equal(row.status,'pending');
  const ownerPage=await browser.newPage();
  ownerPage.setDefaultTimeout(10000);ownerPage.setDefaultNavigationTimeout(15000);
  await ownerPage.setRequestInterception(true);
  ownerPage.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  await ownerPage.goto(origin+'/dashboard/enquiries',{waitUntil:'networkidle0'});
  await ownerPage.waitForSelector('textarea');await ownerPage.type('textarea','Please suggest a convenient time.');
  console.log('BROWSER_STAGE=owner_inbox');
  await ownerPage.click('article button');
  await ownerPage.waitForFunction(()=>document.body.innerText.includes('Enquiry updated'));
  console.log('BROWSER_STAGE=owner_replied');
  assert.equal(ownerWrites,1);assert.equal(row.status,'responded');
  await page.bringToFront();
  await page.click('::-p-text(Refresh responses)');
  await page.waitForFunction(()=>document.body.innerText.includes('Please suggest a convenient time.'));
  console.log('BROWSER_STAGE=seeker_reads_reply');
  const localDate=new Date(Date.now()+86400000).toISOString().slice(0,16);
  const chooseTime=async p=>p.$eval('input[type="datetime-local"]',(input,value)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  },localDate);
  await chooseTime(page);
  await page.click('::-p-text(Request viewing time)');
  await page.waitForFunction(()=>document.body.innerText.includes('Viewing status: requested'));
  assert.equal(viewing.status,'requested');
  assert.ok((await page.$eval('body',e=>e.innerText)).includes('Asia/Colombo'));
  await ownerPage.bringToFront();await ownerPage.click('::-p-text(Refresh viewing)');
  await ownerPage.waitForFunction(()=>document.body.innerText.includes('Confirm requested time'));
  await ownerPage.type('textarea[id$="-instructions"]','Synthetic private meeting point');
  await ownerPage.click('::-p-text(Confirm requested time)');
  await ownerPage.waitForFunction(()=>document.body.innerText.includes('Viewing status: confirmed'));
  await page.bringToFront();await page.click('::-p-text(Refresh viewing)');
  await page.waitForFunction(()=>document.body.innerText.includes('Synthetic private meeting point'));
  await ownerPage.bringToFront();await chooseTime(ownerPage);
  await ownerPage.type('textarea[id$="-instructions"]','Revised private meeting point');
  await ownerPage.click('::-p-text(Propose viewing time)');
  await ownerPage.waitForFunction(()=>document.body.innerText.includes('Viewing status: proposed'));
  await page.bringToFront();await page.click('::-p-text(Refresh viewing)');
  await page.waitForFunction(()=>document.body.innerText.includes('Accept proposed time'));
  assert.ok(!(await page.$eval('body',e=>e.innerText)).includes('Revised private meeting point'));
  await page.click('::-p-text(Accept proposed time)');
  await page.waitForFunction(()=>document.body.innerText.includes('Revised private meeting point'));
  console.log('PROPERTY_VIEWINGS_BROWSER=PASS requested owner_confirmation reschedule seeker_accept private_instructions explicit_timezone');
  await ownerPage.bringToFront();
  viewing.starts_at=new Date(Date.now()-7200000).toISOString();viewing.ends_at=new Date(Date.now()-3600000).toISOString();
  await ownerPage.click('::-p-text(Refresh viewing)');
  await ownerPage.waitForSelector('::-p-text(Mark viewing completed)');
  await ownerPage.click('::-p-text(Mark viewing completed)');
  await ownerPage.waitForFunction(()=>document.body.innerText.includes('Viewing status: completed'));
  await page.bringToFront();await page.click('::-p-text(Refresh application)');
  await page.waitForSelector('input[type="date"]');
  const appDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  await page.$eval('input[type="date"]',(input,value)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  },appDate);
  await page.type('textarea[id$="-statement"]','Synthetic rental application plans.');
  assert.equal(await page.$eval('section[aria-label^="Application for"] button[type="submit"]',e=>e.disabled),true);
  await page.click('section[aria-label^="Application for"] input[type="checkbox"]');
  await page.click('::-p-text(Submit application)');
  await page.waitForFunction(()=>document.body.innerText.includes('Application status: submitted'));
  await ownerPage.bringToFront();await ownerPage.click('::-p-text(Refresh application)');
  await ownerPage.waitForSelector('textarea[id$="-note"]');
  await ownerPage.type('textarea[id$="-note"]','Please clarify the proposed term.');
  await ownerPage.click('::-p-text(Request application information)');
  await ownerPage.waitForFunction(()=>document.body.innerText.includes('Application status: needs information'));
  await page.bringToFront();await page.click('::-p-text(Refresh application)');
  await page.waitForSelector('::-p-text(Resubmit application)');
  assert.equal(await page.$eval('section[aria-label^="Application for"] input[type="checkbox"]',e=>e.checked),false);
  await page.click('section[aria-label^="Application for"] input[type="checkbox"]');
  await page.click('::-p-text(Resubmit application)');
  await page.waitForFunction(()=>document.body.innerText.includes('Application status: submitted'));
  await ownerPage.bringToFront();await ownerPage.click('::-p-text(Refresh application)');
  await ownerPage.waitForSelector('::-p-text(Accept for offer preparation)');
  await ownerPage.type('textarea[id$="-note"]','Reviewed for offer preparation.');
  await ownerPage.click('::-p-text(Accept for offer preparation)');
  await ownerPage.waitForFunction(()=>document.body.innerText.includes('Application status: accepted'));
  await page.bringToFront();await page.click('::-p-text(Refresh application)');
  await page.waitForFunction(()=>document.body.innerText.includes('Accepted for offer preparation.'));
  await page.click('::-p-text(Withdraw application)');
  await page.waitForFunction(()=>document.body.innerText.includes('Application status: withdrawn'));
  applicationsOpen=false;await page.click('::-p-text(Refresh application)');
  await page.waitForFunction(()=>!document.body.innerText.includes('Rental application'));
  // Restore a synthetic future confirmed appointment for the existing cancel-after-close proof.
  viewing={...viewing,status:'confirmed',starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+90000000).toISOString()};
  console.log('PROPERTY_APPLICATIONS_BROWSER=PASS completed_viewing consent review information_resubmit renewed_consent acceptance_no_reservation withdrawal default_off');


  await page.setViewport({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout must fit viewport');
  const output=process.env.ENQUIRY_PROOF_DIR||'/tmp/quixo-enquiry-browser-proof';
  await fs.mkdir(output,{recursive:true});await page.screenshot({path:path.join(output,'seeker-enquiry.png'),fullPage:true});
  await ownerPage.bringToFront();
  await ownerPage.screenshot({path:path.join(output,'owner-inbox.png'),fullPage:true});
  await page.bringToFront();
  await page.click('::-p-text(Sign out)');
  await page.waitForSelector('a[href^="/login?listingId="]');
  assert.ok(!(await page.$eval('body',e=>e.innerText)).includes('Please suggest a convenient time.'));
  assert.equal(await page.$('textarea'),null);
  await page.click('a[href^="/login?listingId="]');await page.waitForSelector('#email-address');
  await page.type('#email-address','seeker@example.test');await page.type('#password','SyntheticFixtureOnly!');
  await page.click('button[type="submit"]');
  await page.waitForFunction(()=>document.body.innerText.includes('Please suggest a convenient time.'));
  await page.click('::-p-text(Withdraw enquiry)');
  await page.waitForFunction(()=>document.body.innerText.includes('Enquiry withdrawn.'));
  assert.equal(row.status,'withdrawn');
  const readHeld=new Promise(resolve=>{notifyViewingRead=resolve;});
  holdViewingRead=true;
  await page.click('::-p-text(Refresh viewing)');await readHeld;
  await page.click('::-p-text(Cancel viewing)');
  await page.waitForFunction(()=>document.body.innerText.includes('Viewing status: cancelled'));
  releaseViewingRead();await page.waitForNetworkIdle({idleTime:300,timeout:10000});
  assert.ok((await page.$eval('body',e=>e.innerText)).includes('Viewing status: cancelled'));
  assert.ok(!(await page.$eval('body',e=>e.innerText)).includes('Revised private meeting point'));

  assert.equal(viewing.instructions,null);
  viewingsOpen=false;
  await page.click('::-p-text(Refresh viewing)');
  await page.waitForFunction(()=>!document.body.innerText.includes('Viewing appointment'));
  assert.equal(await page.$('input[type="datetime-local"]'),null);
  assert.ok(!(await page.$eval('body',e=>e.innerText)).includes('Viewing appointment'));
  console.log('PROPERTY_VIEWINGS_BROWSER_CLOSURE=PASS cancel_closed_enquiry delayed_refresh_privacy independent_default_off');

  // A new prospect crosses an email/browser boundary. Only the validated
  // public listing pointer survives; the verification token is scrubbed.
  await page.click('::-p-text(Sign out)');await page.waitForSelector('a[href^="/login?listingId="]');
  await page.click('a[href^="/login?listingId="]');
  await page.waitForSelector('a[href^="/seeker-sign-up?listingId="]');
  await page.click('a[href^="/seeker-sign-up?listingId="]');
  await page.waitForSelector('#seeker-name');await page.type('#seeker-name','Synthetic new seeker');
  await page.type('#seeker-email','new-seeker@example.test');await page.click('form button');
  await page.waitForFunction(()=>document.body.innerText.includes('Public browsing fixture'));
  const publicReturn=new URL(page.url());assert.equal(publicReturn.origin,'https://quixo.homes');
  assert.equal(publicReturn.searchParams.get('id'),listingId);assert.equal(publicReturn.searchParams.get('verification'),'pending');
  assert.ok(verificationLink);
  const verifyPage=await browser.newPage();activePage=verifyPage;
  verifyPage.setDefaultTimeout(10000);verifyPage.setDefaultNavigationTimeout(15000);
  verifyPage.on('pageerror',e=>errors.push(e.message));
  await verifyPage.setRequestInterception(true);
  verifyPage.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  await verifyPage.goto(verificationLink,{waitUntil:'networkidle0'});
  assert.equal(verifyPage.url(),origin+'/verify-email');
  await verifyPage.waitForSelector('#seeker-password');
  await verifyPage.type('#seeker-password','SyntheticFixtureOnly!');await verifyPage.type('#seeker-password-confirm','SyntheticFixtureOnly!');
  const loginsBeforeVerification=normalLogins;
  await verifyPage.click('button[type="submit"]');await verifyPage.waitForSelector('textarea');
  assert.equal(new URL(verifyPage.url()).pathname,'/enquire');
  assert.equal(new URL(verifyPage.url()).searchParams.get('listingId'),listingId);
  assert.equal(normalLogins,loginsBeforeVerification,'Email verification must not demand a second password login');
  const afterVerification=await verifyPage.evaluate(()=>({storage:{...localStorage},url:location.href}));
  assert.ok(!JSON.stringify(afterVerification).includes(verificationToken),'Challenge token is never persisted');
  assert.ok(afterVerification.storage['khrental.local.session'],'Server-issued session persists for reload');
  await verifyPage.reload({waitUntil:'networkidle0'});await verifyPage.waitForSelector('textarea');
  assert.equal(normalLogins,loginsBeforeVerification);
  await verifyPage.type('textarea','I verified my email and returned to this rental.');
  await verifyPage.click('input[type="checkbox"]');await verifyPage.click('form button');
  await verifyPage.waitForFunction(()=>document.body.innerText.includes('Your enquiry was sent'));
  assert.equal(submissions,3);assert.equal(row.status,'pending');
  console.log('BROWSER_STAGE=registration_email_new_browser_automatic_session_reload_enquiry');
  // Fresh owner account; email opens in a separately isolated browser context.
  const ownerContext=await browser.createBrowserContext();
  const ownerSignupPage=await ownerContext.newPage();activePage=ownerSignupPage;
  await ownerSignupPage.setRequestInterception(true);
  ownerSignupPage.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  await ownerSignupPage.goto(origin+'/owner-sign-up?country=BN',{waitUntil:'networkidle0'});
  await ownerSignupPage.type('#seeker-name','Synthetic owner');await ownerSignupPage.type('#seeker-email','owner@example.test');
  await ownerSignupPage.click('button[type="submit"]');
  await ownerSignupPage.waitForSelector('a[href="/owner-sign-up?country=BN"]');
  assert.match(await ownerSignupPage.$eval('body',e=>e.innerText),/Check your email/);
  assert.equal(ownerSetupAttempts,0,'Signup acknowledgement never creates a workspace');
  const ownerEmailContext=await browser.createBrowserContext();
  const ownerEmailPage=await ownerEmailContext.newPage();activePage=ownerEmailPage;
  await ownerEmailPage.setRequestInterception(true);
  ownerEmailPage.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
  await ownerEmailPage.goto(ownerVerificationLink,{waitUntil:'networkidle0'});
  assert.equal(ownerEmailPage.url(),origin+'/verify-email');
  await ownerEmailPage.type('#seeker-password','SyntheticFixtureOnly!');await ownerEmailPage.type('#seeker-password-confirm','SyntheticFixtureOnly!');
  const beforeOwnerLogin=normalLogins;
  await ownerEmailPage.click('button[type="submit"]');await ownerEmailPage.waitForSelector('#owner-workspace');
  assert.equal(new URL(ownerEmailPage.url()).searchParams.get('country'),'BN');
  assert.equal(normalLogins,beforeOwnerLogin,'Owner verification uses issued session without a second login');
  await ownerEmailPage.type('#owner-workspace','Synthetic owner workspace');
  await ownerEmailPage.setViewport({width:1280,height:900});
  await ownerEmailPage.screenshot({path:path.join(uxOutput,'owner-setup-desktop.png'),fullPage:true});
  await ownerEmailPage.setViewport({width:390,height:844});
  assert.ok(await ownerEmailPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Owner setup fits mobile');
  await ownerEmailPage.screenshot({path:path.join(uxOutput,'owner-setup-mobile.png'),fullPage:true});
  await ownerEmailPage.click('button[type="submit"]');await ownerEmailPage.waitForSelector('[role="alert"]');
  assert.equal(await ownerEmailPage.$eval('#owner-workspace',e=>e.value),'Synthetic owner workspace');
  await ownerEmailPage.click('button[type="submit"]');
  await ownerSetupHeld;
  await ownerEmailPage.evaluate(()=>{window.ownerFixtureSession={access_token:'synthetic-changed-account',user:{id:'synthetic-account-b'}};});
  releaseOwnerSetup();
  await ownerEmailPage.waitForFunction(()=>document.body.innerText.includes('Your signed-in account changed'));
  assert.equal(await ownerEmailPage.evaluate(()=>localStorage.getItem('khrental.activeTenantId')),null,'Late workspace response preserves the changed account context');
  await ownerEmailPage.evaluate(()=>{delete window.ownerFixtureSession;});
  await ownerEmailPage.click('button[type="submit"]');
  await ownerEmailPage.waitForFunction(()=>location.pathname==='/dashboard/properties/new');
  assert.equal(new URL(ownerEmailPage.url()).searchParams.get('country'),'BN');
  assert.equal(await ownerEmailPage.evaluate(()=>localStorage.getItem('khrental.activeTenantId')),ownerWorkspaceId);
  assert.equal(managementInitializations,0,'Owner entry never initializes unrelated organization storage');
  assert.equal(ownerSetupAttempts,3);
  await ownerEmailContext.close();await ownerContext.close();
  console.log('OWNER_ONBOARDING_BROWSER=PASS email_new_context verified_session country_continuation explicit_workspace retry_preserves_input selected_created_membership first_property_route desktop mobile');
  await page.bringToFront();activePage=page;
  await page.goto(origin+'/enquire?off=1',{waitUntil:'networkidle0'});
  assert.match(await page.$eval('body',e=>e.innerText),/not open yet/);
  assert.equal(await page.$('textarea'),null);
  assert.deepEqual(errors,[]);
  console.log('PROPERTY_ENQUIRIES_BROWSER=PASS listing_login_return consent retry inbox_reply mobile logout_privacy withdrawal signup_email_return default_off');
  }
} catch(error) {
  if(activePage){
    console.error('FIXTURE_VISIBLE_STATE='+await activePage.$eval('body',e=>e.innerText.slice(0,2000)).catch(()=>''));
    const output=process.env.ENQUIRY_PROOF_DIR||'/tmp/quixo-enquiry-browser-proof';
    await fs.mkdir(output,{recursive:true});
    await activePage.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
  }
  throw error;
} finally {
  await browser?.close();await vite?.close();
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
}
