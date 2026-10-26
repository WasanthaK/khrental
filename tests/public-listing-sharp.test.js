import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {convertPropertyPhoto} from '../src/api/publicListings/processor.js';
import {verifySafeWebp} from '../src/api/publicListings/media.js';

test('trusted Sharp processor strips orientation and private metadata from a genuine JPEG',async()=>{
  const fixture=await sharp({
    create:{width:880,height:620,channels:3,background:{r:40,g:95,b:180}}
  }).jpeg({quality:86}).withMetadata({
    exif:{IFD0:{Copyright:'PRIVATE SAMPLE COPYRIGHT',ImageDescription:'PRIVATE IMAGE TEXT'}}
  }).toBuffer();
  const fixtureMetadata=await sharp(fixture).metadata();
  assert.ok(fixtureMetadata.exif,'JPEG fixture must contain EXIF to prove stripping');
  const result=await convertPropertyPhoto(fixture);
  const parsed=verifySafeWebp(result);
  assert.equal(parsed.contentType,'image/webp');
  assert.ok(result.length<=2097152);
  const output=await sharp(result).metadata();
  assert.equal(output.format,'webp');
  assert.equal(output.exif,undefined);
  assert.equal(output.xmp,undefined);
  assert.equal(output.icc,undefined);
  assert.equal(output.width,880);
  assert.equal(output.height,620);
  assert.equal(result.includes(Buffer.from('PRIVATE SAMPLE COPYRIGHT')),false);
});

test('processor refuses oversized or unsafe image dimensions',async()=>{
  const source=await sharp({
    create:{width:2200,height:1200,channels:3,background:'#5397a1'}
  }).png().toBuffer();
  const converted=await convertPropertyPhoto(source);
  const meta=await sharp(converted).metadata();
  assert.ok(meta.width<=1600&&meta.height<=1200);
  assert.ok(meta.width*meta.height<18_000_000);
  verifySafeWebp(converted);
});
