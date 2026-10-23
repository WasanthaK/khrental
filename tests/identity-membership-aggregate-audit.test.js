import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  IDENTITY_MEMBERSHIP_AUDIT_SQL,
  IDENTITY_MEMBERSHIP_AUDIT_FIELDS,
  readIdentityMembershipAuditCounts
} from '../scripts/identity-membership-audit-queries.mjs';

const runner = readFileSync(
  new URL('../scripts/audit-identity-memberships-readonly.mjs', import.meta.url), 'utf8'
);
const workflow = readFileSync(
  new URL('../.github/workflows/audit-production-identity-memberships.yml', import.meta.url),
  'utf8'
);

test('audit SQL contains only aggregate SELECTs, without mutations or identifying projections', () => {
  assert.match(IDENTITY_MEMBERSHIP_AUDIT_SQL.trimStart(), /^SELECT\b/i);
  assert.equal((IDENTITY_MEMBERSHIP_AUDIT_SQL.match(/COUNT_BIG\(\*\)/g) || []).length, 8);
  assert.doesNotMatch(IDENTITY_MEMBERSHIP_AUDIT_SQL, /\b(?:INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE)\b/i);
  assert.doesNotMatch(IDENTITY_MEMBERSHIP_AUDIT_SQL, /SELECT\s+(?:TOP\s+\d+\s+)?(?:u|m|a)\.(?:email|id|auth_id|name)\b/i);
  for (const field of IDENTITY_MEMBERSHIP_AUDIT_FIELDS) {
    assert.match(IDENTITY_MEMBERSHIP_AUDIT_SQL, new RegExp('\\bAS ' + field + '\\b'));
  }
});

test('audit field extraction only exports approved safe counts and rejects inconsistent responses', () => {
  const row = Object.fromEntries(IDENTITY_MEMBERSHIP_AUDIT_FIELDS.map((key, i) => [key, i]));
  row.email = 'private@example.invalid';
  row.auth_id = 'not-for-output';
  const counts = readIdentityMembershipAuditCounts(row);
  assert.deepEqual(Object.keys(counts), [...IDENTITY_MEMBERSHIP_AUDIT_FIELDS]);
  assert.equal(counts.legacy_without_any_membership_count, 1);
  assert.ok(!('email' in counts));
  assert.ok(!('auth_id' in counts));
  assert.throws(() => readIdentityMembershipAuditCounts({ ...row, tenantless_global_profile_count: null }));
  assert.throws(() => readIdentityMembershipAuditCounts({ ...row, legacy_tenant_pointer_count: -1 }));
  assert.throws(() => readIdentityMembershipAuditCounts(null));
});

test('runtime script never prints driver errors and runs only the approved aggregate query', () => {
  assert.match(runner, /readIdentityMembershipAuditCounts\(\s*await runSingleQuery\(IDENTITY_MEMBERSHIP_AUDIT_SQL\)/);
  assert.match(runner, /IDENTITY_MEMBERSHIP_AUDIT_OK/);
  assert.match(runner, /IDENTITY_MEMBERSHIP_AUDIT_FAILED: read-only reconciliation was not completed/);
  assert.doesNotMatch(runner, /console\.error\(.*error\.message/);
});

test('Azure audit uses Production OIDC with immutable serving SHA and read-only script', () => {
  assert.match(workflow, /environment: Production/);
  assert.match(workflow, /azure\/login@v2/);
  assert.match(workflow, /\.buildSha == \$sha/);
  assert.match(workflow, /api\/mssql\/health/);
  assert.match(workflow, /scripts\/audit-identity-memberships-readonly\.mjs/);
  assert.doesNotMatch(workflow, /--args\s+scripts\/run-production-migration-apply/);
  assert.doesNotMatch(workflow, /--mode=apply/);
});
