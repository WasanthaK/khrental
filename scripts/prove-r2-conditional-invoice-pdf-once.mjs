// One-time, owner-approved I02 production R2 conditional-write probe.
// Uses exactly one synthetic PDF in a disposable healthcheck namespace.
// Never touches SQL, customer identifiers, a canonical issued-invoice path,
// SendGrid, feature flags, or any existing object.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { R2StorageDriver } from '../src/api/storage/index.js';

if (process.env.I02_SYNTHETIC_R2_APPROVAL !== 'APPROVED-ONE-TIME-2026-10-22') {
  throw new Error('Explicit one-time I02 synthetic R2 approval marker required.');
}
if (process.env.STORAGE_DRIVER !== 'r2') {
  throw new Error('Durable R2 storage driver is required.');
}
const driver = new R2StorageDriver();
const uuid = crypto.randomUUID();
const path = '_healthchecks/i02-conditional-invoice-pdf/' + uuid + '.pdf';
const bucket = 'invoices';
if (!/^_healthchecks\/i02-conditional-invoice-pdf\/[0-9a-f-]{36}\.pdf$/.test(path)) {
  throw new Error('Refusing an unexpected probe path.');
}
const key = driver.objectKey(bucket, path);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const source = await PDFDocument.create();
const font = await source.embedFont(StandardFonts.Helvetica);
const page = source.addPage([420, 300]);
page.drawText('SYNTHETIC I02 R2 CONDITIONAL WRITE PROBE', {x:32,y:240,size:13,font});
page.drawText('Not a customer invoice or issued archive', {x:32,y:208,size:10,font});
page.drawText('Probe: ' + uuid, {x:32,y:185,size:9,font});
const pdf = Buffer.from(await source.save({useObjectStreams:false}));
const modified = Buffer.from(pdf);
modified[modified.length - 10] ^= 1;
const expectedSha = hash(pdf);
let putAttempted = false;
let failure = null;
let proofComplete = false;
const put = body => driver.request('PUT', key, {
  headers: {'if-none-match':'*','content-type':'application/pdf'},
  body
});
try {
  await assert.rejects(
    driver.request('HEAD',key),
    error => error?.status === 404,
    'Refuse to operate on a previously existing R2 object.'
  );
  putAttempted = true;
  await put(pdf);
  console.log('PASS: one synthetic PDF created with If-None-Match: *.');
  const first = await driver.getObject(bucket,path);
  assert.equal(first.contentType.split(';')[0].trim().toLowerCase(),'application/pdf');
  assert.deepEqual(first.body,pdf);
  assert.equal(hash(first.body),expectedSha);
  console.log('PASS: exact PDF byte length, SHA-256 and content type match.');
  await assert.rejects(put(pdf), error=>error?.status===412,
    'Duplicate conditional create must return HTTP 412.');
  await assert.rejects(put(modified), error=>error?.status===412,
    'Different bytes cannot replace the existing object.');
  const final = await driver.getObject(bucket,path);
  assert.deepEqual(final.body,pdf,'Duplicate attempts must not change stored bytes.');
  assert.equal(hash(final.body),expectedSha);
  console.log('PASS: duplicate and altered writes refused (HTTP 412); original bytes unchanged.');
  proofComplete = true;
} catch (error) {
  failure = error;
} finally {
  if (putAttempted) {
    try {
      // Cleanup is restricted to this generated object and only if its bytes
      // match data generated during this probe. Unknown objects are NEVER deleted.
      const present = await driver.getObject(bucket,path).catch(error=>{
        if (error?.status === 404) return null;
        throw error;
      });
      if (present) {
        if (!present.body.equals(pdf) && !present.body.equals(modified)) {
          throw new Error('Probe object contains unknown bytes; refusing to delete it.');
        }
        await driver.deleteObjects(bucket,[path]);
        await assert.rejects(driver.getObject(bucket,path), error=>error?.status===404);
        console.log('PASS: only the disposable synthetic PDF was deleted; R2 now returns 404.');
      }
    } catch (error) {
      console.error('Probe cleanup could not be verified for its generated _healthchecks object.');
      failure ||= error;
    }
  }
}
if (failure) throw failure;
if (!proofComplete) throw new Error('Conditional R2 proof is incomplete.');
console.log('I02 SYNTHETIC R2 CONDITIONAL PDF PROBE PASSED; zero customer, SQL, mail or archive writes.');
