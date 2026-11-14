// Actual routed pages and clients; synthetic reads only, no live account or writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const auth=`import React,{createContext,useContext} from 'react';export const FixtureAuth=createContext(null);export const useAuth=()=>useContext(FixtureAuth);`;
const entry=`import React,{useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route,useNavigate} from 'react-router-dom';import {FixtureAuth} from 'virtual:fixture-auth';import PropertyForm from '/src/pages/PropertyForm.jsx';import MaintenanceDetails from '/src/pages/MaintenanceDetails.jsx';import {Toaster} from 'react-hot-toast';import '/src/index.css';
function Fixture(){const navigate=useNavigate();const [tenant,setTenant]=useState('tenant-a');useEffect(()=>{window.fixtureControls={navigate,setTenant};},[navigate]);return <FixtureAuth.Provider value={{user:{id:'synthetic-actor',role:'admin'},activeTenantId:tenant,membership:{role:'admin',status:'active'},hasPermission:()=>false}}><Toaster/><Routes><Route path="/property/:id" element={<PropertyForm/>}/><Route path="/maintenance/:id" element={<MaintenanceDetails/>}/><Route path="*" element={<p>Fixture home</p>}/></Routes></FixtureAuth.Provider>;}createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);`;
let vite,server,browser,page;
const errors=[];
try{
 const plugin={name:'secondary-loaders-fixture',enforce:'pre',resolveId(id){if(id==='virtual:secondary-loaders'){return '\0secondary-loaders.jsx';}if(id==='virtual:fixture-auth'||/\/hooks\/useAuth(?:\.jsx)?$/.test(id)){return '\0fixture-auth.jsx';}},load(id){if(id==='\0secondary-loaders.jsx'){return transformWithEsbuild(entry,'secondary-loaders.jsx',{loader:'jsx',jsx:'automatic'});}if(id==='\0fixture-auth.jsx'){return auth;}}};
 vite=await createServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
 const app=express();app.use(vite.middlewares);app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import "virtual:secondary-loaders";</script></body></html>')));
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 page=await browser.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('FIXTURE_PAGE_ERROR',e.message);});
 await page.evaluateOnNewDocument(()=>{
  window.pendingFixtureReads=[];
  const original=window.fetch.bind(window);window.fetch=async(url,options={})=>{
   const path=new URL(url,location.origin).pathname;
   if(!path.startsWith('/api/')){return original(url,options);}
   if(path==='/api/mssql/health'){return Response.json({ok:true,connection:'ready'});}
   const body=options.body?JSON.parse(options.body):{};
   // The comments child independently reads the same projection. Keep its
   // immediate empty fixture separate from the page's signal-bearing read.
   if(/^\/api\/maintenance-lifecycle\/requests\/[^/]+$/.test(path)&&!options.signal){
    if(window.fixtureCommentFailure){return Response.json({error:'Synthetic comment read failure'},{status:503});}
    return Response.json({data:{request:{id:path.split('/').at(-1)},images:[],comments:window.fixturePersistedComments||[]}});
   }
   if((path==='/api/platform/query'&&body.table==='properties')||/^\/api\/maintenance-lifecycle\/requests\/[^/]+$/.test(path)){
    // Deliberately return a late success even after abort: scope guards must
    // reject it independently of browser/network cancellation.
    return new Promise(resolve=>{
     const read={aborted:options.signal?.aborted===true,hasSignal:options.signal instanceof AbortSignal,path,body};
     options.signal?.addEventListener('abort',()=>{read.aborted=true;},{once:true});
     read.release=name=>{
      const id=body.filters?.find(f=>f.column==='id')?.value||path.split('/').at(-1);
      const data=path.includes('maintenance-lifecycle')?{request:{id,title:name,description:name,status:name==='Completed demo'?'completed':'pending',notes:name==='Completed demo'?'Retained completion evidence':null,priority:'medium',requesttype:'plumbing',createdat:'2026-11-11T00:00:00Z'},images:[]}:[{id,name,address:'Synthetic location',country_code:'LK',images:[],amenities:[],status:'active'}];
      resolve(Response.json({data}));
     };
     window.pendingFixtureReads.push(read);
    });
   }
   return Response.json({data:path.includes('fixed-utilities')?{configs:[]}:[]});
  };
 });
 await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith(origin)||request.url().startsWith('data:')?request.continue():request.abort());
 await fs.mkdir('r5-browser-proof',{recursive:true});
 for(const kind of ['property','maintenance']){
  console.log('LOADER_FIXTURE',kind,'route/workspace/unmount');
  await page.goto(origin+'/'+kind+'/'+a,{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.pendingFixtureReads.length===1);
  await page.evaluate(path=>window.fixtureControls.navigate(path),'/'+kind+'/'+b);await page.waitForFunction(()=>window.pendingFixtureReads.length===2);
  assert.equal(await page.evaluate(()=>window.pendingFixtureReads[0].hasSignal&&window.pendingFixtureReads[0].aborted),true,kind+' route change aborts the real client signal');
  await page.evaluate(()=>window.pendingFixtureReads[1].release('Current route'));
  const visible=()=>page.evaluate(()=>document.body.innerText+' '+[...document.querySelectorAll('input')].map(x=>x.value).join(' '));
  await page.waitForFunction(()=>document.body.innerText.includes('Current route')||[...document.querySelectorAll('input')].some(x=>x.value==='Current route'));
  await page.evaluate(()=>window.pendingFixtureReads[0].release('Stale route'));
  await new Promise(resolve=>setTimeout(resolve,100));assert.doesNotMatch(await visible(),/Stale route/);
  await page.evaluate(()=>window.fixtureControls.setTenant('tenant-b'));await page.waitForFunction(()=>window.pendingFixtureReads.length===3);
  assert.doesNotMatch(await visible(),/Current route/,'Previous workspace fields are cleared while the next read waits');
  await page.evaluate(()=>window.pendingFixtureReads[2].release('Current workspace'));
  await page.waitForFunction(()=>document.body.innerText.includes('Current workspace')||[...document.querySelectorAll('input')].some(x=>x.value==='Current workspace'));
  for(const width of [390,1440]){await page.setViewport({width,height:1000});await page.screenshot({path:'r5-browser-proof/secondary-'+kind+'-workspace-'+width+'.png',fullPage:true});}
  await page.evaluate(()=>window.fixtureControls.setTenant('tenant-c'));await page.waitForFunction(()=>window.pendingFixtureReads.length===4);
  await page.evaluate(()=>window.fixtureControls.navigate('/'));await page.waitForFunction(()=>window.pendingFixtureReads[3].aborted);
  await page.evaluate(()=>window.pendingFixtureReads[3].release('Unmounted request'));assert.match(await visible(),/Fixture home/);
 }
 // A failed comments read must not relabel completion notes as a new comment.
 await page.goto(origin+'/maintenance/'+a,{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>window.pendingFixtureReads.length===1);
 await page.evaluate(()=>{window.fixtureCommentFailure=true;window.pendingFixtureReads[0].release('Completed demo');});
 await page.waitForFunction(()=>document.body.innerText.includes('Retry loading comments'));
 assert.equal(await page.$eval('textarea#comment',el=>el.closest('form').parentElement.innerText.includes('Retained completion evidence')),false);
 assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/Unknown User|No comments yet/);
 await page.evaluate(()=>{window.fixtureCommentFailure=false;window.fixturePersistedComments=[{id:'comment-proof',comment:'Persisted comment evidence',user_name:'Demo author',created_at:'2026-11-10T10:00:00Z'}];});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='Retry loading comments').click());
 await page.waitForFunction(()=>document.body.innerText.includes('Persisted comment evidence'));
 assert.match(await page.evaluate(()=>document.body.innerText),/Demo author/);
 for(const width of [390,1440]){await page.setViewport({width,height:1000});await page.screenshot({path:'r5-browser-proof/maintenance-comments-'+width+'.png',fullPage:true});}
 console.log('MAINTENANCE_COMMENTS_BROWSER=PASS failed_read_no_fabricated_history retry_persisted_author desktop_mobile');
 assert.deepEqual(errors,[]);console.log('SECONDARY_LOADERS_BROWSER=PASS real_pages real_clients route_abort tenant_reset stale_success_denied unmount_abort synthetic_reads_only');
}catch(error){
 if(page){console.error('FIXTURE_STATE',await page.evaluate(()=>({text:document.body.innerText.slice(0,600),pending:window.pendingFixtureReads?.map(r=>({path:r.path,hasSignal:r.hasSignal,aborted:r.aborted}))})).catch(()=>null));await page.screenshot({path:'r5-browser-proof/secondary-failure.png',fullPage:true}).catch(()=>{});}
 throw error;
}finally{await browser?.close();await vite?.close();await new Promise(resolve=>server?server.close(resolve):resolve());}
