import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoiceDocumentPdfCandidate } from '../src/api/platform/invoicePdfCandidate.js';
import { prepareInvoiceArchiveCandidate } from '../src/api/platform/issuedInvoiceArchiveCandidate.js';
import { publishIssuedInvoiceArchiveCandidate } from '../src/api/platform/issuedInvoiceArchiveWriteCandidate.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const invoiceId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const snapshot = () => ({
  version: 1,kind:'invoice_issued',tenantId,invoiceId,
  paymentReference:'26102001',billingPeriod:'2026-10',
  issuedAt:'2026-10-20',dueAt:'2026-11-02',
  issuer:{role:'organization',legalName:'Test Legal Property Company',
    postalAddress:'1 Test Lane'},
  renter:{name:'Example Renter'},property:{name:'Example Property'},
  lines:[{description:'Rent',amountCents:2000000},
    {description:'Electricity',amountCents:200000}],
  totalCents:2200000,
  payment:{source:'property',beneficiaryName:'Test Legal Property Company',
    bankName:'Example Bank',branch:'Main',accountNumber:'TEST1234'}
});

const setup = async () => {
  const issuedSnapshot=snapshot();
  const document=await createInvoiceDocumentPdfCandidate(issuedSnapshot);
  const pdfBytes=Buffer.from(document.content,'base64');
  const expected=prepareInvoiceArchiveCandidate({snapshot:issuedSnapshot,pdfBytes});
  const objects=new Map();
  let row=null,issued=true,storedHash=expected.snapshotSha256;
  let reads=0,creates=0,commits=0;
  const fake={
    issuanceLedger:{
      loadIssued:async ()=>({tenantId,invoiceId,issued,snapshotSha256:storedHash})
    },
    archiveLedger:{
      loadCommitted:async ()=>row,
      commitIfAbsent:async values=>{
        commits++;
        if (!issued || storedHash!==values.snapshotSha256) {
          throw Object.assign(new Error('Issuance changed during SQL commit'),{code:'ISSUANCE_CHANGED'});
        }
        if (row)return {outcome:'existing'};
        row={tenantId:values.tenantId,invoiceId:values.invoiceId,
          version:values.version,bucket:values.bucket,path:values.path,
          pdfSha256:values.pdfSha256,snapshotSha256:values.snapshotSha256,
          byteLength:values.byteLength,state:'committed'};
        return {outcome:'inserted'};
      }
    },
    objectStorage:{
      createIfAbsent:async (bucket,path,body)=>{
        creates++;
        const key=bucket+'/'+path;
        if(objects.has(key))return 'exists';
        objects.set(key,Buffer.from(body));
        return 'created';
      },
      getObject:async (bucket,path)=>{
        reads++;
        return {body:objects.get(bucket+'/'+path)};
      }
    }
  };
  const invoke=(overrides={}) => publishIssuedInvoiceArchiveCandidate({
    snapshot:issuedSnapshot,pdfBytes,actorUserId,...fake,...overrides
  });
  return {
    issuedSnapshot,pdfBytes,expected,objects,fake,invoke,
    setRow:v=>{row=v},getRow:()=>row,setIssued:v=>{issued=v},
    setHash:v=>{storedHash=v},
    counters:()=>({reads,creates,commits})
  };
};

test('successful archive requires create-if-absent, byte readback and committed ledger',async()=>{
  const f=await setup();
  const result=await f.invoke();
  assert.equal(result.state,'committed');
  assert.equal(result.archive.path,f.expected.path);
  assert.deepEqual(f.objects.get('invoices/'+f.expected.path),f.pdfBytes);
  assert.deepEqual(f.counters(),{reads:2,creates:1,commits:1});
});

test('repeat submission returns exact original committed PDF with no overwrite',async()=>{
  const f=await setup();await f.invoke();
  const again=await f.invoke();
  assert.equal(again.state,'already_committed');
  assert.deepEqual(f.counters(),{reads:3,creates:1,commits:1});
});

test('changed issuer after issuance is rejected before any write',async()=>{
  const f=await setup();
  const revised=structuredClone(f.issuedSnapshot);
  revised.issuer.legalName='Changed Legal Company';
  await assert.rejects(f.invoke({snapshot:revised}),e=>e.code==='INVOICE_ARCHIVE_ISSUANCE_MISMATCH');
  assert.deepEqual(f.counters(),{reads:0,creates:0,commits:0});
});

test('wrong tenant scope fails before creating an object',async()=>{
  const f=await setup();
  const changed=structuredClone(f.issuedSnapshot);
  changed.tenantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await assert.rejects(f.invoke({snapshot:changed}),e=>e.code==='INVOICE_ARCHIVE_ISSUANCE_MISMATCH');
  assert.equal(f.counters().creates,0);
});

test('never archives an unissued draft',async()=>{
  const f=await setup();f.setIssued(false);
  await assert.rejects(f.invoke(),e=>e.code==='INVOICE_ARCHIVE_ISSUANCE_MISMATCH');
  assert.equal(f.counters().creates,0);
});

