import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPilotConfiguration} from '../src/utils/publicListingPilotConfiguration.js';
const preview={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',country:'LK',category:'residential',title:'Example rental',location:'Sri Lanka',monthlyRent:1,currency:'LKR',images:[],privateAddress:'NEVER COPY'};
const photo={mediaId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',status:'ready',altText:'Example exterior',sourceUrl:'NEVER COPY'};
test('exports only the approved projected fields and one guarded photo URL',()=>{
  const data=buildPilotConfiguration(preview,[photo]);
  assert.deepEqual(Object.keys(data).sort(),['id','country','category','title','location','monthlyRent','currency','images'].sort());
  assert.deepEqual(data.images,[{url:'/api/public-listings/'+preview.id+'/media/'+photo.mediaId+'?country=LK',alt:'Example exterior'}]);
  assert.equal(JSON.stringify(data).includes('NEVER COPY'),false);
  assert.equal(buildPilotConfiguration({...preview,monthlyRent:null},[photo]).monthlyRent,null);
});
for(const [label,p,photos] of [
  ['ineligible or missing server preview',null,[photo]],
  ['wrong market',{...preview,country:'BN'},[photo]],
  ['wrong currency',{...preview,currency:'BND'},[photo]],
  ['invalid public ID',{...preview,id:'source-property'},[photo]],
  ['invalid rent',{...preview,monthlyRent:-1},[photo]],
  ['no photo',preview,[]],
  ['withheld photo',preview,[{...photo,status:'withheld'}]],
  ['withdrawn photo',preview,[{...photo,status:'withdrawn'}]],
  ['multiple approved photos',preview,[photo,{...photo,mediaId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}]],
  ['invalid media ID',preview,[{...photo,mediaId:'original-file'}]]
])test('suppresses export for '+label,()=>assert.equal(buildPilotConfiguration(p,photos),null));
test('unapproved photos cannot replace the approved copy',()=>{
  assert.deepEqual(buildPilotConfiguration(preview,[{...photo,status:'withheld'},photo]),buildPilotConfiguration(preview,[photo]));
});
