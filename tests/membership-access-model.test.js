import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMembershipAccess } from '../src/api/mssql/membershipAdminRepository.js';
import { isRenteeMembership } from '../src/api/mssql/renteeRepository.js';

const renteeRepositorySource = readFileSync(new URL('../src/api/mssql/renteeRepository.js', import.meta.url), 'utf8');
const teamMemberRepositorySource = readFileSync(new URL('../src/api/mssql/teamMemberRepository.js', import.meta.url), 'utf8');
const renteeFormSource = readFileSync(new URL('../src/pages/RenteeForm.jsx', import.meta.url), 'utf8');
const renteeDetailsSource = readFileSync(new URL('../src/pages/RenteeDetails.jsx', import.meta.url), 'utf8');
const renteeListSource = readFileSync(new URL('../src/pages/RenteeList.jsx', import.meta.url), 'utf8');
const renteeServiceSource = readFileSync(new URL('../src/services/renteeService.js', import.meta.url), 'utf8');
const inviteButtonSource = readFileSync(new URL('../src/components/common/InviteUserButton.jsx', import.meta.url), 'utf8');
const invitationServiceSource = readFileSync(new URL('../src/services/invitationService.js', import.meta.url), 'utf8');
const invitationLifecycleSource = readFileSync(new URL('../src/utils/invitationLifecycle.js', import.meta.url), 'utf8');
const migrationRunnerSource = readFileSync(new URL('../scripts/run-production-migrations.mjs', import.meta.url), 'utf8');
const migrationPlanWrapperSource = readFileSync(new URL('../scripts/run-production-migration-plan.sh', import.meta.url), 'utf8');
const migrationApplyWrapperSource = readFileSync(new URL('../scripts/run-production-migration-apply.sh', import.meta.url), 'utf8');
const migrationProvisionWorkflowSource = readFileSync(new URL('../.github/workflows/provision-production-db-migration-executor.yml', import.meta.url), 'utf8');
const migrationProbeSource = readFileSync(new URL('../scripts/probe-production-db.mjs', import.meta.url), 'utf8');
const migrationWorkflowSource = readFileSync(new URL('../.github/workflows/run-production-db-migrations.yml', import.meta.url), 'utf8');
const renterAssociationMigrationSource = readFileSync(new URL('../migrations/20260926_01_add_rentee_property_unit_associations.sql', import.meta.url), 'utf8');
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

test('attaching an existing global renter identity applies the submitted profile before membership projection', () => {
  assert.match(renteeRepositorySource, /const profileUpdates = buildProfileUpdates\(\{ \.\.\.payload, email \}\);/);
  assert.match(renteeRepositorySource, /user = await updateAppUser\(user\.id, profileUpdates\);/);
});

test('same-organization renter role conflicts are rejected before shared profile mutation', () => {
  const createStart = renteeRepositorySource.indexOf('export const createOrAttachTenantRentee');
  const createSource = renteeRepositorySource.slice(createStart);
  const membershipLookup = createSource.indexOf('let membership = user ? await getTenantMembership');
  const conflict = createSource.indexOf("RENTEE_MEMBERSHIP_ROLE_CONFLICT");
  const profileWrite = createSource.indexOf('user = await updateAppUser(user.id, profileUpdates)');
  assert.ok(createStart >= 0 && membershipLookup >= 0 && conflict > membershipLookup && profileWrite > conflict);
});

