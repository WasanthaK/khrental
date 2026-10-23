/**
 * Approved read-only production diagnostic: no DML, individual identifiers,
 * access tokens, passwords, or account data returned. Run inside the serving
 * Azure Container App using its existing SQL connection configuration.
 */
import { runSingleQuery } from '../src/api/mssql/query.js';
import { isMssqlConfigured } from '../src/api/mssql/config.js';
import {
  IDENTITY_MEMBERSHIP_AUDIT_SQL,
  readIdentityMembershipAuditCounts
} from './identity-membership-audit-queries.mjs';

const main = async () => {
  if (!isMssqlConfigured()) throw new Error('Production SQL connection is not configured.');
  const schema = await runSingleQuery(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.app_users', 'U') IS NULL THEN 0 ELSE 1 END AS app_users,
      CASE WHEN OBJECT_ID('dbo.auth_users', 'U') IS NULL THEN 0 ELSE 1 END AS auth_users,
      CASE WHEN OBJECT_ID('dbo.tenants', 'U') IS NULL THEN 0 ELSE 1 END AS tenants,
      CASE WHEN OBJECT_ID('dbo.tenant_memberships', 'U') IS NULL THEN 0 ELSE 1 END AS tenant_memberships;
  `);
  for (const tableName of ['app_users', 'auth_users', 'tenants', 'tenant_memberships']) {
    if (Number(schema?.[tableName]) !== 1) {
      throw new Error('Required identity schema is not available; aggregate audit refused.');
    }
  }

  const counts = readIdentityMembershipAuditCounts(
    await runSingleQuery(IDENTITY_MEMBERSHIP_AUDIT_SQL)
  );
  console.log('IDENTITY_MEMBERSHIP_AUDIT_OK');
  console.log(JSON.stringify({ schema_version: 1, read_only: true, aggregate_only: true, counts }, null, 2));
};

main().catch(() => {
  // Do not expose SQL driver errors, credentials, connection strings or PII.
  console.error('IDENTITY_MEMBERSHIP_AUDIT_FAILED: read-only reconciliation was not completed.');
  process.exitCode = 1;
});
