import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import * as storage from '../src/api/storage/index.js';
import { createAuthenticatedTenantStorageRouter } from '../src/api/storage/authenticatedTenantRoute.js';
import { createPlatformRouter } from '../src/api/platform/router.js';

const tenant = '11111111-1111-4111-8111-111111111111';
const resource = '22222222-2222-4222-8222-222222222222';
const root = `tenants/${tenant}`;
const signed = `${root}/agreements/${resource}/signed/Signed.pdf`;
const issued = `${root}/invoices/${resource}/issued/document.pdf`;
const proof = `${root}/payment_proofs/${resource}/${resource}.pdf`;
// Express recognizes error middleware by its four-argument arity.
// eslint-disable-next-line no-unused-vars
const errors = (error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code });
const serve = async (app, work) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
};
const context = role => ({ tenantId: tenant, user: { id: resource, role },
  membership: { tenant_id: tenant, role, status: 'active' }, memberships: [] });

test('HTTP delivery rejects aliased protected identities before any bytes', async () => {
  let deliveries = 0;
  const app = express();
  app.use('/storage', createAuthenticatedTenantStorageRouter({
    sessionMiddleware: (req, _res, next) => { req.authSession = {}; next(); },
    tenantMiddleware: (req, _res, next) => { Object.assign(req, context('rentee')); next(); },
    loadPublishedArchive: async () => null, loadSignedAgreement: async () => null,
    loadHistoricAgreement: async () => null,
    deliveryHandler: (_req, res) => { deliveries++; res.send('protected fixture'); }
  }));
  app.use(errors);
  await serve(app, async origin => {
    for (const [bucket, object] of [['documents', signed], ['invoices', issued], ['invoices', proof]]) {
      for (const url of [
        `/storage/${bucket}%20/${object}`,
        `/storage/${bucket}/${object.replace('/'+resource+'/', '//'+resource+'/')}`,
        `/storage/${bucket}/${object.replace('/'+resource+'/', '/%2f'+resource+'/')}`
      ]) {
        const response = await fetch(origin + url);
        assert.equal(response.status, 400, url);
      }
    }
    assert.equal(deliveries, 0);
    assert.equal((await fetch(origin + `/storage/documents/${signed}`)).status, 403);
    assert.equal((await fetch(origin + `/storage/images/${root}/photo.jpg`)).status, 200);
    assert.equal(deliveries, 1);
  });
});

test('generic HTTP storage validates bucket and path before policies and driver calls', async () => {
  const calls = [];
  const driver = Object.fromEntries(['list', 'upload', 'deleteObjects', 'createBucket', 'deleteBucket'].map(name =>
    [name, async (...args) => { calls.push([name, ...args]); return []; }]));
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.tenantContext = context(req.get('test-role') || 'admin'); next(); });
  app.use(createPlatformRouter({ getStorageDriver: () => driver, checkPlatformAdmin: async () => true }));
  app.use(errors);
  await serve(app, async origin => {
    const requests = [
      ['/storage/list?bucket=documents%20&path='+signed, {}],
      ['/storage/upload?bucket=documents%20&path='+signed, { method: 'POST', body: '%PDF-fixture', headers: {'content-type':'application/pdf'} }],
      ['/storage/objects', { method: 'DELETE', body: JSON.stringify({bucket:'documents ', paths:[signed]}), headers:{'content-type':'application/json'} }],
      ['/storage/buckets/documents%20', {method:'DELETE'}],
      ['/storage/buckets', {method:'POST',body:JSON.stringify({name:'documents '}),headers:{'content-type':'application/json'}}],
      ['/storage/list?bucket=images&path='+root+'//photo.jpg', {}]
    ];
    for (const role of ['admin', 'staff', 'rentee']) {
      for (const [url, options] of requests) {
        const response = await fetch(origin+url, {...options, headers:{...options.headers, 'test-role':role}});
        const expected = url === '/storage/objects' && role !== 'admin' ? 403 : 400;
        assert.equal(response.status, expected, role+' '+url);
      }
    }
    for (const [bucket, object] of [['documents',signed],['invoices',issued],['invoices',proof],['images',root]]) {
      const response = await fetch(origin+'/storage/objects', {method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({bucket,paths:[object]})});
      assert.equal(response.status,403);
    }
    assert.equal(calls.length, 0);
    assert.equal((await fetch(origin+'/storage/list?bucket=images&path='+root)).status, 200);
    assert.equal(calls.length, 1);
  });
});