test('archive writer requires a true conditional-create method, not generic storage.upload',async()=>{
  const f=await setup();
  await assert.rejects(f.invoke({objectStorage:{getObject:f.fake.objectStorage.getObject,
    upload:async()=>{throw new Error('must never call upload')}}}),
    e=>e.code==='INVOICE_ARCHIVE_ADAPTER_REQUIRED');
  assert.equal(f.counters().creates,0);
});

test('failed storage write blocks SQL commit',async()=>{
  const f=await setup();
  await assert.rejects(f.invoke({objectStorage:{
    ...f.fake.objectStorage,createIfAbsent:async()=>{throw new Error('storage offline')}
  }}),/storage offline/);
  assert.equal(f.counters().commits,0);
});

test('unconfirmed conditional write blocks SQL commit',async()=>{
  const f=await setup();
  await assert.rejects(f.invoke({objectStorage:{
    ...f.fake.objectStorage,createIfAbsent:async()=>({ok:true})
  }}),e=>e.code==='INVOICE_ARCHIVE_STORAGE_UNCONFIRMED');
  assert.equal(f.counters().commits,0);
});

test('corrupt readback blocks SQL commit',async()=>{
  const f=await setup();
  const altered=Buffer.from(f.pdfBytes);altered[altered.length-16]^=1;
  await assert.rejects(f.invoke({objectStorage:{
    ...f.fake.objectStorage,getObject:async()=>({body:altered})
  }}),e=>e.code==='INVOICE_ARCHIVE_INTEGRITY_FAILED');
  assert.equal(f.counters().commits,0);
});

test('if storage object exists from interrupted attempt, reverify and finish ledger',async()=>{
  const f=await setup();
  f.objects.set('invoices/'+f.expected.path,Buffer.from(f.pdfBytes));
  const result=await f.invoke();
  assert.equal(result.state,'committed');
  assert.equal(f.counters().commits,1);
});

test('interrupted attempt cannot adopt an existing object with different bytes',async()=>{
  const f=await setup();
  const altered=Buffer.from(f.pdfBytes);altered[altered.length-18]^=1;
  f.objects.set('invoices/'+f.expected.path,altered);
  await assert.rejects(f.invoke(),e=>e.code==='INVOICE_ARCHIVE_INTEGRITY_FAILED');
  assert.equal(f.counters().commits,0);
});

test('SQL commit timeout never claims success or deletes object',async()=>{
  const f=await setup();
  await assert.rejects(f.invoke({archiveLedger:{
    ...f.fake.archiveLedger,commitIfAbsent:async()=>{throw new Error('SQL timeout')}
  }}),/SQL timeout/);
  assert.equal(f.objects.has('invoices/'+f.expected.path),true);
});

test('idempotent retry after SQL timeout reconciles to original verified object',async()=>{
  const f=await setup();
  await assert.rejects(f.invoke({archiveLedger:{
    ...f.fake.archiveLedger,commitIfAbsent:async()=>{throw new Error('SQL timeout')}
  }}),/SQL timeout/);
  const result=await f.invoke();
  assert.equal(result.state,'committed');
  assert.equal(f.counters().creates,2);
  assert.equal(f.counters().commits,1);
});

test('duplicate existing ledger with another archive is never replaced',async()=>{
  const f=await setup();
  f.setRow({...f.expected,state:'committed',pdfSha256:'f'.repeat(64)});
  await assert.rejects(f.invoke(),e=>e.code==='INVOICE_ARCHIVE_CONFLICT');
  assert.equal(f.counters().creates,0);
});

test('race with conflicting committed record rejects even if object upload succeeded',async()=>{
  const f=await setup();
  const committedOther={...f.expected,state:'committed',pdfSha256:'c'.repeat(64)};
  await assert.rejects(f.invoke({archiveLedger:{
    loadCommitted:async()=>{
      if(!f.counters().commits)return null;
      return committedOther;
    },
    commitIfAbsent:async()=>({outcome:'existing'})
  }}),e=>e.code==='INVOICE_ARCHIVE_CONFLICT');
  // A racing ledger adapter must enforce uniqueness; this test represents
  // the post-insert conflicting-read check without generating another invoice.
});

test('unconfirmed ledger result is not interpreted as success',async()=>{
  const f=await setup();
  await assert.rejects(f.invoke({archiveLedger:{
    ...f.fake.archiveLedger,commitIfAbsent:async()=>({outcome:'pending'})
  }}),e=>e.code==='INVOICE_ARCHIVE_COMMIT_UNCONFIRMED');
});

test('broken committed archive bytes prevent idempotent email replay',async()=>{
  const f=await setup();await f.invoke();
  f.objects.set('invoices/'+f.expected.path,Buffer.alloc(f.pdfBytes.length,33));
  await assert.rejects(f.invoke(),/invalid PDF/);
  assert.equal(f.counters().commits,1);
});

test('actor identifier must be valid before any write',async()=>{
  const f=await setup();
  await assert.rejects(f.invoke({actorUserId:'../../'}),e=>e.code==='INVOICE_ARCHIVE_INVALID');
  assert.equal(f.counters().creates,0);
});
