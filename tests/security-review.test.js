import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolveTenantContext} from '../src/api/tenant/context.js';
import {createPlatformRouter} from '../src/api/platform/router.js';
import {createManualEmailGuards,validateManualEmail} from '../src/api/email/manualEmailPolicy.js';
import {sanitizeClientAuthMetadata} from '../src/api/auth/index.js';
import {authorizePlatformQuery} from '../src/api/platform/authorization.js';
import {publicApiError} from '../src/api/httpErrors.js';
import {R2StorageDriver,getStorageDriver} from '../src/api/storage/index.js';

const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const context=(role='rentee',id='actor')=>({user:{id,role:'admin'},membership:{role,status:'active',tenant_id:'tenant-a'},tenantId:'tenant-a',memberships:[]});
const serve=async(app,work)=>{
  const server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{return await work('http://127.0.0.1:'+server.address().port);}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
};
const errors=(e,_req,res,_next)=>res.status(e.status||500).json({code:e.code,error:e.message});

test('production cannot accept dev bypass even when explicitly enabled with forged tenant/admin headers',async()=>{
  const before={NODE_ENV:process.env.NODE_ENV,VITE_ENABLE_DEV_BYPASS:process.env.VITE_ENABLE_DEV_BYPASS};
  try{
    process.env.NODE_ENV='production';process.env.VITE_ENABLE_DEV_BYPASS='true';
    const result=await resolveTenantContext({headers:{'x-dev-bypass-role':'admin','x-tenant-id':'foreign-tenant','x-user-id':'fake'}});
    assert.equal(result.user,null);assert.equal(result.isAuthenticated,false);assert.equal(result.identity.devBypassRole,null);
  }finally{for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  assert.match(source('docker-compose.yml'),/VITE_ENABLE_DEV_BYPASS:-false/);
  assert.match(source('docker-compose.yml'),/MSSQL_PASSWORD:\?/);
});

test('client account updates cannot forge verification, invitation or onboarding evidence',()=>{
  for(const value of [{global_email_verified:true},{invitation_registration_verified:true},{role:'admin'},{owner_setup:{tenantId:'foreign'}},{force_password_change:true},[]]) {
    assert.throws(()=>sanitizeClientAuthMetadata(value),{code:'AUTH_METADATA_PROTECTED'});
  }
  assert.deepEqual(sanitizeClientAuthMetadata({name:'Name',force_password_change:false}),{name:'Name',force_password_change:false});
});

test('generic admin query cannot grant, revoke, delete or bulk upsert memberships',()=>{
  for(const action of ['insert','update','delete','upsert'])assert.throws(()=>authorizePlatformQuery({
    ...context('admin'),action,table:'tenant_memberships',payload:[{role:'admin'}],filters:[{column:'id',operator:'eq',value:'target'}]
  }),{code:'MEMBERSHIP_MUTATION_BLOCKED'});
});

test('storage HTTP guards deny renter/staff/tenant-admin bucket mutations before driver calls',async()=>{
  const calls=[];const driver={createBucket:async()=>{calls.push('create');return{};},deleteBucket:async()=>calls.push('delete'),
    upload:async(bucket,path,body,type,options)=>{calls.push({bucket,path,type,options});return{path};},deleteObjects:async()=>{calls.push('objects');return[];}};
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.tenantContext=context(req.get('test-role')||'rentee',req.get('test-actor')||'actor');next();});
  app.use(createPlatformRouter({getStorageDriver:()=>driver,checkPlatformAdmin:async user=>user.id==='platform'}));app.use(errors);
  await serve(app,async origin=>{
    for(const role of ['rentee','staff','admin'])for(const method of ['POST','DELETE']) {
      const r=await fetch(origin+'/storage/buckets'+(method==='DELETE'?'/images':''),{method,headers:{'content-type':'application/json','test-role':role},body:method==='POST'?JSON.stringify({name:'images'}):undefined});
      assert.equal(r.status,403);assert.equal(calls.length,0);
    }
    assert.equal((await fetch(origin+'/storage/buckets',{method:'POST',headers:{'content-type':'application/json','test-actor':'platform'},body:JSON.stringify({name:'images'})})).status,201);
    calls.length=0;
    for(const role of ['rentee','staff'])assert.equal((await fetch(origin+'/storage/objects',{method:'DELETE',headers:{'content-type':'application/json','test-role':role},body:JSON.stringify({bucket:'images',paths:['properties/existing.jpg']})})).status,403);
    assert.equal(calls.length,0);
    const image=Buffer.from([0xff,0xd8,0xff,1]);
    for(const path of ['properties/existing.jpg','maintenance/other/old.jpg'])assert.equal((await fetch(origin+'/storage/upload?bucket=images&path='+path,{method:'POST',headers:{'content-type':'image/jpeg'},body:image})).status,403);
    assert.equal(calls.length,0);
    const own=await fetch(origin+'/storage/upload?bucket=images&path=maintenance/photo.jpg',{method:'POST',headers:{'content-type':'image/jpeg'},body:image});
    assert.equal(own.status,201);assert.equal(calls[0].path,'tenants/tenant-a/maintenance/actor/photo.jpg');assert.equal(calls[0].options.createOnly,true);
    const svg=await fetch(origin+'/storage/upload?bucket=images&path=maintenance/photo.svg',{method:'POST',headers:{'content-type':'image/svg+xml'},body:'<svg onload="alert(1)"/>'});assert.equal(svg.status,403);
  });
});

