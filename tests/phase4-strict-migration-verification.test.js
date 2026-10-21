import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const runner = read('../scripts/run-production-migrations.mjs');
const verifier = read('../scripts/run-production-migration-verify.sh');
const preflight = read('../scripts/run-production-migration-preflight.sh');
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

test('strict executor retains evidence for every ledger and schema check in the migration manifest', () => {
  assert.match(workflow, /capture_verification_evidence/);
  assert.match(workflow, /az containerapp job logs show/);
  const manifestIds = [...runner.matchAll(/^\s+id:\s*'(\d{8}_\d{2}_[^']+)'/gm)].map(match => match[1]);
  const configuredIds = workflow.match(/migration_ids="([\s\S]*?)"/)?.[1]?.trim().split(/\s+/);
  assert.ok(manifestIds.length > 0);
  assert.deepEqual(configuredIds, manifestIds, 'strict workflow evidence must cover every managed migration in order');
  assert.ok(workflow.includes(`Strict read-only migration verification passed for ${manifestIds.length} managed migrations;`));
  assert.ok(workflow.includes(`**${manifestIds.length}/${manifestIds.length} ledger/schema checks passed.**`));
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

test('read-only executor preflight checks grants and all manifest states without substituting for strict acceptance', () => {
  assert.match(preflight, /MSSQL_MIGRATION_DEDICATED_EXECUTOR/);
  assert.match(preflight, /MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true/);
  assert.match(preflight, /--mode=preflight --through=all/);
  assert.doesNotMatch(preflight, /--mode=apply/);
  assert.match(runner, /mode === 'preflight'/);
  assert.match(runner, /Read-only preflight requires the dedicated executor managed identity/);
  assert.match(runner, /Read-only executor preflight passed for/);
  assert.match(runner, /Already-applied migration .* has schema drift; refusing preflight/);
  assert.match(workflow, /verification_script="scripts\/run-production-migration-preflight\.sh"/);
  assert.match(workflow, /PREFLIGHT\[\[:space:\]\]/);
  assert.match(workflow, /Preflight allows PENDING and SATISFIED_UNTRACKED/);
  assert.match(workflow, /Strict read-only migration verification passed for 9 managed migrations/);
  assert.doesNotMatch(workflow, /az containerapp job update/);
  assert.doesNotMatch(workflow, /--mode=apply/);
});

test('controlled production migration selection includes every governed migration target',()=>{
  const workflow=read('../.github/workflows/run-production-db-migrations.yml');
  const manifestIds=[...runner.matchAll(/^\s+id:\s*'(\d{8}_\d{2}_[^']+)'/gm)]
    .map(match=>match[1]);
  const dispatch=workflow.split('workflow_dispatch:')[1]?.split('\npermissions:')[0]||'';
  const through=dispatch.split('through:')[1]?.split('confirmation:')[0]||'';
  for(const id of manifestIds){
    assert.ok(through.includes(`- ${id}`),`Missing explicitly selectable migration: ${id}`);
  }
  assert.match(workflow,/Automatic production migration runs are restricted to plan mode/);
  assert.match(workflow,/APPLY-PRODUCTION/);
});
