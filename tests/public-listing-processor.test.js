import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {resolveLocalStoragePath} from '../src/api/storage/index.js';
import {resolveRegisteredPhoto,sanitizePhotoAlt,trustedPhotoOrigins} from '../src/api/publicListings/sourceImages.js';
import {preparePropertyPhoto,imagePreparationEnabled,convertPropertyPhoto} from '../src/api/publicListings/processor.js';

const tenant='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const propertyId='33333333-3333-4333-8333-333333333333';
const publicId='44444444-4444-4444-8444-444444444444';
const filename='living-room-photo.webp';
const safeUrl='https://app.quixo.homes/storage/images/tenants/'+tenant+'/properties/'+filename;
const photo=fs.readFileSync('marketing/assets/hero-house.webp');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const input={tenantId:tenant,actorId:actor,propertyId,imageIndex:0,altText:'Modern living room'};
const env={PUBLIC_LISTING_IMAGE_PREPARE_ENABLED:'true'};
const sourceImages=JSON.stringify([{image_url:safeUrl,image_type:'interior'}]);

test('local public derivatives never map beneath express static public root',()=>{
  const stored=resolveLocalStoragePath('media','public-listings/'+publicId+'/'+actor+'.webp');
  assert.ok(stored.startsWith(path.resolve(process.cwd(),'.private')+path.sep));
  assert.equal(stored.startsWith(path.resolve(process.cwd(),'public')+path.sep),false);
  const original=resolveLocalStoragePath('images','tenants/'+tenant+'/properties/living-room-photo.webp');
  assert.ok(original.startsWith(path.resolve(process.cwd(),'public','storage','images')));
  for(const p of [
    'public-listings/'+publicId+'/../../secret.webp',
    'public-listings/'+publicId+'/unapproved.svg',
    'public-listings/arbitrary-image',
  ])assert.throws(()=>resolveLocalStoragePath('media',p));
});

test('only explicitly configured HTTPS app origins can supply registered photos',()=>{
  const configured=trustedPhotoOrigins({
    PUBLIC_LISTING_TRUSTED_IMAGE_ORIGINS:'https://khrental-app.example.azurecontainerapps.io,https://app.quixo.homes'
  });
  assert.deepEqual(configured,[
    'https://app.quixo.homes','https://khrental-app.example.azurecontainerapps.io'
  ]);
  const url='https://khrental-app.example.azurecontainerapps.io/storage/images/tenants/'+tenant+'/properties/'+filename;
  assert.deepEqual(resolveRegisteredPhoto(JSON.stringify([url]),0,tenant,{allowedOrigins:configured}),{
    bucket:'images',path:'tenants/'+tenant+'/properties/'+filename
  });
  assert.throws(()=>resolveRegisteredPhoto(JSON.stringify([url]),0,tenant));
  for(const raw of ['http://unsafe.example','https://any.example/private','https://user:pass@any.example'])
    assert.throws(()=>trustedPhotoOrigins({PUBLIC_LISTING_TRUSTED_IMAGE_ORIGINS:raw}));
  assert.throws(()=>trustedPhotoOrigins({
    PUBLIC_LISTING_TRUSTED_IMAGE_ORIGINS:'https://*.example.com'
  }));
});

