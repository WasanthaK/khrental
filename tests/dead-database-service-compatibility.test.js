import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('unused generic databaseService compatibility facade stays absent', () => {
  assert.equal(
    existsSync(new URL('../src/services/databaseService.js', import.meta.url)),
    false
  );
});

test('active agreement data conversion remains available from dataUtils', () => {
  const utilitySource = readFileSync(
    new URL('../src/utils/dataUtils.js', import.meta.url),
    'utf8'
  );
  const agreementSource = readFileSync(
    new URL('../src/services/agreementService.js', import.meta.url),
    'utf8'
  );

  assert.match(utilitySource, /export const toDatabaseFormat\s*=/);
  assert.match(utilitySource, /export const fromDatabaseFormat\s*=/);
  assert.match(agreementSource, /import\s*\{\s*toDatabaseFormat\s*\}\s*from\s*['"]\.\.\/utils\/dataUtils['"]/);
});
