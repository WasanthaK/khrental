import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('unreferenced legacy property-association migration launcher stays absent', () => {
  assert.equal(existsSync(new URL('../src/scripts/run_migration.js', import.meta.url)), false);
});

test('underlying migration script and registered operational commands remain', () => {
  assert.equal(existsSync(new URL('../src/scripts/migrate_property_associations.js', import.meta.url)), true);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.migrate, 'node src/db/runMigration.js');
  assert.equal(pkg.scripts['create-exec-sql'], 'node src/scripts/create_exec_sql_function.js');
  assert.equal(pkg.scripts['setup-signature'], 'node src/scripts/setupAgreementSignature.js');
  assert.equal(pkg.scripts['standardize-timestamps'], 'node src/scripts/standardizeTimestampColumns.js');
  assert.equal(pkg.scripts['add-properties-column'], 'node src/scripts/add_associated_properties_column.js');
  assert.equal(pkg.scripts['fix-app-users'], 'node src/scripts/fixAppUsersPropertyIds.js');
  assert.equal(existsSync(new URL('../scripts/run-production-migrations.mjs', import.meta.url)), true);
  assert.equal(existsSync(new URL('../.github/workflows/run-production-db-migrations.yml', import.meta.url)), true);
});
