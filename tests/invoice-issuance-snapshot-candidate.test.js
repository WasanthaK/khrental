import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {buildInvoiceIssuanceSnapshotCandidate,captureInvoiceIssuanceSnapshotCandidate} from '../src/api/platform/invoiceIssuanceSnapshotCandidate.js';
import {createInvoiceDocumentPdfCandidate} from '../src/api/platform/invoicePdfCandidate.js';

const tenantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const invoiceId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const propertyId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const renterId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const invoice=()=>({id:invoiceId,tenant_id:tenantId,propertyid:propertyId,renteeid:renterId,
  status:'pending',billingperiod:'2026-10',issued_at:'2026-10-20',duedate:'2026-11-05',totalamount:25000});
const master=()=>({
  tenant_id:tenantId,property_id:propertyId,renter_id:renterId,
  property_name:'Example Apartment',property_address:'Example Street',renter_name:'Example Renter',
  invoice_issuer_profile_json:JSON.stringify({legalName:'Example Owner Ltd',
    postalAddress:'123 Example Lane',supportEmail:'billing@example.test'}),
  invoice_party_overrides_json:null,
  property_bank_name:'Example Bank',property_bank_branch:'Main',
  property_bank_account_number:'EXAMPLE123',property_bank_beneficiary_name:'Example Owner Ltd',
  unit_bank_name:null,unit_bank_branch:null,unit_bank_account_number:null,
  unit_bank_beneficiary_name:null,payment_reference:'26102001'
});
const components=()=>[{component_type:'rent',description:'Rent',amount:22000},
  {component_type:'water',description:'Water',amount:3000}];
const run=(opts={})=>buildInvoiceIssuanceSnapshotCandidate({
  invoice:opts.invoice||invoice(),masterRow:opts.masterRow||master(),
  components:opts.components||components(),paymentReference:opts.paymentReference||'26102001'
});
const blocked=(callback,field)=>assert.throws(callback,e=>e.code==='INVOICE_ISSUANCE_SNAPSHOT_BLOCKED'&&
  (!field||e.details?.field===field));
