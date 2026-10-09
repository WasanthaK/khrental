import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dataUtils = readFileSync(new URL('../src/utils/dataUtils.js', import.meta.url), 'utf8');
const agreement = readFileSync(new URL('../src/services/agreementService.js', import.meta.url), 'utf8');

test('dataUtils no longer exports unused platform-backed fetchData', () => {
  assert.doesNotMatch(dataUtils, /\bplatformClient\b/);
  assert.doesNotMatch(dataUtils, /export\s+const\s+fetchData\b/);
});

test('dataUtils preserves agreement conversion helpers', () => {
  assert.match(dataUtils, /export\s+const\s+fromDatabaseFormat\s*=/);
  assert.match(dataUtils, /export\s+const\s+toDatabaseFormat\s*=/);
  assert.match(agreement, /import\s*\{\s*toDatabaseFormat\s*\}\s*from\s*['"]\.\.\/utils\/dataUtils['"]/);
});
