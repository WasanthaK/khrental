import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withManagementEntitlement } from '../src/api/managementBilling/entitlementGate.js';
import { withAccessExpansion } from '../src/api/managementBilling/accessAdministration.js';

const T = '11111111-1111-4111-8111-111111111111';

test('the expanding write runs strictly inside the entitlement lock and its result or failure passes through', async () => {
  const events = [];
  const lock = async ({ tenantId, action }) => {
    events.push(`lock:${tenantId}`);
    try { return await action(); } finally { events.push('release'); }
  };
  const value = await withAccessExpansion({ tenantId: T, guard: lock, action: async () => { events.push('write'); return 'created'; } });
  assert.equal(value, 'created');
  assert.deepEqual(events, [`lock:${T}`, 'write', 'release']);

  events.length = 0;
  await assert.rejects(withAccessExpansion({ tenantId: T, guard: lock, action: async () => { events.push('write'); throw new Error('write failed'); } }),
    { message: 'write failed' });
  assert.deepEqual(events, [`lock:${T}`, 'write', 'release'], 'a failed write still releases the lock');

  events.length = 0;
  const denied = async () => { events.push('denied'); throw Object.assign(new Error('read-only'), { status: 403, code: 'MANAGEMENT_READ_ONLY' }); };
  await assert.rejects(withAccessExpansion({ tenantId: T, guard: denied, action: async () => { events.push('write'); } }), { code: 'MANAGEMENT_READ_ONLY' });
  assert.deepEqual(events, ['denied'], 'a denied decision never reaches the write');
});

test('organizations outside the enforcement scope write directly without a lock', async () => {
  let wrote = 0;
  assert.equal(await withManagementEntitlement({ tenantId: T, env: {}, action: async () => { wrote += 1; return 'ok'; } }), 'ok');
  assert.equal(wrote, 1);
});

test('every access-expanding repository write is performed inside the locked callback', () => {
  const source = file => readFileSync(new URL(`../src/api/${file}`, import.meta.url), 'utf8');
  const inside = (file, pattern, label) => assert.match(source(file), pattern, `${file}: ${label}`);
  inside('mssql/renteeRouter.js', /accessWrite\(req, true, \(\) => createOrAttachTenantRentee\(/, 'renter create');
  inside('mssql/renteeRouter.js', /accessWrite\(req, Boolean\(current && activatesAccess\(current\.status, req\.body\?\.status\)\),\n\s+\(\) => updateTenantRenteeMembershipStatus\(/, 'renter activation');
  inside('mssql/renteeRouter.js', /accessWrite\(req, renteeUpdateExpandsAccess\(rentee, req\.body \|\| \{\}\),\n\s+\(\) => updateTenantRentee\(/, 'renter compatibility update');
  inside('mssql/teamMemberRouter.js', /action: \(\) => createOrAttachTenantTeamMember\(/, 'team create');
  inside('mssql/teamMemberRouter.js', /runAccessExpansion\(\{ tenantId: req\.tenantId, action: write \}\)/, 'team grant');
  inside('platform/propertyAssignmentsRouter.js', /runAccessExpansion\(\{ tenantId: req\.tenantId, action: async \(\) => \{\n\s+existing = await runSingleQuery\(/, 'assignment create');
  inside('platform/propertyAssignmentsRouter.js', /runAccessExpansion\(\{ tenantId: req\.tenantId, action: writeAssignment \}\)/, 'assignment reactivation');
  inside('auth/invitationRouter.js', /runAccessExpansion\(\{ tenantId: req\.tenantId, action: async \(\) => \{\n\s+const recipient = await findAppUserByEmail/, 'invite by email');
  inside('auth/invitationRouter.js', /runAccessExpansion\(\{ tenantId: req\.tenantId, action: \(\) => sendInvitation\(/, 'invite by user');
  inside('mssql/router.js', /action: \(\) => createAppUser\(/, 'legacy user create');
  inside('mssql/router.js', /action: \(\) => linkAuthUserToAppUser\(/, 'legacy login link');
  inside('mssql/router.js', /runAccessExpansion\(\{ tenantId: req\.tenantId, action: write \}\)/, 'legacy user grant');
  inside('platform/router.js', /withAccessExpansion\(\{ tenantId: req\.tenantId, action: \(\) => ensureAuthRecord\(/, 'legacy platform invite');
  // Tenant-scoped calls only; /admin/* platform routes keep platform authority.
  for (const [file, call] of [['mssql/renteeRouter.js', 'createOrAttachTenantRentee(req.tenantId'],
    ['mssql/teamMemberRouter.js', 'createOrAttachTenantTeamMember(req.tenantId'],
    ['mssql/router.js', 'linkAuthUserToAppUser(req.params.id']]) {
    const text = source(file);
    const uses = text.split(call).length - 1;
    assert.equal(uses, 1, `${file}: ${call} is called only from the locked callback`);
  }
});
