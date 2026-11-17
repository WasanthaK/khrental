import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/api/mssql/teamMemberRepository.js', import.meta.url), 'utf8');
const block = (start, end = '\n};') => {
  const at = source.indexOf(start);
  assert.ok(at >= 0, start);
  return source.slice(at, source.indexOf(end, at) + end.length);
};

test('the team directory stays active-only; only the scoped readback may include inactive memberships', () => {
  assert.match(block('export const getTenantTeamMemberById'), /listTenantTeamMembers\(tenantId, \{ pageSize: 500 \}\)/);
  assert.match(block('const getTenantTeamMemberRecord'), /includeInactive: true/);
  assert.doesNotMatch(source, /export const getTenantTeamMemberRecord/, 'the inclusive lookup is not exported as a directory');
  assert.match(source, /\$\{includeInactive \? '' : "AND LOWER\(COALESCE\(tm_link\.status, 'active'\)\) = 'active'"\}/);
  assert.match(block('const mapTeamRow'), /tenant_membership_status[\s\S]*mapped\.active = false/);
});

test('updates reply from the scoped readback, validate before writing, and never reopen an inactive member', () => {
  const update = block('export const updateTenantTeamMember');
  assert.match(update, /return getTenantTeamMemberRecord\(tenantId, appUserId\);\n\};$/);
  const validated = update.indexOf('const bundle = normalizeBundle(');
  assert.ok(validated > 0 && validated < update.indexOf('await updateAppUser('), 'bundle validation precedes the profile write');
  assert.ok(validated < update.indexOf('await updateCanonicalTenantMembership('), 'and the membership write');
  const inactive = update.slice(update.indexOf('if (!current) {'), update.indexOf('// Validate before any write'));
  assert.match(inactive, /requested && requested !== 'active'/, 'activation is never offered for an inactive member');
  assert.match(inactive, /normalizeValue\(record\.tenant_membership_status\) === requested \? record : null/, 'only an identical repeat revocation is answered');
  assert.doesNotMatch(inactive, /updateAppUser|updateCanonicalTenantMembership/, 'the inactive path performs no write');
});
