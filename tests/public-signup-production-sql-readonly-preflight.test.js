import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../scripts/check-production-schema.mjs', import.meta.url), 'utf8'
);
const workflow = readFileSync(
  new URL('../.github/workflows/diagnose-production-schema.yml', import.meta.url), 'utf8'
);

test('B04 diagnostics distinguish absent table, incomplete DDL and unledgered DDL', () => {
  assert.match(source, /b04_signup_challenge_table_exists/);
  assert.match(source, /b04_signup_sql_limiter_table_exists/);
  assert.match(source, /ABSENT_OR_NOT_VISIBLE/);
  assert.match(source, /PRESENT_BUT_INCOMPLETE/);
  assert.match(source, /STRUCTURE_PRESENT_NOT_LEDGERED/);
  assert.match(source, /STRUCTURE_AND_LEDGER_PRESENT_CHECKSUM_UNVERIFIED/);
  assert.match(source, /B04_SIGNUP_METADATA challenge=/);
});

test('migration ledger queries are read-only and limited to exactly two B04 IDs', () => {
  assert.match(source, /SELECT COUNT\(\*\) FROM dbo\.schema_migrations/);
  assert.match(source, /20261023_01_create_public_signup_challenges/);
  assert.match(source, /20261024_01_create_public_signup_rate_limits/);
  assert.match(source, /b04_signup_challenge_ledgered/);
  assert.match(source, /b04_signup_sql_limiter_ledgered/);
  assert.doesNotMatch(source, /\b(?:INSERT INTO|UPDATE|DELETE FROM|DROP TABLE|ALTER TABLE|TRUNCATE TABLE|MERGE INTO)\s+dbo\./i);
  assert.match(workflow, /name: Diagnose production schema/);
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.match(workflow, /Wait for this commit and MSSQL to be serving/);
  assert.match(workflow, /node scripts\/check-production-schema\.mjs/);
  assert.doesNotMatch(workflow, /az containerapp job (?:create|update|start)/);
});

test('positive schema flags do not imply an approved B04 production SQL apply', () => {
  assert.match(source, /CHECKSUM_UNVERIFIED/);
  assert.match(source, /SCHEMA_DIAGNOSTIC_OK/);
  assert.doesNotMatch(source, /--mode=apply|CREATE TABLE dbo\.public_signup/);
});
