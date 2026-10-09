import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('obsolete PostgreSQL timestamp RPC repair script stays absent', () => {
  assert.equal(existsSync(new URL('../src/scripts/updateTimestamps.js', import.meta.url)), false);
});

test('the active MSSQL migration entry points remain configured', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.migrate, 'node src/db/runMigration.js');
  assert.equal(pkg.scripts['execute-sql'], 'node src/db/executeSql.js');
  assert.equal(pkg.scripts['standardize-timestamps'], 'node src/scripts/standardizeTimestampColumns.js');
  assert.equal(pkg.scripts['fix-property-timestamps'], 'node src/scripts/fixPropertyTimestamps.js');
  assert.equal(
    Object.values(pkg.scripts).some(command => command.includes('src/scripts/updateTimestamps.js')),
    false
  );
});
