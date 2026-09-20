import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMembershipAccess } from '../src/api/mssql/membershipAdminRepository.js';
import { isRenteeMembership } from '../src/api/mssql/renteeRepository.js';

const renteeRepositorySource = readFileSync(new URL('../src/api/mssql/renteeRepository.js', import.meta.url), 'utf8');
const renteeFormSource = readFileSync(new URL('../src/pages/RenteeForm.jsx', import.meta.url), 'utf8');
const renteeServiceSource = readFileSync(new URL('../src/services/renteeService.js', import.meta.url), 'utf8');
const inviteButtonSource = readFileSync(new URL('../src/components/common/InviteUserButton.jsx', import.meta.url), 'utf8');
const invitationServiceSource = readFileSync(new URL('../src/services/invitationService.js', import.meta.url), 'utf8');
const migrationRunnerSource = readFileSync(new URL('../scripts/run-production-migrations.mjs', import.meta.url), 'utf8');
const migrationWorkflowSource = readFileSync(new URL('../.github/workflows/run-production-db-migrations.yml', import.meta.url), 'utf8');

test('canonicalizes administrator and tenant membership roles', () => {
  assert.deepEqual(normalizeMembershipAccess({ role: 'admin' }), {
    role: 'admin',
    permission_bundle: null,
    portal_type: 'admin'
  });

  assert.deepEqual(normalizeMembershipAccess({ role: 'tenant' }), {
    role: 'rentee',
    permission_bundle: null,
    portal_type: 'tenant'
  });

  assert.deepEqual(normalizeMembershipAccess({ role: 'rentee' }), {
    role: 'rentee',
    permission_bundle: null,
    portal_type: 'tenant'
  });
});

test('renter directory accepts canonical tenant and legacy rentee membership roles only', () => {
  assert.equal(isRenteeMembership({ role: 'rentee' }), true);
  assert.equal(isRenteeMembership({ role: 'tenant' }), true);
  assert.equal(isRenteeMembership({ role: 'staff' }), false);
  assert.equal(isRenteeMembership({ role: 'admin' }), false);
});

test('canonical staff role persists an explicit permission bundle', () => {
  assert.deepEqual(normalizeMembershipAccess({ role: 'staff', permission_bundle: 'read_only' }), {
    role: 'staff',
    permission_bundle: 'read_only',
    portal_type: 'staff'
  });
});

test('legacy staff roles are normalized to staff plus their effective bundle', () => {
  assert.deepEqual(normalizeMembershipAccess({ role: 'manager' }), {
    role: 'staff',
    permission_bundle: 'property_operations',
    portal_type: 'staff'
  });

  assert.deepEqual(normalizeMembershipAccess({ role: 'finance_staff' }), {
    role: 'staff',
    permission_bundle: 'finance',
    portal_type: 'staff'
  });

  assert.deepEqual(normalizeMembershipAccess({ role: 'maintenance_staff' }), {
    role: 'staff',
    permission_bundle: 'maintenance',
    portal_type: 'staff'
  });
});

test('editing a legacy staff membership preserves its effective bundle when no new bundle is supplied', () => {
  const currentMembership = {
    role: 'manager',
    permission_bundle: null
  };

  assert.deepEqual(normalizeMembershipAccess({ role: 'staff' }, currentMembership), {
    role: 'staff',
    permission_bundle: 'property_operations',
    portal_type: 'staff'
  });
});

test('status-only updates do not rewrite an untouched legacy access record', () => {
  const currentMembership = {
    role: 'finance_staff',
    permission_bundle: null
  };

  assert.deepEqual(normalizeMembershipAccess({ status: 'inactive' }, currentMembership), {
    role: 'finance_staff',
    permission_bundle: null,
    portal_type: 'staff'
  });
});

