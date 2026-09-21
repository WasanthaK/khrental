import sql from 'mssql';

const requiredEnv = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const createConnectionConfig = () => {
  const server = requiredEnv('MSSQL_SERVER');
  const database = requiredEnv('MSSQL_DATABASE');
  const migrationUser = String(process.env.MSSQL_MIGRATION_USER || '').trim();
  const migrationPassword = String(process.env.MSSQL_MIGRATION_PASSWORD || '').trim();
  const accessToken = String(process.env.MSSQL_ACCESS_TOKEN || '').trim();

  const base = {
    server,
    database,
    port: Number(process.env.MSSQL_PORT || 1433),
    connectionTimeout: 15000,
    requestTimeout: 30000,
    options: { encrypt: true, trustServerCertificate: false },
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 }
  };

  if (migrationUser || migrationPassword) {
    if (!migrationUser || !migrationPassword) {
      throw new Error('Both MSSQL_MIGRATION_USER and MSSQL_MIGRATION_PASSWORD are required when SQL migration credentials are used.');
    }
    return { ...base, user: migrationUser, password: migrationPassword };
  }

  if (!accessToken) throw new Error('No migration authentication is configured.');

  return {
    ...base,
    authentication: {
      type: 'azure-active-directory-access-token',
      options: { token: accessToken }
    }
  };
};

let pool;
try {
  pool = await new sql.ConnectionPool(createConnectionConfig()).connect();

  const candidatesResult = await pool.request().query(`
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

  const candidates = [];
  for (const row of candidatesResult.recordset || []) {
    const membershipResult = await pool.request()
      .input('appUserId', sql.UniqueIdentifier, row.app_user_id)
      .query(`
        SELECT
          tenant_id,
          role,
          status,
          is_default,
          createdat
        FROM dbo.tenant_memberships
        WHERE app_user_id = @appUserId
        ORDER BY createdat ASC, tenant_id ASC;
      `);

    const memberships = (membershipResult.recordset || []).map((membership) => ({
      tenant_id: membership.tenant_id,
      role: membership.role,
      status: membership.status,
      is_default: Boolean(membership.is_default),
      createdat: membership.createdat
    }));

    candidates.push({
      app_user_id: row.app_user_id,
      legacy_tenant_id: row.legacy_tenant_id,
      legacy_tenant_name: row.legacy_tenant_name,
      app_user_role: row.app_user_role,
      app_user_type: row.app_user_type,
      app_user_status: row.app_user_status,
      existing_membership_count: memberships.length,
      existing_default_count: memberships.filter((membership) => membership.is_default).length,
      existing_memberships: memberships
    });
  }

  console.log('LEGACY_MEMBERSHIP_PREFLIGHT_OK');
  console.log(JSON.stringify({ candidate_count: candidates.length, candidates }, null, 2));
} finally {
  if (pool) await pool.close().catch(() => {});
}
