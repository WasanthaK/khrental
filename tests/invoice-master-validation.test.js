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
