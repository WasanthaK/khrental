import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInvoiceDocumentPdfCandidate } from '../src/api/platform/invoicePdfCandidate.js';
import { prepareInvoiceArchiveCandidate } from '../src/api/platform/issuedInvoiceArchiveCandidate.js';
import { loadVerifiedIssuedInvoiceDocument } from '../src/api/platform/issuedInvoiceDocumentRead.js';

const t='11111111-1111-4111-8111-111111111111';
const id='22222222-2222-4222-8222-222222222222';
const sample=()=>({
  version:1,kind:'invoice_issued',tenantId:t,invoiceId:id,
  paymentReference:'26102101',billingPeriod:'2026-10',
  issuedAt:'2026-10-21',dueAt:'2026-11-21',
  issuer:{role:'organization',legalName:'Sample Issuer',postalAddress:'1 Test Road'},
  renter:{name:'Sample Renter'},property:{name:'Sample Apartment'},
  lines:[{description:'Rent',amountCents:125000}],totalCents:125000,payment:null
});
const setup=async()=>{
  const snapshot=sample();
  const candidate=await createInvoiceDocumentPdfCandidate(snapshot);
  const bytes=Buffer.from(candidate.content,'base64');
  const manifest={...prepareInvoiceArchiveCandidate({snapshot,pdfBytes:bytes}),state:'committed'};
  let read=0;
  const archiveLedger={loadCommitted:async()=>manifest};
  const objectStorage={getObject:async(bucket,path)=>{
    read++;
    assert.equal(bucket,'invoices');
    assert.equal(path,manifest.path);
    return {body:bytes};
  }};
  return {snapshot,bytes,manifest,archiveLedger,objectStorage,reads:()=>read};
};
test('committed issued bytes are returned unchanged, not re-rendered',async()=>{
  const f=await setup();
  const doc=await loadVerifiedIssuedInvoiceDocument({
    tenantId:t,invoiceId:id,archiveLedger:f.archiveLedger,objectStorage:f.objectStorage
  });
  assert.equal(doc.type,'application/pdf');
  assert.equal(doc.immutable,true);
  assert.equal(doc.sha256,f.manifest.pdfSha256);
  assert.deepEqual(Buffer.from(doc.content,'base64'),f.bytes);
  assert.equal(f.reads(),1);
});
test('missing committed manifest fails closed, never regenerates from live data',async()=>{
  const f=await setup();
  await assert.rejects(loadVerifiedIssuedInvoiceDocument({
    tenantId:t,invoiceId:id,archiveLedger:{loadCommitted:async()=>null},
    objectStorage:f.objectStorage
  }), e=>e.status===404 && e.code==='ISSUED_INVOICE_PDF_NOT_ARCHIVED');
  assert.equal(f.reads(),0);
});
test('wrong tenant and another invoice can never retrieve bytes',async()=>{
  const f=await setup();
  for (const scope of [{tenantId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',invoiceId:id},
    {tenantId:t,invoiceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}]) {
    await assert.rejects(loadVerifiedIssuedInvoiceDocument({
      ...scope,archiveLedger:f.archiveLedger,objectStorage:f.objectStorage
    }), e=>e.code==='INVOICE_ARCHIVE_SCOPE_DENIED');
  }
  assert.equal(f.reads(),0);
});
test('corrupted PDF bytes and inconsistent SQL hash cannot escape',async()=>{
  const f=await setup();
  const changed=Buffer.from(f.bytes);changed[changed.length-30]^=1;
  await assert.rejects(loadVerifiedIssuedInvoiceDocument({
    tenantId:t,invoiceId:id,archiveLedger:f.archiveLedger,
    objectStorage:{getObject:async()=>({body:changed})}
  }),e=>e.code==='INVOICE_ARCHIVE_INTEGRITY_FAILED');
  await assert.rejects(loadVerifiedIssuedInvoiceDocument({
    tenantId:t,invoiceId:id,
    archiveLedger:{loadCommitted:async()=>({...f.manifest,pdfSha256:'a'.repeat(64)})},
    objectStorage:f.objectStorage
  }),/canonical/);
});
test('HTTP billing route requires invoice access and feature-gated signed archive',()=>{
  const api=readFileSync(new URL('../src/api/platform/billingRouter.js',import.meta.url),'utf8');
  const route=api.match(/router\.get\('\/invoices\/:invoiceId\/issued-document',[\s\S]*?(?=router\.patch\('\/invoices\/:invoiceId\/draft')/);
  assert.ok(route);
  assert.match(route[0],/INVOICE_IMMUTABLE_ARCHIVE_ENABLED/);
  assert.match(route[0],/assertInvoiceAccess\(req, invoice, false\)/);
  assert.match(route[0],/assertInvoiceIssued\(invoice\)/);
  assert.match(route[0],/loadVerifiedIssuedInvoiceDocument/);
  assert.doesNotMatch(route[0],/createIssuedInvoicePdfAttachment|createInvoiceDocumentPdfCandidate|sendInvoiceEmail/);
  assert.match(api,/issuedDocument = \{ available: false \}/);
});
