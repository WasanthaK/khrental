import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPilot} from '../scripts/verify-one-property-pilot.mjs';

// Synthetic examples only. No production property, photo or listing references.
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const media='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const expected={id,country:'LK',category:'residential',title:'Example rental',location:'Sri Lanka',
  monthlyRent:1,currency:'LKR',images:[{url:`/api/public-listings/${id}/media/${media}?country=LK`,alt:'Example'}]};
const webp=()=>{
  const bytes=Buffer.alloc(22);bytes.write('RIFF');bytes.writeUInt32LE(14,4);bytes.write('WEBP',8);
  bytes.write('VP8L',12);bytes.writeUInt32LE(2,16);return bytes;
};
function fixture(change=()=>{},disabled=false){
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    const u=new URL(url),country=u.searchParams.get('country');
    let status=200,body,bytes;
    const headers={'cache-control':'no-store, max-age=0','vary':'Origin'};
    if(options.headers.Origin!=='https://untrusted.invalid')headers['access-control-allow-origin']=options.headers.Origin;
    if(disabled)status=404;
    else if(!['LK','BN'].includes(country))status=400;
    else if(u.pathname.endsWith('/public-listings'))body={country,data:country==='LK'?[structuredClone(expected)]:[]};
    else if(!u.pathname.startsWith('/api/public-listings/'+id)||country==='BN')status=404;
    else if(u.pathname.includes('/media/')){
      bytes=webp();headers['content-type']='image/webp';headers['x-content-type-options']='nosniff';
    }else body={data:structuredClone(expected)};
    const result={status,body,bytes,headers};change(result,u);
    return new Response(result.bytes||JSON.stringify(result.body||{}),{status:result.status,headers:result.headers});
  };
  return {fetcher,calls};
}

test('accepts exact one-property projection and all anonymous boundaries',async()=>{
  const f=fixture();await verifyPilot({mode:'active',expected,fetcher:f.fetcher});
  for(const {url,options} of f.calls){
    assert.equal(new URL(url).origin,'https://app.quixo.homes');
    assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
  }
});
test('disabled check needs no private projection',async()=>{
  const f=fixture(()=>{},true);await verifyPilot({mode:'disabled',fetcher:f.fetcher});
});
for(const [name,change] of [
  ['extra listing',(r,u)=>{if(u.pathname.endsWith('/public-listings')&&u.searchParams.get('country')==='LK')r.body.data.push(structuredClone(expected));}],
  ['private field',(r)=>{if(r.body?.data?.[0])r.body.data[0].privateAddress='forbidden';}],
  ['changed approved rent',(r)=>{if(r.body?.data?.[0])r.body.data[0].monthlyRent=2;}],
  ['missing photo',(r)=>{if(r.body?.data?.[0])r.body.data[0].images=[];}],
  ['wrong-country detail',(r,u)=>{if(u.pathname.endsWith(id)&&u.searchParams.get('country')==='BN'){r.status=200;r.body={data:expected};}}],
  ['cached response',(r)=>{r.headers['cache-control']='public, max-age=3600';}],
  ['credentialed CORS',(r)=>{r.headers['access-control-allow-credentials']='true';}],
  ['untrusted CORS',(r,u)=>{r.headers['access-control-allow-origin']='*';}],
  ['anonymous cookie',(r)=>{r.headers['set-cookie']='session=example';}],
  ['malformed image',(r)=>{if(r.bytes)r.bytes=Buffer.from('not a WebP');}],
  ['EXIF metadata',(r)=>{if(r.bytes)r.bytes.write('EXIF',12);}]
])test('rejects '+name,async()=>{
  await assert.rejects(verifyPilot({mode:'active',expected,fetcher:fixture(change).fetcher}));
});
test('rejects unsafe expected image URL before network requests',async()=>{
  const copy=structuredClone(expected);copy.images[0].url='https://untrusted.invalid/photo';
  const f=fixture();await assert.rejects(verifyPilot({mode:'active',expected:copy,fetcher:f.fetcher}));assert.equal(f.calls.length,0);
});
test('disabled check fails if either market opens',async()=>{
  await assert.rejects(verifyPilot({mode:'disabled',fetcher:fixture().fetcher}));
});
