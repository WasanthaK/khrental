// Isolated actual agreement container/form/hook and renter directory. No provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import puppeteer from 'puppeteer';
const owner={id:'owner-global',email:'owner@example.invalid',name:'Workspace Owner',tenant_id:'other-workspace'};
let attempts=0,saves=0,directoryReads=0;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {Toaster} from 'react-hot-toast';import Form from '/src/components/agreements/AgreementFormContainer.jsx';import {requestMssqlApi} from '/src/services/mssqlApiClient.js';import '/src/index.css';
window.nullProof=requestMssqlApi('/api/null');createRoot(document.getElementById('root')).render(<BrowserRouter><Toaster/><Form/></BrowserRouter>);`;
const modules={
 'platformClient':`export const platform={auth:{getTenantContext:async()=>{const r=await fetch('/api/context');return r.json();}}};`,
 'agreementService':`export const listTemplates=async()=>[{id:'template',name:'Fixture'}];export const listProperties=async()=>[{id:'property',name:'House',propertytype:'house',rentalvalues:{rent:100,deposit:200}}];export const listPropertyUnits=async()=>[];export const fetchProperty=async()=>({id:'property',propertytype:'house',rentalvalues:{rent:100,deposit:200}});export const fetchPropertyUnit=async()=>null;export const getTemplate=async()=>({content:'<p>For Tenant:</p><p>For Landlord:</p>'});export const fetchAgreement=async()=>null;`,
 'agreementWorkflowService':`export const renderAgreementContent=()=>'<p>Test contract</p>';export const saveAgreementForStatus=async({formData})=>{await fetch('/api/save',{method:'POST'});return {...formData,id:'saved'};};export const updateAgreementCanonical=async()=>{throw Error('Unexpected signing action')};export const generateAndAttachAgreementDocument=async()=>{throw Error('No provider calls')};`,
 'databaseReadiness':`export const ensureDatabaseReady=async()=>{};`,
 'env':`export const getApiBaseUrl=()=>location.origin;export const isMssqlApiEnabled=()=>true;`,
 'requestContext':`export const buildRequestContextHeaders=()=>({});`
};
const plugin={name:'agreement-identity-proof',enforce:'pre',resolveId(source,importer){
 if(source==='virtual:proof')return '\0proof.jsx';
 if(source.startsWith('\0'))return source;
 if(!importer?.includes('/src/'))return;
 if(source.endsWith('/SignatureForm.jsx'))return '\0signer.jsx';
 const name=source.split('/').at(-1).replace(/\.js$/,'');if(modules[name])return '\0fixture-'+name;
},async load(id){
 if(id==='\0proof.jsx')return transformWithEsbuild(entry,'proof.jsx',{loader:'jsx',jsx:'automatic'});
 if(id==='\0signer.jsx')return transformWithEsbuild(`import React from 'react';export default ({currentUser})=><div role="status">Signing profile: {currentUser.id} / {currentUser.email}</div>;`,'signer.jsx',{loader:'jsx',jsx:'automatic'});
 if(id.startsWith('\0fixture-'))return modules[id.slice(9)];
}};
let vite,server,browser;
try{
 vite=await createServer({configFile:false,plugins:[plugin,react()],server:{middlewareMode:true},appType:'custom'});
 const app=express();
 app.get('/api/mssql/rentees',(req,res)=>{directoryReads++;assert.equal(req.query.status,'active');res.json({data:[{id:'renter-global',name:'Membership Renter',email:'renter@example.invalid',user_type:'seeker',directory_role:'rentee'}]});});
 app.get('/api/context',(req,res)=>{attempts++;res.json(attempts===1?{data:null,error:{message:'Transient'}}:{data:{user:owner,tenantId:'selected-workspace'},error:null});});
 app.post('/api/save',(req,res)=>{saves++;res.json({ok:true});});app.get('/api/null',(req,res)=>res.json({data:null}));
 app.use('/api',(req,res)=>res.status(500).json({error:'Unexpected legacy request'}));
 app.use(vite.middlewares);app.use(async(req,res)=>res.type('html').send(await vite.transformIndexHtml(req.originalUrl,'<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module">import "virtual:proof";</script></body></html>')));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();page.setDefaultTimeout(15000);
 await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)||r.url().startsWith('data:')?r.continue():r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'networkidle0'});
 assert.equal(await page.evaluate(()=>window.nullProof),null,'Null profile remains null');
 await page.waitForFunction(()=>document.body.innerText.includes('Membership Renter'));
 const selects=await page.$$('select');await selects[0].select('template');await selects[1].select('property');await selects[3].select('renter-global');
 const send=()=>page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Send for Signature')).click());
 await send();await page.waitForFunction(()=>document.body.innerText.includes('Unable to load your signing profile'));
 assert.equal(saves,0,'No draft saved or signing dialog opened with missing identity');await send();
 await page.waitForFunction(()=>document.body.innerText.includes('Signing profile: owner-global / owner@example.invalid'));
 assert.equal(saves,1);assert.equal(attempts,2);assert.ok(directoryReads>0);assert.deepEqual(errors,[]);
 await fs.mkdir('enquiry-browser-proof',{recursive:true});await page.screenshot({path:'enquiry-browser-proof/agreement-identity.png'});
 console.log('AGREEMENT_IDENTITY_BROWSER=PASS membership_renter cross_workspace_owner null_response retry');
}finally{await browser?.close();await vite?.close();await new Promise(r=>server?server.close(r):r());}