test('same-organization team role conflicts are rejected before shared profile mutation', () => {
  const membershipLookup = teamMemberRepositorySource.indexOf('let membership = user ? await getTenantMembership');
  const conflict = teamMemberRepositorySource.indexOf("TEAM_MEMBERSHIP_ROLE_CONFLICT");
  const profileWrite = teamMemberRepositorySource.indexOf('user = await updateAppUser(user.id, updates)');
  assert.ok(membershipLookup >= 0 && conflict > membershipLookup && profileWrite > conflict);
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

test('production migration workflow fails closed on Container App plan errors', () => {
  assert.ok(migrationWorkflowSource.includes('--command /app/scripts/run-production-migration-plan.sh'));
  assert.ok(!migrationWorkflowSource.includes('--command sh'));
  assert.ok(migrationWorkflowSource.includes('exec_status=${PIPESTATUS[0]}'));
  assert.ok(migrationWorkflowSource.includes('Container App migration plan command failed with exit code'));
  assert.ok(migrationWorkflowSource.includes("syntax error|Production migration run failed:"));
  assert.ok(migrationWorkflowSource.includes('Plan completed without modifying the database.'));
  assert.ok(migrationWorkflowSource.includes('did not emit its required success marker'));
});

test('production migration provisions durable renter property-unit storage', () => {
  assert.match(renterAssociationMigrationSource, /ADD associated_properties NVARCHAR\(MAX\)/);
  assert.match(renterAssociationMigrationSource, /CK_app_users_associated_properties_json/);
  assert.match(renterAssociationMigrationSource, /EXEC sys\.sp_executesql/);
  assert.ok(
    renterAssociationMigrationSource.indexOf("ALTER TABLE dbo.app_users") <
      renterAssociationMigrationSource.indexOf("EXEC sys.sp_executesql"),
    "new-column references must compile only after ALTER TABLE has executed"
  );
  assert.match(migrationRunnerSource, /20260926_01_add_rentee_property_unit_associations/);
  assert.match(migrationWorkflowSource, /20260926_01_add_rentee_property_unit_associations/);
});

test('renter property and unit associations are durable server data', () => {
  assert.match(renteeRepositorySource, /'associated_properties'/);
  assert.match(renteeRepositorySource, /validateRenteeAssociations/);
  assert.match(renteeRepositorySource, /FROM properties/);
  assert.match(renteeRepositorySource, /FROM property_units/);
  assert.match(renteeFormSource, /associated_properties: formData\.structuredAssociations/);
  assert.match(renteeFormSource, /rentee\?\.associated_properties/);
  assert.doesNotMatch(renteeFormSource, /renteeAssociationCache/);
  assert.doesNotMatch(renteeFormSource, /storeRenteeAssociations/);
});

test('renter details read durable structured associations rather than browser session cache', () => {
  assert.match(renteeDetailsSource, /renteeData\?\.associated_properties/);
  assert.doesNotMatch(renteeDetailsSource, /getStructuredAssociations/);
});

test('renter deactivation is organization membership scoped and never deletes the global app user', () => {
  assert.match(renteeRepositorySource, /updateTenantRenteeMembershipStatus/);
  assert.match(renteeRepositorySource, /updateTenantMembershipById/);
  assert.doesNotMatch(renteeDetailsSource, /deleteAppUser/);
  assert.match(renteeDetailsSource, /setRenteeMembershipStatus\(id, 'inactive'\)/);
  assert.match(renteeDetailsSource, /global identity and history will be preserved/);
});

test('inactive renters remain discoverable for deliberate reactivation', () => {
  assert.match(renteeRepositorySource, /status = 'active'/);
  assert.match(renteeRepositorySource, /'active', 'inactive', 'all'/);
  assert.match(renteeListSource, /Inactive Tenants/);
  assert.match(renteeListSource, /Reactivate Tenant/);
  assert.match(renteeListSource, /setRenteeMembershipStatus\(id, 'active'\)/);
});

test('tenant details load the canonical organization-scoped renter projection', () => {
  assert.match(renteeDetailsSource, /getRentee\(id\)/);
  assert.doesNotMatch(renteeDetailsSource, /fetchAppUser\(id\)/);
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
  assert.ok(migrationWorkflowSource.includes('--command /app/scripts/run-production-migration-plan.sh'));
  assert.match(migrationPlanWrapperSource, /MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true/);
  assert.match(migrationPlanWrapperSource, /--mode=plan/);
  assert.doesNotMatch(migrationPlanWrapperSource, /--mode=apply/);
  assert.match(migrationWorkflowSource, /build-info\.json/);
  assert.match(migrationWorkflowSource, /Start dedicated production migration executor/);
  assert.match(migrationWorkflowSource, /khrental-db-migrator/);
  assert.match(migrationWorkflowSource, /MSSQL_MIGRATION_DEDICATED_EXECUTOR/);
  assert.match(migrationWorkflowSource, /az containerapp job start/);
  assert.doesNotMatch(migrationWorkflowSource, /az containerapp job create/);
  assert.match(migrationApplyWrapperSource, /MSSQL_MIGRATION_DEDICATED_EXECUTOR/);
  assert.match(migrationApplyWrapperSource, /MSSQL_MIGRATION_USE_MANAGED_IDENTITY=true/);
  assert.match(migrationApplyWrapperSource, /--mode=apply/);
  assert.match(migrationProvisionWorkflowSource, /workflow_dispatch:/);
  assert.match(migrationProvisionWorkflowSource, /PROVISION-MIGRATION-EXECUTOR/);
  assert.match(migrationProvisionWorkflowSource, /--trigger-type Manual/);
  assert.match(migrationProvisionWorkflowSource, /--mi-system-assigned/);
  assert.ok(migrationProvisionWorkflowSource.includes('run-production-migration-plan.sh'));
  assert.ok(!migrationProvisionWorkflowSource.includes('run-production-migration-apply.sh'));
  assert.match(migrationWorkflowSource, /stored_args=\$\(az containerapp job show/);
  assert.match(migrationWorkflowSource, /not resting in read-only plan mode/);
  assert.match(migrationWorkflowSource, /principal_id=\$\(az containerapp job identity show/);
  assert.ok(migrationWorkflowSource.includes('container_json=$(az containerapp job show'));
  assert.ok(migrationWorkflowSource.includes("container_name=$(jq -r '.name // empty'"));
  assert.ok(migrationWorkflowSource.includes("image=$(jq -r '.image // empty'"));
  assert.ok(migrationWorkflowSource.includes("cpu=$(jq -r '.resources.cpu // empty'"));
  assert.ok(migrationWorkflowSource.includes("memory=$(jq -r '.resources.memory // empty'"));
  assert.ok(migrationWorkflowSource.includes('select(.name == "MSSQL_SERVER")'));
  assert.ok(migrationWorkflowSource.includes('select(.name == "MSSQL_DATABASE")'));
  assert.ok(migrationWorkflowSource.includes('--container-name "$container_name"'));
  assert.ok(migrationWorkflowSource.includes('--args scripts/run-production-migration-apply.sh'));
  assert.ok(migrationWorkflowSource.includes('--image "$image"'));
  assert.ok(migrationWorkflowSource.includes('--cpu "$cpu"'));
  assert.ok(migrationWorkflowSource.includes('--memory "$memory"'));
  assert.ok(migrationWorkflowSource.includes('MSSQL_SERVER="$server"'));
  assert.ok(migrationWorkflowSource.includes('MSSQL_DATABASE="$database"'));
  assert.match(migrationWorkflowSource, /Wait for this commit to be the serving Container App revision for apply/);
  assert.ok(migrationWorkflowSource.includes('stored_image=$(jq -r'));
  assert.ok(migrationWorkflowSource.includes('az containerapp revision show'));
  assert.ok(migrationWorkflowSource.includes('--revision "$ready_revision"'));
  assert.ok(migrationWorkflowSource.includes('Migration executor apply image from serving revision $ready_revision: $image'));
  assert.ok(migrationWorkflowSource.includes('az containerapp job logs show'));
  assert.ok(migrationWorkflowSource.includes('--execution "$execution_name"'));
  assert.ok(migrationWorkflowSource.includes('show_execution_logs'));
  assert.doesNotMatch(migrationProvisionWorkflowSource, /firewall-rule create/);
  assert.match(migrationProbeSource, /message\.includes\('failed to connect to'\)/);
  assert.match(migrationProbeSource, /code === 'ETIMEOUT'/);
  assert.match(migrationRunnerSource, /type: 'azure-active-directory-default'/);
  assert.match(migrationRunnerSource, /Runtime managed identity is permitted for read-only migration planning only/);
  assert.match(migrationRunnerSource, /MSSQL_MIGRATION_DEDICATED_EXECUTOR/);

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
  assert.match(migrationRunnerSource, /SATISFIED_UNTRACKED/);
  assert.match(migrationRunnerSource, /const inspection = await item\.migration\.inspect\(pool\);/);
  assert.match(migrationRunnerSource, /inspectRenterAssociations/);
  assert.match(migrationRunnerSource, /COL_LENGTH\(N'dbo\.app_users', N'associated_properties'\)/);
  assert.match(migrationRunnerSource, /if \(!row\.table_exists \|\| !row\.column_exists \|\| !row\.constraint_exists\)/);
  assert.match(migrationRunnerSource, /Plan completed without modifying the database\./);
  assert.match(migrationRunnerSource, /const inspection = await item\.migration\.inspect\(pool\);/);
  assert.match(migrationRunnerSource, /if \(inspection\.satisfied\)/);
  assert.match(migrationRunnerSource, /Adopted satisfied untracked migration without replaying SQL/);
});