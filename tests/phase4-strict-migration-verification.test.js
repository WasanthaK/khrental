import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const runner = read('../scripts/run-production-migrations.mjs');
const verifier = read('../scripts/run-production-migration-verify.sh');
const workflow = read('../.github/workflows/verify-production-db-migration-executor.yml');

test('strict verify mode refuses missing ledger, untracked migrations, schema drift and bad checksums', () => {
  assert.match(runner, /'plan', 'apply', 'verify'/);
  assert.match(runner, /Strict migration verification must check all managed migrations/);
  assert.match(runner, /Strict production migration verification requires the dedicated executor managed identity/);
  assert.match(runner, /Migration ledger is missing; verification cannot claim production readiness/);
  assert.match(runner, /verifyMigrationChecksum\(migration, appliedRow, checksum\)/);
  assert.match(runner, /const inspection = await item\.migration\.inspect\(pool\)/);
  assert.match(runner, /!item\.appliedRow \|\| !inspection\.satisfied/);
  assert.match(runner, /Strict migration verification failed for/);
  assert.match(runner, /await assertExecutorGrantReadiness\(pool\)/);
  assert.match(runner, /HAS_PERMS_BY_NAME\('dbo', 'SCHEMA', 'ALTER'\)/);
});

test('verification entrypoint never uses apply and cannot silently run as a web identity', () => {
  assert.match(verifier, /MSSQL_MIGRATION_DEDICATED_EXECUTOR/);
  assert.match(verifier, /MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true/);
  assert.match(verifier, /--mode=verify --through=all/);
  assert.doesNotMatch(verifier, /--mode=apply/);
});

test('strict executor retains redacted evidence for all six ledger and schema checks', () => {
  assert.match(workflow, /capture_verification_evidence/);
  assert.match(workflow, /az containerapp job logs show/);
  assert.match(workflow, /Strict read-only migration verification passed for 6 managed migrations/);
  assert.match(workflow, /LEDGERED.*SCHEMA_OK/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /Raw Azure logs are not published/);
});

test('transient Azure 429 polling retries the same read-only execution without minting success', () => {
  assert.match(workflow, /if status=\$\(az containerapp job execution show/);
  assert.match(workflow, /Too Many Requests/);
  assert.match(workflow, /attempt \$attempt\/36/);
  assert.match(workflow, /sleep 25/);
  assert.match(workflow, /non-throttling error; no verification claim/);
  assert.match(workflow, /Executor status could not be verified within the bounded polling window/);
  assert.doesNotMatch(workflow, /sleep 10/);
});

test('production verification uses an isolated execution, no persistent job update or DDL', () => {
  assert.match(workflow, /VERIFY-MIGRATION-EXECUTOR/);
  assert.match(workflow, /scripts\/run-production-migration-verify\.sh/);
  assert.match(workflow, /MSSQL_MIGRATION_DEDICATED_EXECUTOR=true/);
  assert.match(workflow, /properties\.latestReadyRevisionName/);
  assert.match(workflow, /properties\.template\.containers\[0\]\.image/);
  assert.doesNotMatch(workflow, /az containerapp job update/);
  assert.doesNotMatch(workflow, /run-production-migration-apply\.sh/);
  assert.doesNotMatch(workflow, /--mode=apply/);
});
