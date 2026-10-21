import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createInvoiceDocumentPdfCandidate } from '../src/api/platform/invoicePdfCandidate.js';
import {
  issuedInvoiceArchivePath, prepareInvoiceArchiveCandidate,
  readRetainedInvoiceArchiveCandidate
} from '../src/api/platform/issuedInvoiceArchiveCandidate.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const invoiceId = '22222222-2222-4222-8222-222222222222';
const otherTenant = '33333333-3333-4333-8333-333333333333';
const issued = () => ({
  version:1,kind:'invoice_issued',tenantId,invoiceId,
  paymentReference:'26102001',billingPeriod:'2026-10',
  issuedAt:'2026-10-20',dueAt:'2026-11-05',
  issuer:{role:'organization',legalName:'Synthetic Real Estate Company',
    postalAddress:'No. 1 Example Street'},
  renter:{name:'Example Renter'},property:{name:'Example Property'},
  lines:[{description:'Rent',amountCents:1500000}],
  totalCents:1500000,
  payment:{source:'property',beneficiaryName:'Synthetic Real Estate Company',
    bankName:'Example Bank',branch:'Main',accountNumber:'TEST1234'}
});
const fixture = async () => {
  const snapshot=issued();
  const generated=await createInvoiceDocumentPdfCandidate(snapshot);
  const bytes=Buffer.from(generated.content,'base64');
  const prepared=prepareInvoiceArchiveCandidate({snapshot,pdfBytes:bytes});
  const archive={...prepared,state:'committed'};
  return {snapshot,generated,bytes,archive};
};
const load = (archive, body, options={}) => {
  let calls=0;
  return {
    read: () => readRetainedInvoiceArchiveCandidate({
      archive,tenantId:options.tenantId||tenantId,invoiceId:options.invoiceId||invoiceId,
      getObject:async (bucket,path) => {
        calls++;
        assert.equal(bucket,'invoices');
        assert.equal(path,archive.path);
        return {body};
      }
    }),
    calls:()=>calls
  };
};

test('content addressed archive path is tenant/invoice scoped and deterministic',async()=>{
  const {archive,generated,bytes}=await fixture();
  assert.match(archive.path,/^tenants\/11111111-1111-4111-8111-111111111111\/invoices\/22222222-2222-4222-8222-222222222222\/issued\/sha256-[0-9a-f]{64}\.pdf$/);
  assert.equal(archive.pdfSha256,generated.sha256);
  assert.equal(archive.snapshotSha256,generated.snapshotSha256);
  assert.equal(archive.byteLength,bytes.length);
  assert.equal(issuedInvoiceArchivePath(archive),archive.path);
});
test('exact originally rendered bytes can be read for resend without regeneration',async()=>{
  const {bytes,archive}=await fixture();
  const saved=await load(archive,bytes).read();
  assert.deepEqual(saved,bytes);
  assert.equal((await PDFDocument.load(saved)).getPageCount(),1);
});
test('tenant mismatch fails before touching storage',async()=>{
  const {archive,bytes}=await fixture();
  const x=load(archive,bytes,{tenantId:otherTenant});
  await assert.rejects(x.read(),e=>e.code==='INVOICE_ARCHIVE_SCOPE_DENIED');
  assert.equal(x.calls(),0);
});
test('invoice mismatch fails before touching storage',async()=>{
  const {archive,bytes}=await fixture();
  const x=load(archive,bytes,{invoiceId:otherTenant});
  await assert.rejects(x.read(),e=>e.code==='INVOICE_ARCHIVE_SCOPE_DENIED');
  assert.equal(x.calls(),0);
});
test('uncommitted draft archive is not readable',async()=>{
  const {archive,bytes}=await fixture();
  const x=load({...archive,state:'staged'},bytes);
  await assert.rejects(x.read(),/not committed/);
  assert.equal(x.calls(),0);
});
test('noncanonical archive path is not accepted',async()=>{
  const {archive,bytes}=await fixture();
  const x=load({...archive,path:'tenants/other/invoices/other/issued.pdf'},bytes);
  await assert.rejects(x.read(),/not canonical/);
  assert.equal(x.calls(),0);
});
test('wrong byte hash blocks resend even if PDF header is intact',async()=>{
  const {archive,bytes}=await fixture();
  const altered=Buffer.from(bytes);altered[altered.length-15]^=1;
  const x=load(archive,altered);
  await assert.rejects(x.read(),e=>e.code==='INVOICE_ARCHIVE_INTEGRITY_FAILED');
});
test('truncated PDF blocks resend',async()=>{
  const {archive,bytes}=await fixture();
  await assert.rejects(load(archive,bytes.subarray(0,75)).read(),/invalid PDF/);
});
test('missing storage object fails closed, never regenerates',async()=>{
  const {archive}=await fixture();
  await assert.rejects(load(archive,null).read(),/must be verified PDF bytes/);
});
test('a different committed snapshot changes fingerprint but cannot rewrite first archive',async()=>{
  const {archive,bytes,snapshot}=await fixture();
  const modified=structuredClone(snapshot);modified.issuer.legalName='Later Organization Name';
  const next=prepareInvoiceArchiveCandidate({snapshot:modified,pdfBytes:bytes});
  assert.notEqual(next.snapshotSha256,archive.snapshotSha256);
  assert.equal(next.pdfSha256,archive.pdfSha256);
  assert.deepEqual(await load(archive,bytes).read(),bytes);
});
test('snapshot totals and issuer are validated before a candidate can exist',async()=>{
  const {bytes,snapshot}=await fixture();
  const wrong=structuredClone(snapshot);wrong.totalCents++;
  assert.throws(()=>prepareInvoiceArchiveCandidate({snapshot:wrong,pdfBytes:bytes}),/reconcile/);
  const noIssuer=structuredClone(snapshot);delete noIssuer.issuer;
  assert.throws(()=>prepareInvoiceArchiveCandidate({snapshot:noIssuer,pdfBytes:bytes}),/Verified legal invoice issuer/);
});
test('reject traversal or malformed IDs before constructing paths',()=>{
  assert.throws(()=>issuedInvoiceArchivePath({
    tenantId:'../other',invoiceId,pdfSha256:'a'.repeat(64)
  }),/Invalid tenant ID/);
  assert.throws(()=>issuedInvoiceArchivePath({
    tenantId,invoiceId:'../../',pdfSha256:'a'.repeat(64)
  }),/Invalid invoice ID/);
});
test('archive metadata cannot redirect an object into another logical bucket',async()=>{
  const {archive,bytes}=await fixture();
  const x=load({...archive,bucket:'documents'},bytes);
  await assert.rejects(x.read(),/not committed and valid/);
  assert.equal(x.calls(),0);
});
test('archive metadata rejects hash substitution without storage reads',async()=>{
  const {archive,bytes}=await fixture();
  const x=load({...archive,pdfSha256:'a'.repeat(64)},bytes);
  await assert.rejects(x.read(),/not canonical/);
  assert.equal(x.calls(),0);
});
