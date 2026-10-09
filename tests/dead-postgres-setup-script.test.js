import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('obsolete PostgreSQL setup RPC script stays absent', () => {
  assert.equal(existsSync(new URL('../src/scripts/setupDatabase.js', import.meta.url)), false);
});

test('active MSSQL migration entry points remain intact', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.migrate, 'node src/db/runMigration.js');
  assert.equal(pkg.scripts['execute-sql'], 'node src/db/executeSql.js');
  assert.equal(
    Object.values(pkg.scripts).some(command => command.includes('src/scripts/setupDatabase.js')),
    false
  );
  assert.equal(existsSync(new URL('../src/db/runMigration.js', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/db/executeSql.js', import.meta.url)), true);
});