test('photo source parser only accepts tenant-owned registered property images',()=>{
  assert.deepEqual(resolveRegisteredPhoto(sourceImages,0,tenant),{
    bucket:'images',path:'tenants/'+tenant+'/properties/'+filename
  });
  assert.deepEqual(resolveRegisteredPhoto(JSON.stringify([safeUrl]),0,tenant).bucket,'images');
  for(const bad of [
    safeUrl.replace(tenant,actor),safeUrl.replace('/storage/images/','/storage/documents/'),
    safeUrl.replace('app.quixo.homes','untrusted.example'),
    safeUrl+'?sig=secret',safeUrl+'#private',
    safeUrl.replace(filename,'script.svg'),
    safeUrl.replace(filename,'%2e%2e%2fsecret.webp'),
    safeUrl.replace(filename,'../../secret.webp'),
    '/storage/images/tenants/'+actor+'/properties/'+filename
  ])assert.throws(()=>resolveRegisteredPhoto(JSON.stringify([bad]),0,tenant),bad);
  assert.throws(()=>resolveRegisteredPhoto(sourceImages,1,tenant));
  assert.throws(()=>resolveRegisteredPhoto('{}',0,tenant));
  assert.throws(()=>resolveRegisteredPhoto('not json',0,tenant));
  assert.throws(()=>resolveRegisteredPhoto(sourceImages,0,actor));
});
test('photo description strips whitespace and rejects unsafe markup/control',()=>{
  assert.equal(sanitizePhotoAlt('  A bright living room  '),'A bright living room');
  for(const bad of ['','<img src=x>','X'.repeat(181),null,123,'bad\nalt'])
    assert.throws(()=>sanitizePhotoAlt(bad));
});
test('tenant ownership ignores GUID casing while private object reads preserve the exact registered key',async()=>{
  const upperTenant='ABCDEF12-ABCD-4ABC-8ABC-ABCDEF123456';
  const registered='tenants/'+upperTenant+'/properties/Exterior-Photo.webp';
  const images=JSON.stringify([{image_url:'https://app.quixo.homes/storage/images/'+registered}]);
  assert.equal(resolveRegisteredPhoto(images,0,upperTenant.toLowerCase()).path,registered);
  assert.throws(()=>resolveRegisteredPhoto(images,0,actor));
  const result=await preparePropertyPhoto({...input,tenantId:upperTenant.toLowerCase()},{
    env,readSnapshot:async()=>({sourceImages:images,publicId}),convert:async()=>photo,
    storage:{
      getObject:async(bucket,key)=>{
        assert.equal(bucket,'images');assert.equal(key,registered,'R2 lookup must not lowercase the tenant folder or filename');
        return {body:photo};
      },
      upload:async()=>{},deleteObjects:async()=>{}
    },
    writeManifest:async receipt=>({mediaId:receipt.mediaId,status:'withheld'})
  });
  assert.equal(result.status,'withheld');
});
test('processing gate is off unless explicitly enabled',async()=>{
  assert.equal(imagePreparationEnabled({}),false);
  assert.equal(imagePreparationEnabled({PUBLIC_LISTING_IMAGE_PREPARE_ENABLED:'true'}),true);
  await assert.rejects(
    preparePropertyPhoto(input,{env:{},storage:{}}),
    {code:'IMAGE_PREPARATION_DISABLED'}
  );
});
test('registered photo is reencoded then staged withheld, without disclosing source path',async()=>{
  const events=[];
  const storage={
    getObject:async(bucket,path)=>{events.push(['read',bucket,path]);return {body:photo};},
    upload:async(bucket,path,bytes,mime)=>{
      events.push(['upload',bucket,path,mime]);
      assert.equal(mime,'image/webp');
      assert.ok(bytes.equals(photo));
    },
    deleteObjects:async()=>{throw Error('No cleanup expected');}
  };
  const result=await preparePropertyPhoto(input,{
    env,storage,convert:async bytes=>{assert.ok(bytes.equals(photo));return photo;},
    readSnapshot:async args=>{
      assert.deepEqual(args,{tenantId:tenant,actorId:actor,propertyId});
      return {sourceImages,publicId};
    },
    writeManifest:async receipt=>{
      events.push(['manifest',receipt]);
      assert.equal(receipt.sourceImages,sourceImages);
      assert.equal(receipt.sourceSha,sha(photo));
      assert.equal(receipt.derivativeSha,sha(photo));
      assert.equal(receipt.imageBytes,photo.length);
      assert.equal(receipt.imageIndex,0);
      assert.equal(receipt.altText,input.altText);
      assert.equal(receipt.actorId,actor);
      return {mediaId:receipt.mediaId,status:'withheld'};
    }
  });
  assert.equal(result.status,'withheld');
  assert.equal(result.requiresRightsAndPrivacyApproval,true);
  assert.ok(!JSON.stringify(result).includes('storage/images'));
  assert.ok(!JSON.stringify(result).includes(tenant));
  assert.deepEqual(events.map(e=>e[0]),['read','upload','manifest']);
  assert.equal(events[0][1],'images');
  assert.equal(events[2][1].mediaId,result.mediaId);
  assert.equal(events[1][1],'media');
  assert.match(events[1][2],/^public-listings\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);
});
test('source changes after conversion reject SQL commit and delete unpublished derivative',async()=>{
  const events=[];
  const storage={
    getObject:async()=>({body:photo}),
    upload:async(bucket,path)=>{events.push(['upload',bucket,path]);},
    deleteObjects:async(bucket,paths)=>{events.push(['remove',bucket,paths]);}
  };
  await assert.rejects(
    preparePropertyPhoto(input,{
      env,storage,convert:async()=>photo,
      readSnapshot:async()=>({sourceImages,publicId}),
      writeManifest:async()=>{throw Object.assign(new Error('stale'),{code:'IMAGE_SOURCE_CHANGED'});}
    }),{code:'IMAGE_SOURCE_CHANGED'}
  );
  assert.deepEqual(events.map(e=>e[0]),['upload','remove']);
  assert.deepEqual(events[1][2],[events[0][2]]);
});
test('unregistered source, missing property and unsupported conversion fail before upload',async()=>{
  let uploads=0;
  const storage={
    getObject:async()=>({body:photo}),
    upload:async()=>{uploads++;}
  };
  await assert.rejects(preparePropertyPhoto(input,{env,storage,
    readSnapshot:async()=>null}),{code:'IMAGE_PROPERTY_UNAVAILABLE'});
  await assert.rejects(preparePropertyPhoto(input,{env,storage,
    readSnapshot:async()=>({publicId,sourceImages:JSON.stringify([{image_url:'https://evil.invalid/upload.jpg'}])})}));
  await assert.rejects(preparePropertyPhoto(input,{env,storage,
    readSnapshot:async()=>({publicId,sourceImages}),
    convert:async()=>Buffer.from('not-image')}),/WebP|safe size/);
  assert.equal(uploads,0);
});
test('processor must reject fake source bytes without requiring Sharp to load',async()=>{
  await assert.rejects(convertPropertyPhoto(Buffer.alloc(40)),{code:'IMAGE_SOURCE_TYPE'});
  await assert.rejects(convertPropertyPhoto(Buffer.alloc(10)),{code:'IMAGE_SOURCE_SIZE'});
  await assert.rejects(convertPropertyPhoto(Buffer.alloc(10*1024*1024+1)),{code:'IMAGE_SOURCE_SIZE'});
});