test('normal organization invoice has canonical legal issuer, beneficiary and hash',()=>{
  const record=run();
  assert.equal(record.documentSnapshot.issuer.legalName,'Example Owner Ltd');
  assert.equal(record.documentSnapshot.payment.beneficiaryName,'Example Owner Ltd');
  assert.equal(record.documentSnapshot.totalCents,2500000);
  assert.equal(record.documentSnapshotSha256,crypto.createHash('sha256')
    .update(JSON.stringify(record.documentSnapshot)).digest('hex'));
});
test('candidate renders normal invoice as one A4 PDF',async()=>{
  assert.equal((await createInvoiceDocumentPdfCandidate(run().documentSnapshot)).pageCount,1);
});
test('missing organization legal identity prevents issuing',()=>{
  const r=master();r.invoice_issuer_profile_json=null;
  blocked(()=>run({masterRow:r}),'issuer');
});
test('owner issued document uses explicitly authorized owner identity',()=>{
  const r=master();r.invoice_issuer_profile_json=null;
  r.invoice_party_overrides_json=JSON.stringify({issuerRole:'owner',
    issuerAuthorityConfirmed:true,propertyOwnerName:'Authorized Owner',
    propertyOwnerAddress:'Owner Street',propertyOwnerEmail:'owner@example.test'});
  assert.equal(run({masterRow:r}).documentSnapshot.issuer.legalName,'Authorized Owner');
  const bad=master();bad.invoice_party_overrides_json=JSON.stringify({issuerRole:'owner',
    issuerAuthorityConfirmed:false,propertyOwnerName:'Owner',
    propertyOwnerAddress:'Address',propertyOwnerPhone:'0112222222'});
  blocked(()=>run({masterRow:bad}),'parties');
});
test('outsourced manager issue requires explicit management mode',()=>{
  const r=master();r.invoice_issuer_profile_json=null;
  r.invoice_party_overrides_json=JSON.stringify({issuerRole:'manager',
    managementMode:'outsourced',issuerAuthorityConfirmed:true,
    externalManagerName:'Manager Ltd',externalManagerAddress:'Manager Road',
    externalManagerPhone:'0112222222'});
  assert.equal(run({masterRow:r}).documentSnapshot.issuer.role,'manager');
  const bad=master();bad.invoice_party_overrides_json=JSON.stringify({issuerRole:'manager',
    issuerAuthorityConfirmed:true,externalManagerName:'Manager Ltd',
    externalManagerAddress:'Road',externalManagerPhone:'0112222222'});
  blocked(()=>run({masterRow:bad}),'parties');
});
test('complete unit beneficiary overrides property banking',()=>{
  const r=master();Object.assign(r,{unit_bank_name:'Unit Bank',unit_bank_branch:'Unit',
    unit_bank_account_number:'UNIT123',unit_bank_beneficiary_name:'Authorized Beneficiary'});
  assert.equal(run({masterRow:r}).documentSnapshot.payment.beneficiaryName,'Authorized Beneficiary');
});
test('partial unit override never falls back to property bank',()=>{
  const r=master();r.unit_bank_beneficiary_name='Other Beneficiary';
  blocked(()=>run({masterRow:r}),'unit.bank');
});
test('partial property bank is blocked rather than inventing a payee',()=>{
  const r=master();r.property_bank_beneficiary_name='';
  blocked(()=>run({masterRow:r}),'property.bank');
});
test('completely absent banking is represented as missing, not invented',()=>{
  const r=master();for(const k of Object.keys(r))if(k.includes('_bank_'))r[k]=null;
  assert.equal(run({masterRow:r}).documentSnapshot.payment,null);
});
test('different tenant, renter and payment reference are rejected',()=>{
  const r=master();r.tenant_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  blocked(()=>run({masterRow:r}),'scope');
  const bad=master();bad.payment_reference='26102002';
  blocked(()=>run({masterRow:bad}),'paymentReference');
});
test('drafts, mismatched totals and excess precision are refused',()=>{
  const draft=invoice();draft.status='draft';blocked(()=>run({invoice:draft}),'invoice.status');
  const wrong=invoice();wrong.totalamount=24000;
  blocked(()=>run({invoice:wrong}),'invoice.totalamount');
  const fractional=invoice();fractional.totalamount=25000.001;
  blocked(()=>run({invoice:fractional}),'invoice.totalamount');
});
test('negative charge requires adjustment type',()=>{
  const inv=invoice();inv.totalamount=23000;
  const charges=[{description:'Rent',component_type:'rent',amount:25000},
    {description:'Credit',component_type:'adjustment',amount:-2000}];
  assert.equal(run({invoice:inv,components:charges}).documentSnapshot.totalCents,2300000);
  charges[1].component_type='water';blocked(()=>run({invoice:inv,components:charges}),'components');
});
test('SQL scope is parametrized on every query under same transaction',async()=>{
  const seen=[];
  class Request{
    constructor(tx){assert.equal(tx,'ISSUE_TX');this.values={};}
    input(k,v){this.values[k]=v;return this;}
    async query(stmt){
      seen.push({stmt,values:this.values});
      return {recordset:seen.length===1?[master()]:seen.length===2?[invoice()]:components()};
    }
  }
  const snapshot=await captureInvoiceIssuanceSnapshotCandidate({
    transaction:'ISSUE_TX',sql:{Request},tenantId,invoiceId,paymentReference:'26102001'
  });
  assert.equal(snapshot.documentSnapshot.totalCents,2500000);
  assert.equal(seen.length,3);
  for(const q of seen){
    assert.equal(q.values.tenantId,tenantId);assert.equal(q.values.invoiceId,invoiceId);
    assert.match(q.stmt,/@tenantId/);assert.match(q.stmt,/@invoiceId/);
  }
  assert.match(seen[0].stmt,/u\.tenant_id=i\.tenant_id/);
});
test('missing tenant-scoped SQL joins fail closed',async()=>{
  class Request{input(){return this;}async query(){return {recordset:[]};}}
  await assert.rejects(()=>captureInvoiceIssuanceSnapshotCandidate({
    transaction:{},sql:{Request},tenantId,invoiceId,paymentReference:'26102001'
  }),e=>e.code==='INVOICE_ISSUANCE_SNAPSHOT_BLOCKED'&&e.details.field==='scope');
});
