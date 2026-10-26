import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import {listAdminPhotos,previewAdminPhoto} from '../src/api/publicListings/adminPhotos.js';
import {createPublicListingPreferencesRouter} from '../src/api/publicListings/router.js';
import {readPublicDerivative} from '../src/api/publicListings/media.js';

const tenant='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const property='33333333-3333-4333-8333-333333333333';
const listing='44444444-4444-4444-8444-444444444444';
const mediaId='55555555-5555-4555-8555-555555555555';
const args={tenantId:tenant,actorId:actor,propertyId:property,mediaId};
const meta={listingPublicId:listing,mediaStatus:'withheld',sourceImages:'[]',derivativeSha256:'a'.repeat(64)};
const photo=fs.readFileSync('marketing/assets/hero-house.webp');
const flags={PUBLIC_LISTING_MANAGEMENT_ENABLED:'true',PUBLIC_LISTING_MEDIA_REVIEW_ENABLED:'true'};
const admin={user:{id:actor,role:'admin'},authSession:{},tenantId:tenant,
  membership:{tenant_id:tenant,role:'admin',status:'active'}};
const serve=async(options,route,identity=admin)=>{
  const app=express();
  app.use((req,res,next)=>{Object.assign(req,identity);next();});
  app.use('/prefs',createPublicListingPreferencesRouter({context:(req,res,next)=>next(),...options}));
  app.use((e,req,res,next)=>res.status(e.status||500).json({code:e.code||'ERR'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
    const res=await fetch('http://127.0.0.1:'+server.address().port+'/prefs/'+property+route);
    return {status:res.status,headers:res.headers,body:Buffer.from(await res.arrayBuffer())};
  }finally{await new Promise(resolve=>server.close(resolve));}
};

test('admin manifest keeps registered indexes without exposing source or storage details',async()=>{
  const result=await listAdminPhotos(args,{env:flags,
    snapshot:async()=>({sourceImages:JSON.stringify([
      '/storage/images/tenants/'+tenant+'/properties/photo.jpg',
      'https://evil.example/private.jpg',
      '/storage/images/tenants/'+listing+'/properties/foreign.jpg'
    ])}),
    rows:async()=>[{mediaId,imageIndex:0,altText:'Exterior',status:'withheld',sourceSha256:'secret',sourceImages:'secret'}]
  });
  assert.deepEqual(result,{photos:[{imageIndex:0}],prepared:[{mediaId,imageIndex:0,altText:'Exterior',status:'withheld'}],canPrepare:false,canReview:true});
  await assert.rejects(listAdminPhotos(args,{snapshot:async()=>null}),{status:404});
});
test('private preview serves withheld derivative without anonymous release flags or state writes',async()=>{
  let reads=0;
  const result=await previewAdminPhoto(args,{env:flags,load:async()=>({...meta}),read:async value=>{
    reads++;assert.equal(value.listingId,listing);assert.equal(value.mediaId,mediaId);return {body:photo};
  }});
  assert.deepEqual(result.body,photo);assert.equal(reads,1);
});
test('disabled, withdrawn, foreign or revoked access never reads preview bytes',async()=>{
  let reads=0;
  const read=async()=>{reads++;return {body:photo};};
  await assert.rejects(previewAdminPhoto(args,{env:{},load:async()=>meta,read}),{status:404});
  for(const record of [null,{...meta,mediaStatus:'withdrawn'}])
    await assert.rejects(previewAdminPhoto(args,{env:flags,load:async()=>record,read}),{status:404});
  assert.equal(reads,0);
});
test('preview fails if membership, source, derivative or state changes during storage read',async()=>{
  for(const after of [null,{...meta,sourceImages:'changed'},{...meta,mediaStatus:'withdrawn'},
    {...meta,derivativeSha256:'b'.repeat(64)},{...meta,listingPublicId:actor}]){
    let count=0;
    await assert.rejects(previewAdminPhoto(args,{env:flags,load:async()=>count++?after:meta,read:async()=>({body:photo})}),{status:409});
  }
});
test('private preview uses actual derivative integrity verification',async()=>{
  await assert.rejects(previewAdminPhoto(args,{env:flags,load:async()=>meta,
    read:params=>readPublicDerivative({...params,driver:{getObject:async()=>({body:photo})}})
  }),/hash mismatch/);
});
test('admin photo GET routes deny anonymous, staff, revoked and wrong-tenant contexts',async()=>{
  let calls=0;
  const options={env:flags,adminPhotos:async()=>{calls++;return {};},previewPhoto:async()=>{calls++;return {body:photo};}};
  for(const identity of [{}, {...admin,membership:{...admin.membership,status:'inactive'}},
    {...admin,membership:{...admin.membership,tenant_id:listing}},
    {...admin,user:{id:actor,role:'staff'},membership:{...admin.membership,role:'staff'}}]){
    for(const path of ['/media','/media/'+mediaId+'/preview'])assert.equal((await serve(options,path,identity)).status,403);
  }
  assert.equal((await serve({...options,env:{}},'/media')).status,404);
  assert.equal((await serve({...options,env:{PUBLIC_LISTING_MANAGEMENT_ENABLED:'true'}},'/media/'+mediaId+'/preview')).status,404);
  assert.equal(calls,0);
});
test('successful private preview is no-store WebP with safe disposition and tenant actor binding',async()=>{
  const result=await serve({env:flags,previewPhoto:async identity=>{
    assert.deepEqual(identity,args);return {body:photo};
  }},'/media/'+mediaId+'/preview');
  assert.equal(result.status,200);assert.deepEqual(result.body,photo);
  assert.equal(result.headers.get('cache-control'),'private, no-store, max-age=0');
  assert.equal(result.headers.get('x-content-type-options'),'nosniff');
  assert.match(result.headers.get('content-type'),/^image\/webp/);
  assert.equal(result.headers.get('location'),null);
});
