import test from 'node:test';
import assert from 'node:assert/strict';
import {propertyImageDisplayUrl} from '../src/utils/propertyDetailFields.js';
const tenant='22222222-2222-4222-8222-222222222222';
const imagePath='/storage/images/tenants/'+tenant+'/properties/1790000000000_demo.jpg';
const oldOrigin='https://khrental-app.proudpebble-f58b5187.southeastasia.azurecontainerapps.io';
const options={tenantId:tenant,appOrigin:'https://app.quixo.homes'};

test('old Azure photo URL renders at current protected storage route without changing stored reference',()=>{
  const source={image_url:oldOrigin+imagePath,image_type:'exterior',order:0};
  const original=JSON.stringify(source);
  assert.equal(propertyImageDisplayUrl(source.image_url,options),imagePath);
  assert.equal(JSON.stringify(source),original);
  assert.equal(propertyImageDisplayUrl('https://app.quixo.homes'+imagePath,options),imagePath);
  assert.equal(propertyImageDisplayUrl(imagePath,options),imagePath);
});

test('rebasing never grants another tenant or private bucket a property photo path',()=>{
  for(const source of [oldOrigin+imagePath.replace(tenant,'11111111-1111-4111-8111-111111111111'),
    oldOrigin+imagePath.replace('/images/','/documents/'),
    oldOrigin+imagePath.replace('/properties/','/id-copies/'),
    oldOrigin+imagePath+'?token=private',oldOrigin+imagePath+'#private',
    oldOrigin+imagePath.replace('/properties/','/properties/../properties/'),
    oldOrigin+imagePath.replace('/properties/','/properties/%2e%2e/properties/'),
    oldOrigin+imagePath.replace('.jpg','%2fsecret.jpg'),
    oldOrigin.replace('https://','https://name:secret@')+imagePath]){
    assert.equal(propertyImageDisplayUrl(source,options),'',source);
  }
  assert.equal(propertyImageDisplayUrl(oldOrigin+imagePath,{appOrigin:options.appOrigin}),'');
});

test('unrelated image providers and unsaved local previews are never rebased or sent app credentials',()=>{
  for(const source of ['https://other.example'+imagePath,
    'https://app.quixo.homes.evil.example'+imagePath,
    'blob:https://app.quixo.homes/preview-123','data:image/png;base64,AA==']){
    assert.equal(propertyImageDisplayUrl(source,options),source);
  }
  assert.equal(propertyImageDisplayUrl(null,options),'');
});
