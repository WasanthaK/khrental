import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activatesAccess,
  addsPropertyAccess,
  appUserUpdateExpandsAccess,
  assertAccessExpansionAllowed,
  genericAppUserWriteExpandsAccess,
  grantsAdditionalPermissions,
  propertyIdsOf,
  renteeUpdateExpandsAccess,
  teamMemberUpdateExpandsAccess
} from '../src/api/managementBilling/accessAdministration.js';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

test('property access additions are detected across stored shapes; removals and reorderings are not expansion', () => {
  assert.deepEqual([...propertyIdsOf(JSON.stringify([{ propertyId: P1.toUpperCase() }, P2]))], [P1, P2]);
  assert.equal(addsPropertyAccess([P1], undefined), false, 'field not supplied');
  assert.equal(addsPropertyAccess([P1, P2], [P2]), false, 'removal');
  assert.equal(addsPropertyAccess([P1, P2], [{ property_id: P2 }, { id: P1 }]), false, 'same set, other shape');
  assert.equal(addsPropertyAccess(JSON.stringify([P1]), [P1.toUpperCase()]), false, 'case-insensitive');
  assert.equal(addsPropertyAccess([P1], [P1, P2]), true);
  assert.equal(addsPropertyAccess(null, [{ propertyId: P1 }]), true);
  assert.equal(addsPropertyAccess([P1], []), false);
  const U1 = '33333333-3333-4333-8333-333333333333';
  assert.equal(addsPropertyAccess([{ propertyId: P1 }], [{ propertyId: P1, unitId: U1 }]), true, 'a unit grant is distinct');
  assert.equal(addsPropertyAccess([{ propertyId: P1, unitId: U1 }], [{ property_id: P1, unit_id: U1.toUpperCase() }]), false);
});

test('activation is only a non-active to active transition; a missing stored status is active', () => {
  assert.equal(activatesAccess('inactive', 'active'), true);
  assert.equal(activatesAccess('suspended', ' ACTIVE '), true);
  assert.equal(activatesAccess('active', 'active'), false);
  assert.equal(activatesAccess(null, 'active'), false);
  assert.equal(activatesAccess('active', 'inactive'), false, 'revocation');
  assert.equal(activatesAccess('inactive', undefined), false);
  assert.equal(activatesAccess('inactive', ''), false);
});

test('permission expansion compares effective permission sets, so demotions and equivalent legacy roles pass', () => {
  assert.equal(grantsAdditionalPermissions({ role: 'staff', permission_bundle: 'read_only' }, { permission_bundle: 'finance' }), true);
  assert.equal(grantsAdditionalPermissions({ role: 'staff', permission_bundle: 'finance' }, { permission_bundle: 'read_only' }), false);
  assert.equal(grantsAdditionalPermissions({ role: 'manager' }, { permission_bundle: 'property_operations' }), false, 'legacy manager equals bundle');
  assert.equal(grantsAdditionalPermissions({ role: 'staff', permission_bundle: 'maintenance' }, { role: 'admin' }), true);
  assert.equal(grantsAdditionalPermissions({ role: 'rentee' }, { user_type: 'staff' }), true);
  assert.equal(grantsAdditionalPermissions({ role: 'admin' }, { role: 'staff' }), false, 'demotion is cleanup');
  assert.equal(grantsAdditionalPermissions({ role: 'staff', permission_bundle: 'finance' }, { name: 'Renamed' }), false);
});

test('writer classifiers allow cleanup and profile edits but flag every grant', () => {
  const rentee = { status: 'active', associated_properties: [{ propertyId: P1 }] };
  assert.equal(renteeUpdateExpandsAccess(rentee, { name: 'New name', contact_details: { phone: '1' } }), false);
  assert.equal(renteeUpdateExpandsAccess(rentee, { associated_properties: [] }), false);
  assert.equal(renteeUpdateExpandsAccess(rentee, { associated_property_ids: [P1, P2] }), true);
  assert.equal(renteeUpdateExpandsAccess({ ...rentee, status: 'inactive' }, { status: 'active' }), true);

  const member = { role: 'staff', permission_bundle: 'maintenance', tenant_membership_status: 'active', status: 'active' };
  assert.equal(teamMemberUpdateExpandsAccess(member, { notes: 'x', membership_status: 'inactive' }), false);
  assert.equal(teamMemberUpdateExpandsAccess(member, { permission_bundle: 'read_only' }), false);
  assert.equal(teamMemberUpdateExpandsAccess(member, { permission_bundle: 'finance' }), true);
  assert.equal(teamMemberUpdateExpandsAccess({ ...member, tenant_membership_status: 'inactive' }, { membership_status: 'active' }), true);

  const user = { role: 'staff', permission_bundle: 'read_only', status: 'active', auth_id: 'auth-1' };
  assert.equal(appUserUpdateExpandsAccess(user, { name: 'x', status: 'inactive' }), false);
  assert.equal(appUserUpdateExpandsAccess(user, { auth_id: 'AUTH-1' }), false, 'same login');
  assert.equal(appUserUpdateExpandsAccess(user, { auth_id: 'auth-2' }), true);
  assert.equal(appUserUpdateExpandsAccess(user, { role: 'manager' }), true);
  assert.equal(appUserUpdateExpandsAccess(user, { associated_properties: [P1] }), true);
});

