import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMembershipAccess } from '../src/api/mssql/membershipAdminRepository.js';
import { isRenteeMembership, normalizeRenteeStatus } from '../src/api/mssql/renteeRepository.js';

const renteeRepositorySource = readFileSync(new URL('../src/api/mssql/renteeRepository.js', import.meta.url), 'utf8');
const renteeFormSource = readFileSync(new URL('../src/pages/RenteeForm.jsx', import.meta.url), 'utf8');
const renteeDetailsSource = readFileSync(new URL('../src/pages/RenteeDetails.jsx', import.meta.url), 'utf8');
const renteeCardSource = readFileSync(new URL('../src/components/rentees/RenteeCard.jsx', import.meta.url), 'utf8');
const renteeServiceSource = readFileSync(new URL('../src/services/renteeService.js', import.meta.url), 'utf8');
const inviteButtonSource = readFileSync(new URL('../src/components/common/InviteUserButton.jsx', import.meta.url), 'utf8');
const invitationServiceSource = readFileSync(new URL('../src/services/invitationService.js', import.meta.url), 'utf8');
const invitationLifecycleSource = readFileSync(new URL('../src/utils/invitationLifecycle.js', import.meta.url), 'utf8');
const migrationRunnerSource = readFileSync(new URL('../scripts/run-production-migrations.mjs', import.meta.url), 'utf8');
const renterAssignmentMigrationSource = readFileSync(
  new URL('../migrations/20260922_01_create_rentee_property_assignments.sql', import.meta.url),
  'utf8'
);
const migrationProbeSource = readFileSync(new URL('../scripts/probe-production-db.mjs', import.meta.url), 'utf8');
const migrationWorkflowSource = readFileSync(new URL('../.github/workflows/run-production-db-migrations.yml', import.meta.url), 'utf8');
const dashboardLayoutSource = readFileSync(new URL('../src/components/layouts/DashboardLayout.jsx', import.meta.url), 'utf8');

test('canonicalizes administrator and tenant membership roles', () => {
  assert.deepEqual(normalizeMembershipAccess({ role: 'admin' }), {
    role: 'admin', permission_bundle: null, portal_type: 'admin'
  });
  assert.deepEqual(normalizeMembershipAccess({ role: 'tenant' }), {
    role: 'rentee', permission_bundle: null, portal_type: 'tenant'
  });
  assert.deepEqual(normalizeMembershipAccess({ role: 'rentee' }), {
    role: 'rentee', permission_bundle: null, portal_type: 'tenant'
  });
});

test('renter directory accepts canonical tenant and legacy rentee membership roles only', () => {
  assert.equal(isRenteeMembership({ role: 'rentee' }), true);
  assert.equal(isRenteeMembership({ role: 'tenant' }), true);
  assert.equal(isRenteeMembership({ role: 'staff' }), false);
  assert.equal(isRenteeMembership({ role: 'admin' }), false);
});

test('renter relationship status is limited to active or inactive', () => {
  assert.equal(normalizeRenteeStatus('active'), 'active');
  assert.equal(normalizeRenteeStatus(' INACTIVE '), 'inactive');
  assert.throws(
    () => normalizeRenteeStatus('deleted'),
    (error) => error?.status === 400 && error?.code === 'RENTEE_INVALID_STATUS'
  );
});

test('canonical staff role persists an explicit permission bundle', () => {
  assert.deepEqual(normalizeMembershipAccess({ role: 'staff', permission_bundle: 'read_only' }), {
    role: 'staff', permission_bundle: 'read_only', portal_type: 'staff'
  });
});

test('legacy staff roles are normalized to staff plus their effective bundle', () => {
  assert.deepEqual(normalizeMembershipAccess({ role: 'manager' }), {
    role: 'staff', permission_bundle: 'property_operations', portal_type: 'staff'
  });
  assert.deepEqual(normalizeMembershipAccess({ role: 'finance_staff' }), {
    role: 'staff', permission_bundle: 'finance', portal_type: 'staff'
  });
  assert.deepEqual(normalizeMembershipAccess({ role: 'maintenance_staff' }), {
    role: 'staff', permission_bundle: 'maintenance', portal_type: 'staff'
  });
});

