import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renteeDetailsSource = readFileSync(
  new URL('../src/pages/RenteeDetails.jsx', import.meta.url),
  'utf8'
);

const renteeAgreementsSource = readFileSync(
  new URL('../src/pages/rentee/RenteeAgreements.jsx', import.meta.url),
  'utf8'
);

test('admin renter agreement cards resolve property by propertyid when relation projection is missing', () => {
  assert.match(renteeDetailsSource, /fetchProperty/);
  assert.match(renteeDetailsSource, /agreement\.properties \|\| !agreement\.propertyid/);
  assert.match(renteeDetailsSource, /fetchProperty\(agreement\.propertyid\)/);
  assert.match(renteeDetailsSource, /properties:\s*resolvedProperty/);
});

test('renter agreement cards resolve property by propertyid when relation projection is missing', () => {
  assert.match(renteeAgreementsSource, /fetchProperty/);
  assert.match(renteeAgreementsSource, /agreement\.property \|\| \(agreement\.propertyid/);
  assert.match(renteeAgreementsSource, /fetchProperty\(agreement\.propertyid\)/);
  assert.match(renteeAgreementsSource, /property:\s*resolvedProperty/);
});
