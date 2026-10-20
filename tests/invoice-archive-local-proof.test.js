import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createInvoiceArchiveLocalProofStore} from '../src/api/platform/invoiceArchiveLocalProofStore.js';

const objectPath='tenants/11111111-1111-4111-8111-111111111111/invoices/22222222-2222-4222-8222-222222222222/issued/sha256-'+('a'.repeat(64))+'.pdf';
const setup=async fn=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'khrental-local-archive-'));
  try {await fn(createInvoiceArchiveLocalProofStore({rootDirectory:dir}));}
  finally {await fs.rm(dir,{recursive:true,force:true});}
};
test('first object is created atomically; second write cannot replace original',async()=>setup(async store=>{
  const original=Buffer.from('%PDF-1.4 original issued record');
  const different=Buffer.from('%PDF-1.4 malicious replacement');
  assert.equal(await store.createIfAbsent('invoices',objectPath,original),'created');
  assert.equal(await store.createIfAbsent('invoices',objectPath,different),'exists');
  assert.deepEqual((await store.getObject('invoices',objectPath)).body,original);
}));
test('parallel competing writers preserve exactly one complete value',async()=>setup(async store=>{
  const a=Buffer.alloc(200000,65),b=Buffer.alloc(200000,66);
  const outcomes=await Promise.all([
    store.createIfAbsent('invoices',objectPath,a),
    store.createIfAbsent('invoices',objectPath,b)
  ]);
  assert.deepEqual([...outcomes].sort(),['created','exists']);
  const saved=(await store.getObject('invoices',objectPath)).body;
  assert.ok(saved.equals(a)||saved.equals(b));
}));
test('foreign bucket and path traversal fail closed',async()=>setup(async store=>{
  await assert.rejects(store.createIfAbsent('documents',objectPath,Buffer.from('a')),/Invalid/);
  await assert.rejects(store.createIfAbsent('invoices','../foreign',Buffer.from('a')),/Invalid/);
}));
test('proof storage refuses application production folders',()=>{
  assert.throws(()=>createInvoiceArchiveLocalProofStore({rootDirectory:'/var/www/public/storage'}),/temporary/);
});
