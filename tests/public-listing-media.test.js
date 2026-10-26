import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import {
  publicMediaEnabled,mediaObjectPath,publicMediaDTO,verifySafeWebp
} from '../src/api/publicListings/media.js';
import {createPublicListingsRouter} from '../src/api/publicListings/router.js';

const listingId='11111111-1111-4111-8111-111111111111';
const mediaId='22222222-2222-4222-8222-222222222222';
const bytes=fs.readFileSync('marketing/assets/hero-house.webp');
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const meta={mediaId,listingPublicId:listingId,imageBytes:bytes.length,derivativeSha256:sha256};
const row={
  public_id:listingId,country_code:'LK',propertytype:'house',
  public_headline:'Example property',location_label:'Colombo district',
  monthly_rent:1500,opted_out:false,property_id:'PRIVATE_ID',images:'PRIVATE_SAS'
};
const on={
  PUBLIC_LISTING_READ_ENABLED:'true',
  PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true',
  PUBLIC_LISTING_MEDIA_ENABLED:'true',
  PUBLIC_LISTING_IMAGE_PROCESSOR_READY:'true'
};
const http=async(router,path)=>{
  const app=express();app.use('/api/public-listings',router);
  app.use((e,req,res,next)=>res.status(e.status||500).json({code:e.code||'ERROR'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+path);
    const contentType=response.headers.get('content-type')||'';
    const value=contentType.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());
    return {status:response.status,contentType,headers:response.headers,value};
  }finally{await new Promise(resolve=>server.close(resolve));}
};
test('private image access is impossible when public image gates default OFF',async()=>{
  let accessed=0;
  const r=createPublicListingsRouter({env:{
    PUBLIC_LISTING_READ_ENABLED:'true',
    PUBLIC_LISTING_SHARED_RATE_LIMIT_READY:'true'
  },rateLimit:async()=>true,
  findMedia:async()=>{accessed++;return meta;},
  readDerivative:async()=>{accessed++;return {body:bytes,contentType:'image/webp'};}});
  const result=await http(r,'/api/public-listings/'+listingId+'/media/'+mediaId+'?country=LK');
  assert.equal(result.status,404);assert.equal(accessed,0);
  assert.equal(publicMediaEnabled({PUBLIC_LISTING_MEDIA_ENABLED:'true'}),false);
  assert.equal(publicMediaEnabled({PUBLIC_LISTING_IMAGE_PROCESSOR_READY:'true'}),false);
});
test('storage object path is independent of tenant IDs, uploaded filenames and request paths',()=>{
  assert.equal(mediaObjectPath(listingId,mediaId),'public-listings/'+listingId+'/'+mediaId+'.webp');
  assert.throws(()=>mediaObjectPath('../private',mediaId));
  assert.throws(()=>mediaObjectPath(listingId,'/storage/images/private.jpg'));
  const dto=publicMediaDTO({listingPublicId:listingId,mediaId,alt:'Living room'},'LK');
  assert.deepEqual(Object.keys(dto),['url','alt']);
  assert.equal(dto.url,'/api/public-listings/'+listingId+'/media/'+mediaId+'?country=LK');
  assert.equal(JSON.stringify(dto).includes('tenants/'),false);
  assert.throws(()=>publicMediaDTO({listingPublicId:listingId,mediaId},'OTHER'));
});
test('real design WebP is a valid processed container; header and hash verified',()=>{
  const result=verifySafeWebp(bytes,meta);
  assert.equal(result.body,bytes);
  assert.equal(result.contentType,'image/webp');
  assert.throws(()=>verifySafeWebp(bytes,{...meta,derivativeSha256:'0'.repeat(64)}),/hash mismatch/);
  assert.throws(()=>verifySafeWebp(bytes,{...meta,imageBytes:bytes.length-1}),/length changed/);
  const altered=Buffer.from(bytes);
  altered.write('EXIF',12,'ascii');
  assert.throws(()=>verifySafeWebp(altered),/prohibited metadata/);
  const noRiff=Buffer.from(bytes);noRiff.write('JUNK',0,'ascii');
  assert.throws(()=>verifySafeWebp(noRiff),/Invalid processed WebP/);
  assert.throws(()=>verifySafeWebp(Buffer.alloc(2097153)),/outside safe size/);
});
test('public image only displays verified derivative when selected market and metadata are valid',async()=>{
  const calls=[];
  const r=createPublicListingsRouter({env:on,
    rateLimit:async key=>{calls.push(key);return true;},
    findMedia:async p=>{calls.push(p);return p.country==='LK'?meta:null;},
    readDerivative:async args=>{calls.push(args.mediaId);return {body:bytes,contentType:'image/webp'};}
  });
  const url='/api/public-listings/'+listingId+'/media/'+mediaId;
  const valid=await http(r,url+'?country=LK');
  assert.equal(valid.status,200);
  assert.equal(valid.contentType,'image/webp');
  assert.ok(valid.value.equals(bytes));
  assert.match(valid.headers.get('cache-control'),/no-store/);
  assert.equal(valid.headers.get('x-content-type-options'),'nosniff');
  assert.equal(calls.filter(x=>typeof x==='object').length,2,'visibility rechecked before send');
  assert.equal((await http(r,url+'?country=BN')).status,404,'wrong country denied');
  assert.equal((await http(r,url)).status,400,'country is mandatory');
  assert.equal((await http(r,'/api/public-listings/'+listingId+'/media/traversal?country=LK')).status,404);
});
test('rented, reserved, opted-out or image removed between reads cannot serve cached media',async()=>{
  for(const reason of ['reserved','rented','optedout','sourceRemoved']){
    let seen=0;
    const r=createPublicListingsRouter({env:on,rateLimit:async()=>true,
      findMedia:async()=>{seen++;return reason==='sourceRemoved'&&seen===1?meta:null;},
      readDerivative:async()=>({body:bytes,contentType:'image/webp'})});
    assert.equal((await http(r,'/api/public-listings/'+listingId+'/media/'+mediaId+'?country=LK')).status,404,reason);
  }
});
test('public list exposes only approved image ids and alt; no original/private storage URLs',async()=>{
  const r=createPublicListingsRouter({
    env:on,rateLimit:async()=>true,
    list:async()=>[row],
    listMedia:async()=>[{listingPublicId:listingId,mediaId,alt:'Safe derivative'}]
  });
  const result=await http(r,'/api/public-listings/?country=LK');
  assert.equal(result.status,200);
  assert.equal(result.value.data.length,1);
  assert.deepEqual(result.value.data[0].images,[{
    url:'/api/public-listings/'+listingId+'/media/'+mediaId+'?country=LK',alt:'Safe derivative'
  }]);
  assert.equal(JSON.stringify(result.value).includes('PRIVATE'),false);
});
test('public read limiter blocks image bytes before accessing manifest or bucket',async()=>{
  let reads=0;
  const r=createPublicListingsRouter({env:on,rateLimit:async()=>false,
    findMedia:async()=>{reads++;return meta;},
    readDerivative:async()=>{reads++;return {body:bytes,contentType:'image/webp'};}});
  const result=await http(r,'/api/public-listings/'+listingId+'/media/'+mediaId+'?country=LK');
  assert.equal(result.status,429);assert.equal(reads,0);
});
