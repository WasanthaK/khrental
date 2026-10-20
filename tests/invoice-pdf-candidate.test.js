import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { normalizeInvoiceDocumentSnapshot, createInvoiceDocumentPdfCandidate } from '../src/api/platform/invoicePdfCandidate.js';

const invoice = () => ({
  version:1,kind:'invoice_issued',
  tenantId:'11111111-1111-4111-8111-111111111111',
  invoiceId:'22222222-2222-4222-8222-222222222222',
  paymentReference:'26101901',billingPeriod:'2026-10',
  issuedAt:'2026-10-19T00:00:00Z',dueAt:'2026-11-02T00:00:00Z',
  issuer:{role:'organization',legalName:'Synthetic Property Business Ltd',
    postalAddress:'12 Example Lane, Colombo',contactEmail:'billing@example.test'},
  renter:{name:'Example Tenant'},property:{name:'Example Property',address:'Colombo'},
  lines:[{description:'Rent',amountCents:2000000},
    {description:'Electricity',amountCents:234000},{description:'Water',amountCents:100000}],
  totalCents:2334000,
  payment:{source:'property',beneficiaryName:'Synthetic Property Business Ltd',
    bankName:'Example Bank',branch:'Main',accountNumber:'TEST-123456'}
});

test('normal issued three-charge statement and bank payment panel fit one A4 page',async()=>{
  const result=await createInvoiceDocumentPdfCandidate(invoice());
  const bytes=Buffer.from(result.content,'base64');
  const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),1);
  assert.equal(pdf.getAuthor(),'Synthetic Property Business Ltd');
  assert.equal(result.type,'application/pdf');
  assert.equal(result.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.match(result.snapshotSha256,/^[0-9a-f]{64}$/);
});

test('60 invoice components paginate rather than clipping off the sheet',async()=>{
  const sample=invoice();
  sample.lines=Array.from({length:60},(_,i)=>({
    description:'Monthly item '+(i+1)+' with a long supporting description and proper text wrapping',
    amountCents:10000
  }));
  sample.totalCents=600000;
  const pdf=await createInvoiceDocumentPdfCandidate(sample);
  assert.ok(pdf.pageCount>1);
});

test('legal issuer, line totals and payment beneficiary are not invented',async()=>{
  const sample=invoice();delete sample.issuer;
  assert.throws(()=>normalizeInvoiceDocumentSnapshot(sample),/Verified legal invoice issuer/);
  const mismatch=invoice();mismatch.totalCents++;
  assert.throws(()=>normalizeInvoiceDocumentSnapshot(mismatch),/reconcile/);
  const missingBeneficiary=invoice();delete missingBeneficiary.payment.beneficiaryName;
  assert.throws(()=>normalizeInvoiceDocumentSnapshot(missingBeneficiary),/beneficiaryName/);
});

test('alternative issuer requires explicit issuance authority',()=>{
  const sample=invoice();sample.issuer.role='owner';
  assert.throws(()=>normalizeInvoiceDocumentSnapshot(sample),/authority/);
  sample.issuer.authorityConfirmed=true;
  assert.equal(normalizeInvoiceDocumentSnapshot(sample).issuer.role,'owner');
});

test('missing verified bank information remains explicitly absent',async()=>{
  const sample=invoice();sample.payment=null;
  const result=await createInvoiceDocumentPdfCandidate(sample);
  assert.equal(result.pageCount,1);
  assert.equal(normalizeInvoiceDocumentSnapshot(sample).payment,null);
});

test('immutability fingerprint derives from canonical issued snapshot data',()=>{
  const before=normalizeInvoiceDocumentSnapshot(invoice());
  const after=normalizeInvoiceDocumentSnapshot(invoice());
  assert.deepEqual(before,after);
  const edited=invoice();edited.issuer.legalName='Another Business';
  assert.notDeepEqual(before,normalizeInvoiceDocumentSnapshot(edited));
});
