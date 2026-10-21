import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIssuerProfile, normalizePropertyParties,
  normalizePropertyBilling, normalizeUnitBilling
} from '../src/api/platform/invoiceMasterValidation.js';

test('organization manager is default, without inventing manager or issuer', () => {
  const result=normalizePropertyParties({});
  assert.equal(result.managementMode,'tenant');
  assert.equal(result.issuerRole,'organization');
  assert.equal(result.externalManagerName,'');
  assert.equal(result.issuerAuthorityConfirmed,false);
});
test('verified issuer business profile accepts incomplete drafts without fabricated contact', () => {
  const p=normalizeIssuerProfile({legalName:' Verified Company '});
  assert.equal(p.legalName,'Verified Company');
  assert.equal(p.postalAddress,'');
  assert.equal(p.supportEmail,'');
});
test('outsource management requires actual name, address and contact', () => {
  assert.throws(()=>normalizePropertyParties({managementMode:'outsourced'}),/Outsourced management/);
  const r=normalizePropertyParties({managementMode:'outsourced',
    externalManagerName:'Manager Ltd',externalManagerAddress:'Recorded address',
    externalManagerEmail:'admin@example.test'});
  assert.equal(r.externalManagerName,'Manager Ltd');
});
test('manager as issuer requires confirmed authority and outsourced manager', () => {
  assert.throws(()=>normalizePropertyParties({issuerRole:'manager'}),/outsourced/);
  assert.throws(()=>normalizePropertyParties({managementMode:'outsourced',
    externalManagerName:'Manager Ltd',externalManagerAddress:'Recorded address',
    externalManagerEmail:'admin@example.test',issuerRole:'manager'}),/authority/);
});
test('owner issuer requires verified owner and explicit authority', () => {
  assert.throws(()=>normalizePropertyParties({issuerRole:'owner',issuerAuthorityConfirmed:true}),/owner name/);
  const a=normalizePropertyParties({issuerRole:'owner',issuerAuthorityConfirmed:true,
    propertyOwnerName:'Verified owner',propertyOwnerAddress:'Recorded owner address',
    propertyOwnerEmail:'owner@example.test'});
  assert.equal(a.issuerRole,'owner');
});
test('property beneficiary remains separate from management and invoice issuer', () => {
  const b=normalizePropertyBilling({beneficiaryName:'Recorded account holder'});
  assert.equal(b.beneficiaryName,'Recorded account holder');
  assert.equal(b.parties.managementMode,'tenant');
  assert.equal(b.parties.externalManagerName,'');
});
test('unit beneficiary is independent of property beneficiary', () => {
  assert.deepEqual(normalizeUnitBilling({beneficiaryName:' Unit recipient '}),{beneficiaryName:'Unit recipient'});
});
test('reject unapproved fields, malformed email and arbitrary management types', () => {
  assert.throws(()=>normalizePropertyBilling({bank_account_number:'changed'}),/not editable/);
  assert.throws(()=>normalizeIssuerProfile({supportEmail:'invalid'}),/valid email/);
  assert.throws(()=>normalizePropertyParties({managementMode:'unverified'}),/Choose organization-managed/);
  assert.throws(()=>normalizeUnitBilling({tenant_id:'foreign'}),/not editable/);
});

test('owner-issued invoices require real owner contact information', () => {
  assert.throws(()=>normalizePropertyParties({
    issuerRole:'owner',issuerAuthorityConfirmed:true,
    propertyOwnerName:'Verified owner',propertyOwnerAddress:'Recorded address'
  }),/owner name, address and contact/);
  const owner=normalizePropertyParties({
    issuerRole:'owner',issuerAuthorityConfirmed:true,
    propertyOwnerName:'Verified owner',propertyOwnerAddress:'Recorded address',
    propertyOwnerEmail:'owner@example.test'
  });
  assert.equal(owner.propertyOwnerEmail,'owner@example.test');
});


test('tenant-owned invoice designer rejects unsafe/custom styles and preserves curated options',async()=>{
  const { normalizeIssuerProfile }=await import('../src/api/platform/invoiceMasterValidation.js');
  const profile={legalName:'Test business',postalAddress:'Test address',supportEmail:'billing@example.test',
    supportPhone:'',website:'',design:{template:'corporate',paperFormat:'A4',primaryColor:'#23456a',
      footerText:'Contact our office',showPropertyAddress:true,showIssuerContact:true}};
  assert.deepEqual(normalizeIssuerProfile(profile).design,profile.design);
  assert.throws(()=>normalizeIssuerProfile({...profile,design:{template:'<script>'}}),/curated invoice layout/i);
  assert.throws(()=>normalizeIssuerProfile({...profile,design:{primaryColor:'#ffffff'}}),/darker color/i);
  assert.throws(()=>normalizeIssuerProfile({...profile,design:{footerText:'<script>alert(1)</script>',evil:true}}),
    /Unsupported invoice design field/i);
});

test('issuer logo accepts bounded PNG and blocks scripts, remote links and oversized assets',async()=>{
  const {normalizeInvoiceLogo}=await import('../src/api/platform/invoiceLogo.js');
  const make = (bytes) => 'data:image/png;base64,'+bytes.toString('base64');
  // Valid synthetic 1x1 RGBA PNG; not a customer's actual logo.
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2QAAAABJRU5ErkJggg==';
  // png color-type 4 (grayscale+alpha) is intentionally rejected: normalize
  // uploaded PNGs to RGB/RGBA in the image tool before issuing.
  assert.throws(()=>normalizeInvoiceLogo('https://example.org/logo.png'),/uploaded PNG/);
  assert.throws(()=>normalizeInvoiceLogo('data:image/svg+xml;base64,PHN2Zy8+'),/uploaded PNG/);
  assert.throws(()=>normalizeInvoiceLogo('data:image/png;base64,NOT-BASE64'),/invalid PNG/);
  assert.throws(()=>normalizeInvoiceLogo(make(Buffer.alloc(131073))),/128 KB/);
  assert.throws(()=>normalizeInvoiceLogo('data:image/png;base64,'+image),/RGB\/RGBA/);
  const validRgb='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQjZwKAAGKAQQmQizaAAAAAElFTkSuQmCC';
  assert.equal(normalizeInvoiceLogo('data:image/png;base64,'+validRgb),
    'data:image/png;base64,'+validRgb);
});