test('generic app_users writes count inserts, grants, links and activation as expansion, not deactivation or profile edits', () => {
  const at = (action, payload) => genericAppUserWriteExpandsAccess({ table: 'app_users', action, payload });
  assert.equal(at('insert', { name: 'x' }), true);
  assert.equal(at('upsert', [{ id: P1, name: 'x' }]), true);
  assert.equal(at('update', { name: 'x', contact_details: {} }), false);
  assert.equal(at('update', { status: 'inactive' }), false);
  assert.equal(at('delete', {}), false);
  for (const payload of [{ role: 'staff' }, { user_type: 'rentee' }, { permission_bundle: 'finance' }, { associated_properties: [] },
    { tenant_id: P1 }, { auth_id: 'a' }, { status: 'active' }, [{ name: 'x' }, { status: 'ACTIVE' }]]) {
    assert.equal(at('update', payload), true, JSON.stringify(payload));
  }
  assert.equal(genericAppUserWriteExpandsAccess({ table: 'properties', action: 'insert', payload: {} }), false);
});

test('organizations outside the server enforcement scope need no entitlement lock; request flags are irrelevant', async () => {
  for (const env of [{}, { MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED: 'false' },
    { MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED: 'true', MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS: P2 }]) {
    assert.equal(await assertAccessExpansionAllowed({ tenantId: P1, env }), undefined, JSON.stringify(env));
  }
  await assert.rejects(assertAccessExpansionAllowed({ tenantId: P1,
    env: { MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED: 'yes', MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS: P1 } }),
  { code: 'BILLING_ENFORCEMENT_CONFIGURATION' }, 'misconfiguration fails closed');
});

test('the expansion guard delegates to the management-write entitlement lock with an empty action', async () => {
  const calls = [];
  await assertAccessExpansionAllowed({ tenantId: P1, guard: async args => { calls.push(args); return args.action(); } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tenantId, P1);
  assert.equal(await calls[0].action(), undefined);
  const denied = Object.assign(new Error('read-only'), { status: 403, code: 'MANAGEMENT_READ_ONLY' });
  await assert.rejects(assertAccessExpansionAllowed({ tenantId: P1, guard: async () => { throw denied; } }), { code: 'MANAGEMENT_READ_ONLY' });
});

test('every tenant-scoped access writer is wired to the policy and no revocation path is', () => {
  const source = file => readFileSync(new URL(`../src/api/${file}`, import.meta.url), 'utf8');
  const route = (text, signature) => {
    const start = text.indexOf(signature);
    assert.ok(start >= 0, signature);
    const next = text.indexOf('router.', start + signature.length);
    return text.slice(start, next < 0 ? undefined : next);
  };
  const expectGuarded = (file, signatures) => {
    const text = source(file);
    for (const signature of signatures) {assert.match(route(text, signature), /assertAccessExpansion\(/, `${file} ${signature}`);}
  };
  const expectUnguarded = (file, signatures) => {
    const text = source(file);
    for (const signature of signatures) {assert.doesNotMatch(route(text, signature), /assertAccessExpansion/, `${file} ${signature}`);}
  };
  expectGuarded('mssql/renteeRouter.js', ["router.post('/rentees'", "router.patch('/rentees/:id/membership-status'", "router.put('/app-users/:id'"]);
  assert.match(route(source('mssql/renteeRouter.js'), "router.put('/rentees/:id'"), /guardRenteeUpdate\(req\)/);
  expectGuarded('mssql/teamMemberRouter.js', ["router.post('/team-members'", "router.put('/team-members/:id'"]);
  expectGuarded('platform/propertyAssignmentsRouter.js', ["router.post('/'", "router.patch('/:assignmentId'"]);
  expectUnguarded('platform/propertyAssignmentsRouter.js', ["router.delete('/:assignmentId'"]);
  expectGuarded('auth/invitationRouter.js', ["router.post('/invite'", "router.post('/invitations'"]);
  expectUnguarded('auth/invitationRouter.js', ["router.post('/invitations/redeem'"]);
  expectGuarded('mssql/router.js', ["router.post('/app-users'", "router.put('/app-users/:id'", "router.post('/app-users/:id/link'"]);
  expectUnguarded('mssql/router.js', ["router.delete('/app-users/:id'"]);
  assert.match(source('platform/router.js'), /MANAGEMENT_TABLES\.has\(authorized\.table\) \|\| genericAppUserWriteExpandsAccess\(authorized\)/);
  assert.match(route(source('platform/router.js'), "router.post('/auth/invite'"), /assertAccessExpansionAllowed\(\{ tenantId: req\.tenantId \}\)/);
  for (const file of ['mssql/platformAdminRouter.js', 'mssql/membershipAdminRouter.js', 'managementBilling/router.js']) {
    assert.doesNotMatch(source(file), /accessAdministration|assertAccessExpansion/, `${file} keeps platform authority and billing recovery`);
  }
  assert.doesNotMatch(source('managementBilling/accessAdministration.js'), /req\.body|MANAGEMENT_BILLING_WRITE_ENFORCEMENT/,
    'the policy reads no client-supplied enforcement flag');
});
