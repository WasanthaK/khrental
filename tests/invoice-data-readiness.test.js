import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectInvoiceIssuanceReadiness } from '../src/api/platform/invoiceDataReadiness.js';

const sample = () => ({
  invoice: {
    tenant_id: 'tenant-a', renteeid: 'renter-a', propertyid: 'property-a',
    rentee_name: 'Recorded renter', rentee_email: 'renter@example.test',
    property_name: 'Recorded property', property_address: 'Verified property address',
    billingperiod: '2026-10', duedate: '2026-11-10', totalamount: 23340
  },
  components: [
    { component_type: 'rent', description: 'Rent', amount: 20000 },
    { component_type: 'electricity', description: 'Recorded utility', amount: 2340 },
    { component_type: 'water', description: 'Recorded utility', amount: 1000 }
  ],
  issuerProfile: {legalName: 'Recorded issuer', postalAddress: 'Verified business address', supportEmail: 'billing@example.test'},
  bankInstructions: {source: 'property', bankName: 'Recorded bank', branch: 'Recorded branch', accountNumber: '12345678', beneficiaryName: 'Verified account holder'}
});

test('complete recorded data is ready without an invoice UUID payment reference or issue timestamp', () => {
  const data = sample();
  assert.equal(data.invoice.payment_reference, undefined);
  assert.equal(data.invoice.issued_at, undefined);
  assert.deepEqual(inspectInvoiceIssuanceReadiness(data), {ready: true, missing: []});
});

test('missing issuer and beneficiary are actionable admin errors, never fabricated from names', () => {
  const data = sample();
  data.issuerProfile = null;
  data.bankInstructions.beneficiaryName = '';
  const result = inspectInvoiceIssuanceReadiness(data);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing.map(item => item.field), [
    'issuer.legalName', 'issuer.postalAddress', 'issuer.supportContact', 'bank.beneficiaryName'
  ]);
  assert.equal(result.missing[0].adminPath, '/dashboard/settings');
  assert.equal(result.missing[3].adminPath, '/dashboard/properties');
});

test('partial invoice details and mismatched arithmetic fail without mutating the draft', () => {
  const data = sample();
  const before = structuredClone(data);
  data.invoice.property_address = ' ';
  data.invoice.duedate = 'invalid';
  data.invoice.totalamount = 23341;
  data.invoice.rentee_email = 'not-an-email';
  const result = inspectInvoiceIssuanceReadiness(data);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing.map(item => item.field).slice(0,4), [
    'invoice.rentee_email', 'invoice.property_address', 'invoice.duedate', 'invoice.components'
  ]);
  assert.deepEqual(before.components, data.components);
  assert.deepEqual(before.bankInstructions, data.bankInstructions);
});

test('missing or invalid bank destination fails independently of payment destination source', () => {
  const data = sample();
  data.bankInstructions = {source: 'unit', bankName: 'Bank', branch: '', accountNumber: '123', beneficiaryName: ''};
  const missing = inspectInvoiceIssuanceReadiness(data).missing.map(x => x.field);
  assert.deepEqual(missing, ['bank.branch', 'bank.beneficiaryName']);
  data.bankInstructions.source = 'inferred';
  assert.equal(inspectInvoiceIssuanceReadiness(data).missing.at(-1).field, 'bank.source');
});

test('optional issuer website and renter phone are not forced or guessed', () => {
  const data = sample();
  data.issuerProfile.supportEmail = '';
  data.issuerProfile.supportPhone = '+94 11 234 5678';
  assert.equal(inspectInvoiceIssuanceReadiness(data).ready, true);
});

test('missing draft produces actionable failure instead of throwing', () => {
  const result = inspectInvoiceIssuanceReadiness({});
  assert.equal(result.ready, false);
  assert.equal(result.missing[0].field, 'invoice');
});
