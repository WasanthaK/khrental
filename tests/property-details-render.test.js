import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePropertyChecklist, normalizePropertyCoordinates } from '../src/utils/propertyDetailFields.js';

test('SQL checklist JSON never crashes property detail render', () => {
  assert.deepEqual(normalizePropertyChecklist('["Inspect locks","Check meter"]'), ['Inspect locks','Check meter']);
  assert.deepEqual(normalizePropertyChecklist('[{"text":"Key handover"},{"name":"Move in"}]'), ['Key handover','Move in']);
  assert.deepEqual(normalizePropertyChecklist('not-json'), []);
  assert.deepEqual(normalizePropertyChecklist('{"invalid":"shape"}'), []);
  assert.deepEqual(normalizePropertyChecklist(null), []);
});

test('coordinates are valid object or JSON coordinates, never unsafe raw string', () => {
  assert.deepEqual(normalizePropertyCoordinates('{"lat":6.92,"lng":79.87}'), {lat:6.92,lng:79.87});
  assert.deepEqual(normalizePropertyCoordinates(null,'6.92','79.87'), {lat:6.92,lng:79.87});
  assert.equal(normalizePropertyCoordinates('broken'), null);
  assert.equal(normalizePropertyCoordinates('{"lat":100,"lng":79}'), null);
});

test('card to details destination is registered, while matched-render errors are distinct from 404', () => {
  const card=readFileSync(new URL('../src/components/properties/PropertyCard.jsx',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/routes.jsx',import.meta.url),'utf8');
  const directory=readFileSync(new URL('../src/services/propertyDirectoryService.js',import.meta.url),'utf8');
  const details=readFileSync(new URL('../src/pages/PropertyDetails.jsx',import.meta.url),'utf8');
  const renderError=readFileSync(new URL('../src/pages/RouteRenderError.jsx',import.meta.url),'utf8');
  assert.match(card, /to=\{\x60\/dashboard\/properties\/\$\{id\}\x60\}/);
  assert.match(routes, /path: 'properties',[\s\S]*?path: ':id',[\s\S]*?PropertyDetails/);
  assert.match(routes, /errorElement: <RouteRenderError \/>/);
  assert.match(directory,/checklistitems: normalizePropertyChecklist/);
  assert.match(directory,/coordinates: normalizePropertyCoordinates/);
  assert.match(details,/property\?\.coordinates \|\| null/);
  assert.match(renderError,/isRouteErrorResponse/);
});
