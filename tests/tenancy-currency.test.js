import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, getAgreementCurrency } from '../src/utils/helpers.js';

test('accepted agreement currency survives locale and property market changes', () => {
  const agreement = { terms: '{"currency":"BND"}', property_country_code: 'LK' };
  assert.equal(getAgreementCurrency(agreement), 'BND');
  assert.match(formatCurrency(125000, getAgreementCurrency(agreement)), /^BND\s125,000\.00$/);
  assert.equal(agreement.terms, '{"currency":"BND"}');
  assert.equal(getAgreementCurrency({ terms: { currency: ' lkr ' } }), 'LKR');
  assert.match(formatCurrency(0, 'BND'), /^BND\s0\.00$/);
});

test('absent or malformed historical currency is not silently relabelled as LKR', () => {
  for (const terms of [undefined, null, '', '{broken', 'null', '[]', {}, { currency: '' }, { currency: 'not money' }]) {
    assert.equal(getAgreementCurrency({ terms, property_country_code: 'LK' }), null);
    assert.equal(formatCurrency(125000, getAgreementCurrency({ terms })), '125,000.00');
  }
});

test('legacy callers retain their existing LKR presentation', () => {
  assert.equal(formatCurrency(null), 'LKR 0.00');
  assert.equal(formatCurrency(125000), new Intl.NumberFormat('en-LK', {
    style: 'currency', currency: 'LKR', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(125000));
});

test('renter detail rent labels use recorded terms, including zero and missing currency', async () => {
  const { formatAgreementRent } = await import('../src/utils/helpers.js');
  assert.match(formatAgreementRent({rentamount:125000,terms:'{"currency":"LKR"}'}),/^LKR\s125,000\.00$/);
  assert.match(formatAgreementRent({rentamount:0,terms:{currency:'BND',monthlyRent:125000}}),/^BND\s0\.00$/);
  assert.equal(formatAgreementRent({terms:{monthlyRent:10}}),'10.00 (currency not recorded)');
  assert.equal(formatAgreementRent({rentamount:125000,terms:'broken'}),'125,000.00 (currency not recorded)');
  assert.equal(formatAgreementRent({terms:{currency:'LKR'}}),'Rent not recorded');
});
