import { runQuery } from '../src/api/mssql/query.js';

const candidates = await runQuery(`
  SELECT
    au.id AS app_user_id,
    au.tenant_id AS legacy_tenant_id,
    t.name AS legacy_tenant_name,
    au.role AS app_user_role,
    au.user_type AS app_user_type,
    au.status AS app_user_status,
    au.createdat AS app_user_createdat
  FROM dbo.app_users au
  INNER JOIN dbo.tenants t ON t.id = au.tenant_id
  WHERE au.tenant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.tenant_memberships tm
      WHERE tm.tenant_id = au.tenant_id
        AND tm.app_user_id = au.id
    )
  ORDER BY au.createdat ASC, au.id ASC;
`);

const output = [];
for (const row of candidates) {
  const memberships = await runQuery(`
    SELECT
      tenant_id,
      role,
      status,
      is_default,
      createdat
    FROM dbo.tenant_memberships
    WHERE app_user_id = @appUserId
    ORDER BY createdat ASC, tenant_id ASC;
  `, { appUserId: row.app_user_id });

  output.push({
    app_user_id: row.app_user_id,
    legacy_tenant_id: row.legacy_tenant_id,
    legacy_tenant_name: row.legacy_tenant_name,
    app_user_role: row.app_user_role,
    app_user_type: row.app_user_type,
    app_user_status: row.app_user_status,
    existing_membership_count: memberships.length,
    existing_default_count: memberships.filter((membership) => Boolean(membership.is_default)).length,
    existing_memberships: memberships.map((membership) => ({
      tenant_id: membership.tenant_id,
      role: membership.role,
      status: membership.status,
      is_default: Boolean(membership.is_default),
      createdat: membership.createdat
    }))
  });
}

console.log('LEGACY_MEMBERSHIP_PREFLIGHT_OK');
console.log(JSON.stringify({ candidate_count: output.length, candidates: output }, null, 2));

// Keep the diagnostic replica alive long enough for Azure console-log retrieval.
await new Promise((resolve) => setTimeout(resolve, 300000));