test('local and R2 append-only uploads deny overwrites atomically',async()=>{
  const driver=getStorageDriver();const path='security-fixture-'+crypto.randomUUID()+'.jpg';
  try{
    await driver.upload('images',path,Buffer.from('first'),'image/jpeg',{createOnly:true});
    await assert.rejects(driver.upload('images',path,Buffer.from('second'),'image/jpeg',{createOnly:true}),{code:'STORAGE_OBJECT_EXISTS'});
    assert.equal((await driver.getObject('images',path)).body.toString(),'first');
  }finally{await driver.deleteObjects('images',[path]);}
  let headers;
  await R2StorageDriver.prototype.upload.call({objectKey:()=> 'key',request:async(_method,_key,options)=>{headers=options.headers;}},'images','test.jpg',Buffer.from('x'),'image/jpeg',{createOnly:true});
  assert.equal(headers['if-none-match'],'*');
});

test('manual mail denies non-admins and quota failures without dispatch, and rate limits both actor/tenant',async()=>{
  let used=0,dispatch=0;const quotas=[];
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{const ctx=context(req.get('test-role')||'admin');Object.assign(req,{user:ctx.user,membership:ctx.membership,tenantId:ctx.tenantId,authSession:{}});next();});
  app.post('/send',...createManualEmailGuards({resolveContext:(_req,_res,next)=>next(),secret:'s'.repeat(32),limiter:{durable:true,consume:async input=>{quotas.push(input);return ++used<=2;}}}),(_req,res)=>{dispatch++;res.json({ok:true});});app.use(errors);
  await serve(app,async origin=>{
    const send=role=>fetch(origin+'/send',{method:'POST',headers:{'content-type':'application/json','test-role':role},body:JSON.stringify({to:'recipient@example.test',subject:'Test',text:'Test',from:'spoof@example.test'})});
    for(const role of ['rentee','staff'])assert.equal((await send(role)).status,403);
    assert.equal(dispatch,0);assert.equal(quotas.length,0);
    assert.equal((await send('admin')).status,200);assert.equal(dispatch,1);
    const limited=await send('admin');assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');assert.equal(dispatch,1);
    assert.deepEqual(quotas.slice(0,2).map(x=>x.scope),['manual-email-user','manual-email-tenant']);
    assert.ok(quotas.every(x=>/^[a-f0-9]{64}$/.test(x.key)));assert.notEqual(quotas[0].key,quotas[1].key);
  });
  const guards=createManualEmailGuards({resolveContext:()=>{},secret:'s'.repeat(32),limiter:{durable:true,consume:async()=>{throw Error('private SQL');}}});
  const ctx=context('admin');let error;
  await guards[1]({...ctx,authSession:{},body:{to:'a@example.test',subject:'Test',text:'Test'}},{},e=>{error=e;});
  assert.equal(error.code,'EMAIL_LIMITER_UNAVAILABLE');assert.ok(!error.message.includes('private SQL'));
  assert.match(source('server.js'),/sender: getDefaultEmailSender\(\)/);
  assert.doesNotMatch(source('server.js'),/getDefaultEmailSender\(\{ from/);
});

test('manual mail bounds recipient, subject, content and attachment payloads',()=>{
  const good={to:'a@example.test',subject:'Test',text:'Test'};
  for(const patch of [{to:Array(6).fill('a@example.test')},{to:'a@example.test\r\nBcc:other@example.test'},{subject:'bad\nheader'},{html:'x'.repeat(200001)},{attachments:Array(6).fill({filename:'x',content:'x'})}])assert.throws(()=>validateManualEmail({...good,...patch}),{code:'EMAIL_REQUEST_INVALID'});
});

test('5xx public errors hide raw SQL/provider details and return a server-generated request id',()=>{
  for(const status of [500,502,503]){
    const r=publicApiError({status,message:'private database host and credential',details:{connection:'private'},code:'ELOGIN'});
    assert.equal(r.status,status);assert.match(r.body.requestId,/^[a-f0-9-]{36}$/);assert.doesNotMatch(JSON.stringify(r.body),/private|ELOGIN/);
  }
  assert.equal(publicApiError({status:403,message:'Denied',code:'DENIED'}).body.code,'DENIED');
});

test('browser token path is retired and builds reject secret-prefixed settings',()=>{
  assert.match(source('vite.config.js'),/forbidden.some/);
  assert.doesNotMatch(source('vite.config.js'),/JSON.stringify\(env.VITE_EVIA_ACCESS_TOKEN\)/);
  assert.doesNotMatch(source('src/services/eviaSignServiceLegacy.js'),/VITE_EVIA_ACCESS_TOKEN/);
  assert.doesNotMatch(source('src/scripts/getEviaAccessToken.js'),/tokenData|fetch\(|VITE_EVIA_ACCESS_TOKEN/);
});