test('editing a legacy staff membership preserves its effective bundle when no new bundle is supplied', () => {
  const currentMembership = { role: 'manager', permission_bundle: null };
  assert.deepEqual(normalizeMembershipAccess({ role: 'staff' }, currentMembership), {
    role: 'staff', permission_bundle: 'property_operations', portal_type: 'staff'
  });
});

test('status-only updates do not rewrite an untouched legacy access record', () => {
  const currentMembership = { role: 'finance_staff', permission_bundle: null };
  assert.deepEqual(normalizeMembershipAccess({ status: 'inactive' }, currentMembership), {
    role: 'finance_staff', permission_bundle: null, portal_type: 'staff'
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

test('attaching an existing global renter identity applies only global profile fields before membership projection', () => {
  assert.match(renteeRepositorySource, /const profile = buildProfileUpdates\(\{ \.\.\.payload, email \}\);/);
  assert.match(renteeRepositorySource, /user = await updateAppUser\(user\.id, profile\);/);
  const profileFieldBlock = renteeRepositorySource.match(/const RENTEE_PROFILE_FIELDS = new Set\(\[[\s\S]*?\]\);/)?.[0] || '';
  assert.doesNotMatch(profileFieldBlock, /'status'/);
  assert.doesNotMatch(profileFieldBlock, /'associated_property_ids'/);
  assert.doesNotMatch(profileFieldBlock, /'associated_properties'/);
});

test('renter activation and deactivation update tenant membership instead of global app user status', () => {
  assert.match(renteeRepositorySource, /await updateTenantMembershipById\(tenantId, membership\.id/);
  assert.match(renteeRepositorySource, /status: nextStatus/);
  assert.match(renteeRepositorySource, /status: requestedStatus/);
  assert.match(renteeRepositorySource, /status: 'all'/);
});

test('renter property and unit assignments are durable and tenant scoped', () => {
  assert.match(renteeRepositorySource, /dbo\.rentee_property_assignments/);
  assert.match(renteeRepositorySource, /validateTenantAssignments/);
  assert.match(renteeRepositorySource, /tenant_id = @tenantId/);
  assert.match(renteeRepositorySource, /associated_properties/);
  assert.match(renteeFormSource, /associated_properties: formData\.structuredAssociations/);
  assert.doesNotMatch(renteeFormSource, /renteeAssociationCache|sessionStorage|storeRenteeAssociations|getRenteeAssociations/);
  assert.match(renterAssignmentMigrationSource, /CREATE TABLE dbo\.rentee_property_assignments/);
  assert.match(renterAssignmentMigrationSource, /FOREIGN KEY \(tenant_id\) REFERENCES dbo\.tenants\(id\)/);
  assert.match(renterAssignmentMigrationSource, /FOREIGN KEY \(app_user_id\) REFERENCES dbo\.app_users\(id\) ON DELETE CASCADE/);
  assert.match(renterAssignmentMigrationSource, /UX_rentee_property_assignments_scope/);
});

test('tenant details uses canonical renter projection and never deletes the global identity', () => {
  assert.match(renteeDetailsSource, /const renteeData = await getRentee\(id\);/);
  assert.match(renteeDetailsSource, /renteeData\.associated_properties \|\| \[\]/);
  assert.doesNotMatch(renteeDetailsSource, /getStructuredAssociations|deleteAppUser/);
  assert.doesNotMatch(renteeDetailsSource, /sessionStorage\s*\./);
  assert.match(renteeDetailsSource, /await updateRentee\(id, \{ status: 'inactive' \}\)/);
});

test('inactive renter cards support reactivation and suppress invitation actions', () => {
  assert.match(renteeCardSource, /updateRentee\(id, \{ status: nextStatus \}\)/);
  assert.match(renteeCardSource, /Deactivate Tenant/);
  assert.match(renteeCardSource, /Reactivate Tenant/);
  assert.match(renteeCardSource, /useInvitationStatus\(active \? id : null\)/);
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

test('platform administrator with tenant membership keeps tenant workspace access', () => {
  assert.match(dashboardLayoutSource, /const showTenantWorkspace = !platformAdminLoading && \(!isPlatformAdmin \|\| hasTenantAccess\);/);
  assert.match(dashboardLayoutSource, /if \(platformAdminLoading \|\| !isPlatformAdmin \|\| hasTenantAccess\) \{\s*return;/);
  assert.match(dashboardLayoutSource, /<TenantSwitcher \/>/);
});

test('invitation card uses the mounted toast system and canonical action labels', () => {
  assert.match(inviteButtonSource, /from 'react-hot-toast'/);
  assert.doesNotMatch(inviteButtonSource, /from 'react-toastify'/);
  assert.match(inviteButtonSource, /setResultMessage\(successMessage\)/);
  assert.match(inviteButtonSource, /role="status"/);
  assert.match(inviteButtonSource, /getInvitationActionLabel/);
  assert.match(invitationLifecycleSource, /Send Invitation/);
  assert.match(invitationLifecycleSource, /Resend Invitation/);
  assert.doesNotMatch(inviteButtonSource, /send-real-checkbox|Simulate Invitation/);
});

test('simulated invitations never create a token or call the email delivery endpoint', () => {
  const simulationBlock = invitationServiceSource.match(/if \(simulated\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.match(simulationBlock, /Invitation simulation completed without delivery/);
  assert.doesNotMatch(simulationBlock, /createSecureInvitation/);
  assert.doesNotMatch(simulationBlock, /sendInvitationEmail/);
  assert.match(invitationServiceSource, /const inviteData = await createSecureInvitation\(userDetails\);/);
  assert.match(invitationServiceSource, /const emailResult = await sendInvitationEmail\(\{/);
});

test('production database migrations auto-plan safely while apply stays isolated, ordered and checksum tracked', () => {
  assert.match(migrationWorkflowSource, /\n\s+push:/);
  assert.match(migrationWorkflowSource, /branches: \[main\]/);
  assert.match(migrationWorkflowSource, /workflow_dispatch:/);
  assert.match(migrationWorkflowSource, /MIGRATION_MODE: .*workflow_dispatch.*inputs\.mode.*'plan'/);
  assert.match(migrationWorkflowSource, /Automatic production migration runs are restricted to plan mode/);
  assert.match(migrationWorkflowSource, /APPLY-PRODUCTION/);
  assert.match(migrationWorkflowSource, /environment: Production/);
  assert.match(migrationWorkflowSource, /MSSQL_ACCESS_TOKEN/);
  assert.doesNotMatch(migrationWorkflowSource, /firewall-rule create/);
  assert.match(migrationWorkflowSource, /az containerapp exec/);
  assert.match(migrationWorkflowSource, /MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true/);
  assert.match(migrationWorkflowSource, /build-info\.json/);
  assert.match(migrationWorkflowSource, /No firewall rule will be opened/);
  assert.match(migrationWorkflowSource, /dedicated privileged migration executor inside the production network/);
  assert.match(migrationProbeSource, /message\.includes\('failed to connect to'\)/);
  assert.match(migrationProbeSource, /code === 'ETIMEOUT'/);
  assert.match(migrationRunnerSource, /type: 'azure-active-directory-default'/);
  assert.match(migrationRunnerSource, /Runtime managed identity is permitted for read-only migration planning only/);

  const migrationOrder = [
    '20260920_01_add_tenancy_billing_adjustments',
    '20260920_02_create_platform_admins',
    '20260920_03_backfill_legacy_app_user_memberships',
    '20260922_01_create_rentee_property_assignments'
  ].map((id) => migrationRunnerSource.indexOf(`id: '${id}'`));

  assert.ok(migrationOrder.every((position) => position >= 0));
  assert.ok(migrationOrder.every((position, index) => index === 0 || migrationOrder[index - 1] < position));
  assert.match(migrationRunnerSource, /createHash\('sha256'\)/);
  assert.match(migrationRunnerSource, /dbo\.schema_migrations/);
  assert.match(migrationRunnerSource, /previously applied with checksum/);
  assert.match(migrationRunnerSource, /await item\.migration\.verify\(pool\);/);
});
