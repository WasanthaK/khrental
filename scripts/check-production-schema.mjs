import { runSingleQuery } from '../src/api/mssql/query.js';

const asBoolean = (value) => Number(value || 0) === 1;

const main = async () => {
  const schema = await runSingleQuery(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.tenancy_billing_adjustments', N'U') IS NOT NULL THEN 1 ELSE 0 END AS tenancy_billing_adjustments,
      CASE WHEN OBJECT_ID(N'dbo.platform_admins', N'U') IS NOT NULL THEN 1 ELSE 0 END AS platform_admins,
      CASE WHEN OBJECT_ID(N'dbo.tenant_memberships', N'U') IS NOT NULL THEN 1 ELSE 0 END AS tenant_memberships,
      CASE WHEN OBJECT_ID(N'dbo.schema_migrations', N'U') IS NOT NULL THEN 1 ELSE 0 END AS schema_migrations;
  `);

  let missingLegacyMemberships = null;

  if (asBoolean(schema?.tenant_memberships)) {
    const result = await runSingleQuery(`
      SELECT COUNT_BIG(*) AS missing_memberships
      FROM dbo.app_users au
      INNER JOIN dbo.tenants t ON t.id = au.tenant_id
      WHERE au.tenant_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.tenant_memberships tm
          WHERE tm.tenant_id = au.tenant_id
            AND tm.app_user_id = au.id
        );
    `);

    missingLegacyMemberships = Number(result?.missing_memberships || 0);
  }

  const output = {
    database: process.env.MSSQL_DATABASE || null,
    checks: {
      tenancy_billing_adjustments_table_exists: asBoolean(schema?.tenancy_billing_adjustments),
      platform_admins_table_exists: asBoolean(schema?.platform_admins),
      tenant_memberships_table_exists: asBoolean(schema?.tenant_memberships),
      schema_migrations_table_exists: asBoolean(schema?.schema_migrations),
      legacy_users_missing_tenant_membership: missingLegacyMemberships
    }
  };

  console.log('SCHEMA_DIAGNOSTIC_OK');
  console.log(JSON.stringify(output, null, 2));
};

main().catch((error) => {
  console.error(`SCHEMA_DIAGNOSTIC_FAILED: ${error?.message || error}`);
  process.exitCode = 1;
});
