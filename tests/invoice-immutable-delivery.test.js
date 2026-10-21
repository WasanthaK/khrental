import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInvoiceDocumentPdfCandidate } from '../src/api/platform/invoicePdfCandidate.js';
import { prepareInvoiceArchiveCandidate } from '../src/api/platform/issuedInvoiceArchiveCandidate.js';
import { prepareImmutableIssuedInvoiceAttachment } from '../src/api/platform/immutableInvoiceEmailAttachment.js';

const tenantId='11111111-1111-4111-8111-111111111111';
const invoiceId='22222222-2222-4222-8222-222222222222';
const actorUserId='33333333-3333-4333-8333-333333333333';
const snapshot=()=>({
  version:1,kind:'invoice_issued',tenantId,invoiceId,
  paymentReference:'26102101',billingPeriod:'2026-10',
  issuedAt:'2026-10-21',dueAt:'2026-11-21',
  issuer:{role:'organization',legalName:'Verified Legal Issuer',postalAddress:'1 Valid Road'},
  renter:{name:'Test Renter'},property:{name:'Test Property'},
  lines:[{description:'Monthly rent',amountCents:225000}],
  totalCents:225000,payment:null,design:{template:'classic'}
});
const setup=async()=>{
  const issuedSnapshot=snapshot();
  const pdf=await createInvoiceDocumentPdfCandidate(issuedSnapshot);
  const bytes=Buffer.from(pdf.content,'base64');
  const prepared=prepareInvoiceArchiveCandidate({snapshot:issuedSnapshot,pdfBytes:bytes});
  let archive=null,stored=null,created=0,published=0,renders=0;
  const adapters={
    issuanceLedger:{loadIssued:async()=>({issued:true,tenantId,invoiceId,
      snapshot:structuredClone(issuedSnapshot),snapshotSha256:prepared.snapshotSha256})},
    archiveLedger:{
      loadCommitted:async()=>archive,
      commitIfAbsent:async record=>{
        published++;
        archive={...record,state:'committed'};
        return {outcome:'inserted'};
      }
    }
  };
  const store={
    createIfAbsent:async(b,p,data)=>{
      created++;
      if(stored)return 'exists';
      stored=Buffer.from(data);
      return 'created';
    },
    getObject:async()=>({body:stored})
  };
  const invoke=(overrides={})=>prepareImmutableIssuedInvoiceAttachment({
    tenantId,invoiceId,actorUserId,adapters,store,
    render:async(...args)=>{renders++;return createInvoiceDocumentPdfCandidate(...args);},
    ...overrides
  });
  return {invoke,adapters,store,bytes,metrics:()=>({created,published,renders}),corrupt:()=>{
    stored=Buffer.from('%PDF-'+'.'.repeat(bytes.length));
  }};
};
test('initial email attachment is the exact verified committed archive bytes',async()=>{
  const a=await setup();
  const first=await a.invoke();
  assert.equal(first.type,'application/pdf');
  assert.equal(first.disposition,'attachment');
  assert.deepEqual(Buffer.from(first.content,'base64'),a.bytes);
  assert.deepEqual(a.metrics(),{created:1,published:1,renders:1});
});
test('resend reads archived PDF, never re-renders a changed tenant brand',async()=>{
  const a=await setup();const first=await a.invoke();
  const subsequent=await a.invoke({render:async()=>{throw Error('MUST NOT RENDER');}});
  assert.equal(subsequent.content,first.content);
  assert.deepEqual(a.metrics(),{created:1,published:1,renders:1});
});
test('a changed invoice-issued event cannot authorize resend of a different archived PDF',async()=>{
  const a=await setup();
  await a.invoke();
  const archivedEvidence=await a.adapters.issuanceLedger.loadIssued();
  const changed=structuredClone(archivedEvidence.snapshot);
  changed.issuer.legalName='New Tenant Branding After Issue';
  const crypto=(await import('node:crypto')).default;
  const {normalizeInvoiceDocumentSnapshot}=await import('../src/api/platform/invoicePdfCandidate.js');
  const canonical=normalizeInvoiceDocumentSnapshot(changed);
  const modifiedAdapters={
    ...a.adapters,
    issuanceLedger:{loadIssued:async()=>({
      issued:true,tenantId,invoiceId,snapshot:canonical,
      snapshotSha256:crypto.createHash('sha256')
        .update(JSON.stringify(canonical)).digest('hex')
    })}
  };
  await assert.rejects(a.invoke({adapters:modifiedAdapters,render:async()=>{
    throw Error('Re-rendering is forbidden');
  }}),e=>e.code==='INVOICE_ARCHIVE_ISSUANCE_MISMATCH');
  assert.deepEqual(a.metrics(),{created:1,published:1,renders:1});
});
test('missing issuance evidence cannot publish or email',async()=>{
  const a=await setup();
  await assert.rejects(a.invoke({adapters:{
    ...a.adapters,
    issuanceLedger:{loadIssued:async()=>null}
  }}),e=>e.code==='INVOICE_ISSUANCE_SNAPSHOT_MISSING');
  assert.deepEqual(a.metrics(),{created:0,published:0,renders:0});
});
test('damaged committed PDF blocks resend and never replaces original',async()=>{
  const a=await setup();await a.invoke();a.corrupt();
  await assert.rejects(a.invoke(),
    error => error.code === 'INVOICE_ARCHIVE_INTEGRITY_FAILED');
  assert.deepEqual(a.metrics(),{created:1,published:1,renders:1});
});
test('conditional storage conflict or SQL failure forbids email acceptance',async()=>{
  const a=await setup();
  await assert.rejects(a.invoke({store:{
    ...a.store,
    createIfAbsent:async()=>{throw Error('R2 OFFLINE')}
  }}),/R2 OFFLINE/);
  assert.equal(a.metrics().published,0);
});
test('identical snapshot produces byte-identical PDFs for archive recovery',async()=>{
  const one=await createInvoiceDocumentPdfCandidate(snapshot());
  await new Promise(resolve=>setTimeout(resolve,1100));
  const two=await createInvoiceDocumentPdfCandidate(snapshot());
  assert.equal(one.sha256,two.sha256);
  assert.equal(one.content,two.content);
});
test('router writes snapshot evidence before email attempt and never emails pre-archive bytes',()=>{
  const route=readFileSync(new URL('../src/api/platform/billingRouter.js',import.meta.url),'utf8');
  const issue=route.slice(route.indexOf("router.post('/invoices/:invoiceId/issue'"),
    route.indexOf("router.post('/invoices/:invoiceId/retry-delivery'"));
  const order=(label)=>issue.indexOf(label);
  assert.ok(order('captureInvoiceIssuanceSnapshotCandidate(')>=0);
  assert.ok(order('captureInvoiceIssuanceSnapshotCandidate(')<order("eventType: 'invoice_issued'"));
  assert.ok(order('documentEvidence || {}')>order('captureInvoiceIssuanceSnapshotCandidate('));
  const delivery=route.slice(route.indexOf('const deliverIssuedInvoice ='),
    route.indexOf("router.post('/invoices/:invoiceId/issue'"));
  assert.match(delivery,/prepareImmutableIssuedInvoiceAttachment/);
  assert.ok(delivery.indexOf('prepareImmutableIssuedInvoiceAttachment')<delivery.indexOf('sendInvoiceEmail('));
  assert.match(delivery,/INVOICE_IMMUTABLE_ARCHIVE_ENABLED/);
});
