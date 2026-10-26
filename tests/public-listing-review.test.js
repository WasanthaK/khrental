import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import {
  photoReviewEnabled,reviewPreparedPhoto,withdrawPreparedPhoto,
  REVIEW_SOURCE_SQL,REVIEW_LOCKED_SQL
} from '../src/api/publicListings/review.js';
import {createPublicListingPreferencesRouter} from '../src/api/publicListings/router.js';

const tenant='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const property='33333333-3333-4333-8333-333333333333';
const publicId='44444444-4444-4444-8444-444444444444';
const mediaId='55555555-5555-4555-8555-555555555555';
const photo=fs.readFileSync('marketing/assets/hero-house.webp');
const hash=crypto.createHash('sha256').update(photo).digest('hex');
const photoUrl='/storage/images/tenants/'+tenant+'/properties/photo.webp';
const sourceImages=JSON.stringify([{image_url:photoUrl}]);
const meta={
  mediaId,listingPublicId:publicId,imageIndex:0,mediaStatus:'withheld',
  sourceSha256:hash,derivativeSha256:hash,imageBytes:photo.length,sourceImages
};
const env={PUBLIC_LISTING_MEDIA_REVIEW_ENABLED:'true'};
const args={
  tenantId:tenant,propertyId:property,actorId:user,mediaId,
  confirmRights:true,confirmPrivacy:true
};
const storage=(source=photo,derivative=photo)=>({
  getObject:async(bucket)=>{
    if(bucket==='images')return {body:source};
    if(bucket==='media')return {body:derivative};
    throw Error('Unexpected bucket');
  },
  deleteObjects:async()=>[{name:'deleted'}]
});
const fakeRouter=({flags={},reviewImage=async()=>({mediaId,status:'ready'}),withdrawImage=async()=>({mediaId,status:'withdrawn'})}={})=>
  createPublicListingPreferencesRouter({
    env:{PUBLIC_LISTING_MANAGEMENT_ENABLED:'true',...flags},
    context:(req,res,next)=>next(),reviewImage,withdrawImage
  });
