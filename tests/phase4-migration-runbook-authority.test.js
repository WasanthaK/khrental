import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const startup = source('../scripts/start-container.sh');
const server = source('../server.js');
const deploy = source('../.github/workflows/deploy-container-apps.yml');
const prodWorkflow = source('../.github/workflows/run-production-db-migrations.yml');
const plan = source('../scripts/run-production-migration-plan.sh');
const apply = source('../scripts/run-production-migration-apply.sh');
const databaseDoc = source('../database.md');
const cloudDoc = source('../docs/free-cloud-deployment.md');
const pkg = JSON.parse(source('../package.json'));

test('serving startup and deployment remain free of ungoverned SQL migration authority', () => {
  assert.match(startup, /exec node server\.js/);
  assert.doesNotMatch(startup, /npm run migrate|runMigration|executeSql|run-production-migrations|exec_sql/i);
  assert.doesNotMatch(server, /from ['"][^'"]*(?:runMigration|executeSql|run-production-migrations)/);
  assert.doesNotMatch(deploy, /npm run migrate|node src\/db\/runMigration\.js|node src\/db\/executeSql\.js|--mode=apply|APPLY-PRODUCTION/);
  assert.equal(pkg.scripts.migrate, 'node src/db/runMigration.js',
    'legacy command stays inventoried, not silently replaced by ungoverned production execution');
});

test('governed production workflow preserves separate, explicitly confirmed apply authorization', () => {
  assert.match(prodWorkflow, /workflow_dispatch:/);
  assert.match(prodWorkflow, /environment: Production/);
  assert.match(prodWorkflow, /inputs\.mode \|\| 'plan'/);
  assert.match(prodWorkflow, /MIGRATION_MODE.*apply/);
  assert.match(prodWorkflow, /APPLY-PRODUCTION/);
  assert.match(prodWorkflow, /khrental-db-migrator/);
  assert.match(prodWorkflow, /MSSQL_MIGRATION_DEDICATED_EXECUTOR=true/);
  assert.match(plan, /--mode=plan/);
  assert.doesNotMatch(plan, /--mode=apply/);
  assert.match(apply, /MSSQL_MIGRATION_DEDICATED_EXECUTOR/);
  assert.match(apply, /exec node .*run-production-migrations\.mjs --mode=apply/);
});

test('operator guides do not suggest legacy SQL commands as production authority', () => {
  for (const doc of [databaseDoc, cloudDoc]) {
    assert.match(doc, /run-production-db-migrations\.yml/);
    assert.match(doc, /plan/);
    assert.match(doc, /PRODUCTION-MIGRATION-EXECUTOR\.md/);
    assert.doesNotMatch(doc, /(?:Current production migrations[^\n]*executed with|For a new, empty Azure SQL database, apply the fresh-install schema first:)/);
  }
  assert.match(databaseDoc, /Do not[\s\S]*run it in production/);
  assert.match(cloudDoc, /do not[\s\S]*granting DDL to the runtime identity/i);
});