test('rejects unknown roles and staff bundles', () => {
  assert.throws(
    () => normalizeMembershipAccess({ role: 'super-admin' }),
    (error) => error?.status === 400 && error?.code === 'TENANT_MEMBERSHIP_INVALID_ROLE'
  );

  assert.throws(
    () => normalizeMembershipAccess({ role: 'staff', permission_bundle: 'everything' }),
    (error) => error?.status === 400 && error?.code === 'TENANT_MEMBERSHIP_INVALID_PERMISSION_BUNDLE'
  );
});

test('attaching an existing global renter identity applies the submitted profile before membership projection', () => {
  assert.match(renteeRepositorySource, /const profileUpdates = buildProfileUpdates\(\{ \.\.\.payload, email \}\);/);
  assert.match(renteeRepositorySource, /user = await updateAppUser\(user\.id, profileUpdates\);/);
});

test('renter create service returns the created renter record instead of the create metadata envelope', () => {
  assert.match(renteeServiceSource, /const result = await requestMssqlApi\('\/api\/mssql\/rentees'/);
  assert.match(renteeServiceSource, /return result\?\.data \|\| result;/);
  assert.match(renteeFormSource, /const renterId = isEditMode \? id : saved\?\.id;/);
});

test('tenant onboarding no longer depends on the Supabase-shaped compatibility client', () => {
  assert.doesNotMatch(renteeFormSource, /platformClient/);
  assert.doesNotMatch(renteeFormSource, /appUserService/);
  assert.match(renteeFormSource, /createRentee/);
  assert.match(renteeFormSource, /sendRenteeInvitation/);
  assert.match(renteeFormSource, /Save & Invite/);
});

test('invitation card uses the mounted toast system and renders persistent feedback', () => {
  assert.match(inviteButtonSource, /from 'react-hot-toast'/);
  assert.doesNotMatch(inviteButtonSource, /from 'react-toastify'/);
  assert.match(inviteButtonSource, /setResultMessage\(successMessage\)/);
  assert.match(inviteButtonSource, /role="status"/);
  assert.match(inviteButtonSource, /Simulate Invitation/);
});

test('simulated invitations never create a token or call the email delivery endpoint', () => {
  const simulationBlock = invitationServiceSource.match(/if \(simulated\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.match(simulationBlock, /Invitation simulation completed without delivery/);
  assert.doesNotMatch(simulationBlock, /createSecureInvitation/);
  assert.doesNotMatch(simulationBlock, /sendDirectEmail/);
  assert.match(invitationServiceSource, /const inviteData = await createSecureInvitation\(userDetails\);/);
  assert.match(invitationServiceSource, /const emailResult = await sendDirectEmail\(\{/);
});

test('production database migrations are manual, ordered and checksum tracked', () => {
  assert.match(migrationWorkflowSource, /workflow_dispatch:/);
  assert.doesNotMatch(migrationWorkflowSource, /\n\s+push:/);
  assert.match(migrationWorkflowSource, /environment: Production/);
  assert.match(migrationWorkflowSource, /APPLY-PRODUCTION/);
  assert.match(migrationWorkflowSource, /MSSQL_ACCESS_TOKEN/);
  assert.match(migrationWorkflowSource, /firewall-rule create/);
  assert.match(migrationWorkflowSource, /if: always\(\).*AZURE_SQL_FIREWALL_RULE/);

  const migrationOrder = [
    '20260920_01_add_tenancy_billing_adjustments',
    '20260920_02_create_platform_admins',
    '20260920_03_backfill_legacy_app_user_memberships'
  ].map((id) => migrationRunnerSource.indexOf(`id: '${id}'`));

  assert.ok(migrationOrder.every((position) => position >= 0));
  assert.ok(migrationOrder[0] < migrationOrder[1] && migrationOrder[1] < migrationOrder[2]);
  assert.match(migrationRunnerSource, /createHash\('sha256'\)/);
  assert.match(migrationRunnerSource, /dbo\.schema_migrations/);
  assert.match(migrationRunnerSource, /previously applied with checksum/);
  assert.match(migrationRunnerSource, /await item\.migration\.verify\(pool\);/);
});
