import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const text = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('serving startup cannot invoke legacy or privileged migration tools', () => {
  const startup = text('../scripts/start-container.sh');
  assert.match(startup, /exec node server\.js/);
  assert.doesNotMatch(startup, /runMigration|exec_sql|executeSql|run-production-migrations|npm run migrate(?:\s|$)/);
});

test('legacy SQL RPC migration is not represented as governed production authority', () => {
  const pkg = JSON.parse(text('../package.json'));
  assert.equal(pkg.scripts.migrate, 'node src/db/runMigration.js');
  assert.match(text('../src/db/runMigration.js'), /platformClient\.rpc\('exec_sql'/);
  assert.equal(existsSync(new URL('../src/components/admin/SqlMigration.jsx', import.meta.url)), false);
});

test('approved migration workflow remains manual-confirmed for apply', () => {
  const workflow = text('../.github/workflows/run-production-db-migrations.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /APPLY-PRODUCTION/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event_name.*inputs\.mode \|\| 'plan'/);
  assert.equal(existsSync(new URL('../scripts/run-production-migrations.mjs', import.meta.url)), true);
});