test('R2 driver rejects aliases and protected recursive deletions without network calls', async () => {
  const driver = Object.create(storage.R2StorageDriver.prototype);
  driver.logicalBuckets = ['documents','invoices','images'];
  let requests = 0;
  driver.request = async () => { requests++; return {text: async () => '<ListBucketResult/>', arrayBuffer: async () => new ArrayBuffer(0), headers:new Headers()}; };
  for (const bucket of ['documents ', ' invoices']) {
    for (const operation of [() => driver.deleteBucket(bucket), () => driver.deleteObjects(bucket,[signed]),
      () => driver.upload(bucket,signed,Buffer.from('x')), () => driver.getObject(bucket,signed), () => driver.list(bucket,root)]) {
      await assert.rejects(operation, {status:400});
    }
  }
  for (const object of [signed.replace('/signed/','//signed/'), '/'+signed, signed+'/']) {
    await assert.rejects(driver.deleteObjects('documents',[object]), {status:400});
  }
  for (const bucket of ['documents','invoices','images']) {
    for (const parent of ['', 'tenants', root]) {
      await assert.rejects(driver.deleteObjects(bucket,[parent]), {status:403});
    }
  }
  await assert.rejects(driver.deleteBucket('images'), {status:403});
  assert.equal(requests,0);
});

test('static fallback never serves storage through alternate prefixes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'kh-static-'));
  await mkdir(path.join(dir,'storage','documents'), {recursive:true});
  await writeFile(path.join(dir,'storage','documents','secret.pdf'), '%PDF-private');
  await writeFile(path.join(dir,'favicon.txt'),'public');
  const app = express();
  app.use('/storage', (_req,res) => res.sendStatus(401));
  app.use(storage.blockStorageStaticFallback);
  app.use(express.static(dir)); app.use(errors);
  try { await serve(app,async origin => {
    for (const url of ['//storage/documents/secret.pdf','/%73torage/documents/secret.pdf','/storage%2fdocuments/secret.pdf']) {
      const response = await fetch(origin+url);
      assert.equal(response.status,404,url);
      assert.doesNotMatch(await response.text(), /PDF-private/);
    }
    assert.equal((await fetch(origin+'/storage/documents/secret.pdf')).status,401);
    assert.equal(await (await fetch(origin+'/favicon.txt')).text(),'public');
  }); } finally { await rm(dir,{recursive:true,force:true}); }
});

// A fresh process fixes the actual local driver's storage root to this private
// temporary directory before import. No repository or production objects exist.
test('real local driver retains protected bytes across alias, ancestor and mixed-batch deletion attempts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'kh-local-storage-'));
  const moduleUrl = new URL('../src/api/storage/index.js', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { mkdir, writeFile, readFile } from 'node:fs/promises';
    import path from 'node:path';
    const { getStorageDriver } = await import(${JSON.stringify(moduleUrl)});
    const driver = getStorageDriver();
    const root = ${JSON.stringify(root)};
    const signed = ${JSON.stringify(signed)};
    const issued = ${JSON.stringify(issued)};
    const proof = ${JSON.stringify(proof)};
    for (const [bucket, object] of [['documents', signed], ['invoices', issued], ['invoices', proof]]) {
      const file = path.join('public/storage', bucket, object);
      await mkdir(path.dirname(file), {recursive:true});
      await writeFile(file, '%PDF-retained');
      for (const alias of [bucket+' ', ' '+bucket]) {
        await assert.rejects(driver.getObject(alias,object), {status:400});
        await assert.rejects(driver.list(alias,root), {status:400});
        await assert.rejects(driver.upload(alias,object,Buffer.from('changed')), {status:400});
        await assert.rejects(driver.deleteObjects(alias,[object]), {status:400});
        await assert.rejects(driver.deleteBucket(alias), {status:400});
      }
      for (const target of ['', 'tenants', root, object]) {
        await assert.rejects(driver.deleteObjects(bucket,[target]), {status:403});
      }
      await assert.rejects(driver.deleteObjects(bucket,[object.replace('/'+${JSON.stringify(resource)}+'/', '//'+${JSON.stringify(resource)}+'/')]),{status:400});
      assert.equal((await driver.getObject(bucket,object)).body.toString(),'%PDF-retained');
    }
    const ordinary = root+'/draft.pdf';
    await driver.upload('documents',ordinary,Buffer.from('draft'));
    await assert.rejects(driver.deleteObjects('documents',[ordinary,signed]),{status:403});
    assert.equal((await driver.getObject('documents',ordinary)).body.toString(),'draft');
    await driver.deleteObjects('documents',[ordinary]);
    await assert.rejects(driver.getObject('documents',ordinary),{code:'ENOENT'});
  `;
  try { await promisify(execFile)(process.execPath, ['--input-type=module','-e',script], {cwd:dir,env:{...process.env,STORAGE_DRIVER:'local'}}); }
  finally { await rm(dir,{recursive:true,force:true}); }
});
