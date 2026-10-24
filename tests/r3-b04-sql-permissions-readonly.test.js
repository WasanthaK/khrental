import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const file = new URL('../scripts/r3-b04-sql-permissions-readonly.mjs', import.meta.url);
const script = readFileSync(file, 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/r3-b04-sql-permissions-readonly.yml', import.meta.url), 'utf8');

test('R3 SQL rights diagnosis is SELECT-only and reports bits, no customer data', () => {
  assert.match(script, /HAS_PERMS_BY_NAME/);
  for (const right of ['SELECT','INSERT','UPDATE','DELETE']) assert.ok(script.includes("N'"+right+"'"));
  assert.match(script, /PUBLIC_SIGNUP_ENABLED !== 'false'/);
  assert.match(script, /R3_SQL_READONLY_DIAGNOSTIC_NO_DATA_MUTATION=PASS/);
  assert.doesNotMatch(script, /\.query\(\s*['`"]\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|DROP)/i);
  assert.doesNotMatch(script, /\bapp_users\b|\bauth_users\b|tenant_memberships/);
});

test('R3 permissions read-only job is strictly in-app, no broad SQL GRANT', () => {
  assert.match(workflow, /script -q -e -c/);
  assert.match(workflow, /R3_SQL_READONLY_DIAGNOSTIC_NO_DATA_MUTATION=PASS/);
  assert.match(workflow, /val\("PUBLIC_SIGNUP_ENABLED"\) == "false"/);
  assert.doesNotMatch(workflow, /\bGRANT\s+DELETE\b|az sql db update|--capacity|--min-replicas/);
});

test('R3 diagnostic parses and refuses local out-of-policy invocation', () => {
  const scriptPath = fileURLToPath(file);
  const syntax = spawnSync(process.execPath, ['--check', scriptPath], {encoding:'utf8'});
  assert.equal(syntax.status, 0, syntax.stderr);
  const refused = spawnSync(process.execPath, [scriptPath], {
    encoding:'utf8', env:{...process.env,NODE_ENV:'test',PUBLIC_SIGNUP_ENABLED:'false',PUBLIC_SIGNUP_PILOT_APPROVED:'false'}
  });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /R3_SQL_PERMISSION_READONLY=BLOCKED_UNKNOWN/);
});
