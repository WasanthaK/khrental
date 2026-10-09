import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('orphaned browser SQL migration UI is not shipped', () => {
  assert.equal(existsSync(new URL('../src/components/admin/SqlMigration.jsx', import.meta.url)), false);
});

test('governed migration executor and existing operational commands are preserved', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.migrate, 'node src/db/runMigration.js');
  assert.equal(pkg.scripts['execute-sql'], 'node src/db/executeSql.js');
  assert.equal(existsSync(new URL('../src/db/runMigration.js', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/db/executeSql.js', import.meta.url)), true);
  assert.equal(existsSync(new URL('../scripts/run-production-migrations.mjs', import.meta.url)), true);
  assert.equal(existsSync(new URL('../.github/workflows/run-production-db-migrations.yml', import.meta.url)), true);
});