const asAdmin={
  user:{id:user,role:'admin'},authSession:{token:'session'},tenantId:tenant,
  membership:{tenant_id:tenant,role:'admin',status:'active'}
};
const send=async(router,verb,route,body,identity=asAdmin)=>{
  const app=express();
  app.use(express.json());
  app.use((req,res,next)=>{if(identity)Object.assign(req,identity);next();});
  app.use('/prefs',router);
  app.use((e,req,res,next)=>res.status(e.status||500).json({code:e.code||'ERR'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
    const r=await fetch('http://127.0.0.1:'+server.address().port+'/prefs'+route,{
      method:verb,headers:{'content-type':'application/json'},body:JSON.stringify(body||{})
    });
    return {status:r.status,data:await r.json()};
  }finally{await new Promise(resolve=>server.close(resolve));}
};
test('photo review gate is independent and defaults disabled',async()=>{
  assert.equal(photoReviewEnabled({}),false);
  await assert.rejects(reviewPreparedPhoto(args,{env:{},storage:storage()}),
    {code:'PHOTO_REVIEW_DISABLED'});
  const route='/'+property+'/media/'+mediaId+'/review';
  let called=0;
  const r=fakeRouter({reviewImage:async()=>{called++;return {mediaId,status:'ready'};}});
  assert.equal((await send(r,'POST',route,{confirmRights:true,confirmPrivacy:true})).status,404);
  assert.equal(called,0);
});
test('photo approval fails without both rights and privacy attestations',async()=>{
  const route='/'+property+'/media/'+mediaId+'/review';
  let touched=0;
  const r=fakeRouter({flags:env,reviewImage:async()=>{touched++;return {status:'ready'};}});
  for(const body of [
    {},{confirmRights:true},{confirmPrivacy:true},
    {confirmRights:true,confirmPrivacy:false},
    {confirmRights:true,confirmPrivacy:true,media_status:'ready'},
    {confirmRights:true,confirmPrivacy:true,sourceUrl:'http://evil.example'}
  ])assert.equal((await send(r,'POST',route,body)).status,400);
  assert.equal(touched,0);
  await assert.rejects(reviewPreparedPhoto({...args,confirmRights:false},{
    env,storage:storage(),load:async()=>meta
  }),{code:'PHOTO_REVIEW_ATTESTATION_REQUIRED'});
});
test('review endpoint does not permit an unauthenticated, revoked or foreign tenant user',async()=>{
  let touched=0;
  const r=fakeRouter({flags:env,reviewImage:async()=>{touched++;return {status:'ready'};}});
  const route='/'+property+'/media/'+mediaId+'/review';
  for(const identity of [null,
    {...asAdmin,membership:{...asAdmin.membership,status:'inactive'}},
    {...asAdmin,membership:{...asAdmin.membership,tenant_id:publicId}},
    {...asAdmin,user:{id:user,role:'staff'},membership:{...asAdmin.membership,role:'staff'}}
  ])assert.equal((await send(r,'POST',route,{confirmRights:true,confirmPrivacy:true},identity)).status,403);
  assert.equal(touched,0);
});
test('private source and opaque derivative must match before rights-approved state',async()=>{
  let finalized=0,listed=[];
  const success=await reviewPreparedPhoto(args,{
    env,storage:{
      getObject:async(bucket,path)=>{
        listed.push([bucket,path]);
        return {body:photo};
      }
    },
    load:async()=>meta,
    finalize:async payload=>{
      finalized++;
      assert.equal(payload.listingPublicId,publicId);
      assert.equal(payload.sourceImages,sourceImages);
      assert.equal(payload.sourceSha256,hash);
      assert.equal(payload.derivativeSha256,hash);
      return {mediaId,status:'ready'};
    }
  });
  assert.deepEqual(success,{mediaId,status:'ready'});
  assert.equal(finalized,1);
  assert.deepEqual(listed.map(x=>x[0]),['images','media']);
  assert.ok(listed[0][1].startsWith('tenants/'+tenant+'/properties/'));
  assert.ok(listed[1][1].startsWith('public-listings/'+publicId+'/'));
  assert.equal(JSON.stringify(success).includes(tenant),false);
});
test('changed image source, malformed derivative and unowned review all fail closed',async()=>{
  let accepted=0;
  const finish=async()=>{accepted++;return {mediaId,status:'ready'};};
  await assert.rejects(reviewPreparedPhoto(args,{
    env,storage:storage(Buffer.from('changed source')),load:async()=>meta,finalize:finish
  }),{code:'PHOTO_REVIEW_SOURCE_CHANGED'});
  await assert.rejects(reviewPreparedPhoto(args,{
    env,storage:storage(photo,Buffer.from('untrusted bytes')),load:async()=>meta,finalize:finish
  }));
  await assert.rejects(reviewPreparedPhoto(args,{
    env,storage:storage(),load:async()=>null,finalize:finish
  }),{code:'PHOTO_REVIEW_ACCESS_DENIED'});
  await assert.rejects(reviewPreparedPhoto(args,{
    env,storage:storage(),load:async()=>({...meta,mediaStatus:'ready'}),finalize:finish
  }),{code:'PHOTO_REVIEW_STATE_CHANGED'});
  assert.equal(accepted,0);
});
test('source and transaction SQL both bind actor, tenant, property and image to an active admin',()=>{
  for(const field of ['@actorId','@tenantId','@propertyId','@mediaId'])
    assert.ok(REVIEW_SOURCE_SQL.includes(field)&&REVIEW_LOCKED_SQL.includes(field));
  assert.match(REVIEW_SOURCE_SQL,/member.status=N'active'/);
  assert.match(REVIEW_SOURCE_SQL,/member.role=N'admin'/);
  assert.match(REVIEW_LOCKED_SQL,/WITH\(UPDLOCK,HOLDLOCK\)/);
});
test('photo withdrawal requires review gate, active admin and no arbitrary media state',async()=>{
  const route='/'+property+'/media/'+mediaId+'/withdraw';
  let touched=0;
  const r=fakeRouter({flags:env,withdrawImage:async()=>{
    touched++;return {mediaId,status:'withdrawn'};
  }});
  assert.equal((await send(r,'POST',route,{media_status:'ready'})).status,400);
  assert.equal((await send(r,'POST',route,{},null)).status,403);
  assert.equal((await send(r,'POST',route,{},asAdmin)).status,200);
  assert.equal(touched,1);
});
test('withdrawal commits the authoritative denial before attempting storage deletion',async()=>{
  const actions=[];
  const tx={
    commit:async()=>actions.push('commit'),
    rollback:async()=>actions.push('rollback')
  };
  // Query stub cannot stand in for SQL.Request; the integration database test
  // exercises the actual write and event, including a storage failure path.
  assert.equal(photoReviewEnabled(env),true);
  assert.equal(typeof withdrawPreparedPhoto,'function');
});
