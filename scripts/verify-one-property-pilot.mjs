import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const origin='https://app.quixo.homes';
const site='https://mango-grass-0314c0100.3.azurestaticapps.net';
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields=['id','country','category','title','location','monthlyRent','currency','images'];
const check=(condition,label)=>assert.ok(condition,label);

export function validateExpected(expected){
  check(expected&&idPattern.test(expected.id)&&expected.country==='LK'&&expected.currency==='LKR','Missing approved pilot projection');
  assert.deepEqual(Object.keys(expected).sort(),[...fields].sort(),'Unexpected expected projection fields');
  check(Array.isArray(expected.images)&&expected.images.length===1,'Exactly one reviewed photo required');
  const photo=expected.images[0];
  assert.deepEqual(Object.keys(photo).sort(),['alt','url'],'Unexpected expected image fields');
  const prefix='/api/public-listings/'+encodeURIComponent(expected.id)+'/media/';
  check(typeof photo.url==='string'&&photo.url.startsWith(prefix),'Unexpected media route');
  const mediaId=photo.url.slice(prefix.length).split('?')[0];
  check(idPattern.test(mediaId)&&photo.url===prefix+mediaId+'?country=LK','Unexpected media identifier or country');
  return {photo,mediaId};
}

// Fixed origins, no credentials, redirects or response bodies in logs. Expected
// content is supplied privately, never from a public workflow input or fixture.
export async function verifyPilot({mode,expected,fetcher=fetch}){
  check(['disabled','active'].includes(mode),'Unsupported verification mode');
  const request=async(path,{status=200,cors=false,binary=false,cache=true,requestOrigin=site}={})=>{
    const response=await fetcher(origin+path,{
      redirect:'error',credentials:'omit',cache:'no-store',
      headers:{Origin:requestOrigin},signal:AbortSignal.timeout(15000)
    });
    check(response.status===status,'Unexpected endpoint status');
    if(cache)check(/\bno-store\b/i.test(response.headers.get('cache-control')||''),'Missing no-store');
    check(!response.headers.get('set-cookie'),'Unexpected anonymous cookie');
    check(!response.headers.get('access-control-allow-credentials'),'Unexpected credentialed CORS');
    if(cors){
      check(response.headers.get('access-control-allow-origin')===requestOrigin,'Missing allowed CORS');
      check(/\borigin\b/i.test(response.headers.get('vary')||''),'Missing CORS Vary');
    }
    if(requestOrigin==='https://untrusted.invalid')check(!response.headers.get('access-control-allow-origin'),'Untrusted CORS');
    return binary?response:status===200?response.json():null;
  };
  if(mode==='disabled'){
    for(const country of ['LK','BN'])await request('/api/public-listings?country='+country,{status:404,cache:false});
    return;
  }
  const {photo,mediaId}=validateExpected(expected);
  const same=(actual)=>assert.deepEqual(actual,expected,'Public projection differs from private approved projection');
  const collection=await request('/api/public-listings?country=LK',{cors:true});
  assert.deepEqual(Object.keys(collection).sort(),['country','data']);
  check(collection.country==='LK'&&Array.isArray(collection.data)&&collection.data.length===1,'Pilot scope exceeded or listing unavailable');
  same(collection.data[0]);
  const detailPath='/api/public-listings/'+encodeURIComponent(expected.id);
  const detail=await request(detailPath+'?country=LK',{cors:true});
  assert.deepEqual(Object.keys(detail),['data']);same(detail.data);
  const bn=await request('/api/public-listings?country=BN',{cors:true});
  assert.deepEqual(bn,{country:'BN',data:[]},'BN inventory must be empty');
  await request(detailPath+'?country=BN',{status:404,cors:true});
  await request(photo.url.replace('?country=LK','?country=BN'),{status:404,cors:true});
  await request('/api/public-listings',{status:400,cors:true});
  await request('/api/public-listings?country=XX',{status:400,cors:true});
  const other=expected.id.toLowerCase()==='11111111-1111-4111-8111-111111111111'
    ?'22222222-2222-4222-8222-222222222222':'11111111-1111-4111-8111-111111111111';
  await request('/api/public-listings/'+other+'?country=LK',{status:404,cors:true});
  await request('/api/public-listings/'+other+'/media/'+mediaId+'?country=LK',{status:404,cors:true});
  await request('/api/public-listings?country=LK',{requestOrigin:'https://untrusted.invalid'});
  const image=await request(photo.url,{binary:true,cors:true});
  check(image.headers.get('content-type')?.split(';')[0]==='image/webp','Unexpected image type');
  check(image.headers.get('x-content-type-options')==='nosniff','Missing media nosniff');
  const bytes=Buffer.from(await image.arrayBuffer());
  check(bytes.length>=20&&bytes.length<=2097152,'Invalid image size');
  check(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length,'Invalid WebP container');
  let offset=12,hasImage=false;
  while(offset+8<=bytes.length){
    const kind=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4);
    check(!['EXIF','XMP ','ICCP','ANIM','ANMF'].includes(kind),'Prohibited media metadata');
    if(['VP8 ','VP8L'].includes(kind))hasImage=true;
    offset+=8+length+(length%2);check(offset<=bytes.length,'Invalid WebP chunk');
  }
  check(offset===bytes.length&&hasImage,'Missing WebP image');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const mode=process.argv[2];
    await verifyPilot({mode,expected:mode==='active'?JSON.parse(process.env.R4_PILOT_EXPECTED_PUBLIC_JSON||'null'):undefined});
    console.log('ONE_PROPERTY_PILOT_'+mode.toUpperCase()+'=PASS');
  }catch{
    // Assertion diffs can contain the private expected object. Never emit them.
    console.error('ONE_PROPERTY_PILOT=FAIL; inspect privately; no response data logged');
    process.exitCode=1;
  }
}
