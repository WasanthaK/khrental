import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { R2StorageDriver } from '../src/api/storage/index.js';
import {
  isIssuedInvoiceArchivePath, assertGenericInvoiceArchiveMutationAllowed,
  assertGenericInvoiceArchiveBucketDeleteAllowed
} from '../src/api/storage/invoiceArchiveStoragePolicy.js';
import { createIssuedInvoiceR2ArchiveStore } from '../src/api/platform/issuedInvoiceR2ArchiveStore.js';

const tenant='11111111-1111-4111-8111-111111111111';
const invoice='22222222-2222-4222-8222-222222222222';
const pdf=Buffer.concat([Buffer.from('%PDF-1.7\n'),Buffer.alloc(160,65)]);
const digest=crypto.createHash('sha256').update(pdf).digest('hex');
const path='tenants/'+tenant+'/invoices/'+invoice+'/issued/sha256-'+digest+'.pdf';

test('generic authenticated storage path refuses issued PDFs without invoice authorization', () => {
  assert.equal(isIssuedInvoiceArchivePath('invoices',path),true);
  assert.equal(isIssuedInvoiceArchivePath('invoices','tenants/'+tenant+'/invoices/'+invoice+'/issued'),true);
  assert.equal(isIssuedInvoiceArchivePath('images',path),false);
  assert.equal(isIssuedInvoiceArchivePath('invoices','tenants/'+tenant+'/payment-proofs/example.jpg'),false);
  const router=readFileSync(new URL('../src/api/storage/authenticatedTenantRoute.js',import.meta.url),'utf8');
  assert.match(router,/isIssuedInvoiceArchivePath\(req\.params\.bucket, objectPath\)/);
  assert.match(router,/INVOICE_ARCHIVE_DEDICATED_API_REQUIRED/);
});
test('generic writes and deletes can never overwrite or remove issued PDFs', () => {
  assert.throws(()=>assertGenericInvoiceArchiveMutationAllowed('invoices',path),
    e=>e.code==='INVOICE_ARCHIVE_DEDICATED_API_REQUIRED');
  assert.throws(()=>assertGenericInvoiceArchiveBucketDeleteAllowed('invoices'),
    e=>e.code==='INVOICE_ARCHIVE_DEDICATED_API_REQUIRED');
  assert.doesNotThrow(()=>assertGenericInvoiceArchiveMutationAllowed('invoices',
    'tenants/'+tenant+'/payment-proofs/valid.jpg'));
  const source=readFileSync(new URL('../src/api/storage/index.js',import.meta.url),'utf8');
  assert.equal(source.split('assertGenericInvoiceArchiveBucketDeleteAllowed(bucket)').length-1,2);
  assert.match(source,/assertGenericInvoiceArchiveMutationAllowed\(safeBucket, safePath\)/);
  assert.match(source,/assertGenericInvoiceArchiveMutationAllowed\(bucket, safePath\)/);
  assert.equal(source.split('safePaths.forEach(item => assertGenericInvoiceArchiveMutationAllowed').length-1,2);
});
test('R2 archive creates only canonical content-addressed PDFs with atomic precondition', async () => {
  const cfg={R2_ACCOUNT_ID:'test-id',R2_BUCKET:'private-bucket',
    R2_ACCESS_KEY_ID:'test-key',R2_SECRET_ACCESS_KEY:'test-secret'};
  const previous=Object.fromEntries(Object.keys(cfg).map(k=>[k,process.env[k]]));
  let driver;
  try {
    Object.assign(process.env,cfg);
    driver=new R2StorageDriver();
  } finally {
    for(const [k,v] of Object.entries(previous)){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  }
  const calls=[];
  driver.request=async(method,key,opts)=>{calls.push({method,key,opts});return {ok:true};};
  const store=createIssuedInvoiceR2ArchiveStore({driver});
  assert.equal(await store.createIfAbsent('invoices',path,pdf),'created');
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'PUT');
  assert.equal(calls[0].opts.headers['if-none-match'],'*');
  assert.equal(calls[0].opts.headers['content-type'],'application/pdf');
  assert.deepEqual(calls[0].opts.body,pdf);
  driver.request=async()=>{throw Object.assign(new Error('PreconditionFailed'),{status:412});};
  assert.equal(await store.createIfAbsent('invoices',path,pdf),'exists');
  driver.request=async()=>{throw Object.assign(new Error('ServiceUnavailable'),{status:503});};
  await assert.rejects(store.createIfAbsent('invoices',path,pdf),/ServiceUnavailable/);
  assert.equal(calls.length,1,'never retries as an unconditional object overwrite');
  await assert.rejects(store.createIfAbsent('invoices',path,Buffer.from('%PDF-not-matching')),
    e=>e.code==='INVALID_INVOICE_ARCHIVE_WRITE');
});
test('no local or generic object storage adapter can publish an issued PDF',()=>{
  assert.throws(()=>createIssuedInvoiceR2ArchiveStore({
    driver:{name:'local',upload:async()=>{},getObject:async()=>{}}
  }),e=>e.code==='INVOICE_ARCHIVE_R2_REQUIRED');
});
