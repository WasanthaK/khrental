import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const propertyListSource = readFileSync(
  new URL('../src/pages/PropertyList.jsx', import.meta.url),
  'utf8'
);

test('PropertyList uses the explicit tenant property directory', () => {
  assert.match(propertyListSource, /listTenantProperties/);
  assert.doesNotMatch(propertyListSource, /fetchData/);
  assert.doesNotMatch(propertyListSource, /platformClient/);
});
