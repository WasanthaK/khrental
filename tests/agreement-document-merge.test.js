import test from 'node:test';
import assert from 'node:assert/strict';
import { populateMergeFields } from '../src/utils/documentUtils.js';

test('agreement merge resolves property and unit shorthand fields used by KH Rentals templates', async () => {
  const template = [
    '{{startDate}}',
    '{{endDate}}',
    '{{propertyName}}',
    '{{propertyAddress}}',
    '{{propertyType}}',
    '{{propertySquareFeet}}',
    '{{renteePhone}}',
    '{{unitNumber}}',
    '{{unitFloor}}',
    '{{unitBedrooms}}',
    '{{monthlyRent}}',
    '{{depositAmount}}'
  ].join('|');

  const merged = await populateMergeFields(template, {
    agreement: {
      startDate: '2026-09-16',
      endDate: '2027-09-16',
      currentDate: new Date('2026-09-16T00:00:00Z'),
      agreementId: 'test-agreement'
    },
    property: {
      name: 'KN211',
      address: 'New No.31/64, School Avenue, Mahindarama Road, Ethul Kotte',
      propertytype: 'apartment',
      squarefeet: 1250
    },
    unit: {
      unitnumber: 'KH211',
      floor: '2',
      bedrooms: 3
    },
    rentee: {
      contact_details: { phone: '8860034973' }
    },
    terms: {
      monthlyRent: 20000,
      depositAmount: 40000,
      paymentDueDay: '5',
      noticePeriod: '30'
    }
  });

  assert.equal(/{{[^{}]+}}/.test(merged), false, `Unmerged placeholders remain: ${merged}`);
  assert.match(merged, /September 16, 2026/);
  assert.match(merged, /September 16, 2027/);
  assert.match(merged, /KN211/);
  assert.match(merged, /apartment/);
  assert.match(merged, /1250/);
  assert.match(merged, /KH211/);
  assert.match(merged, /\|2\|3\|/);
  assert.match(merged, /20,000/);
  assert.match(merged, /40,000/);
});
