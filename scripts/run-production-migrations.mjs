import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sql from 'mssql';

const MIGRATIONS = [
  {
    id: '20260920_01_add_tenancy_billing_adjustments',
    file: 'migrations/20260920_01_add_tenancy_billing_adjustments.sql',
    verify: async (pool) => {
      const result = await pool.request().query(`
        SELECT
          CASE WHEN OBJECT_ID(N'dbo.tenancy_billing_adjustments', N'U') IS NOT NULL THEN 1 ELSE 0 END AS table_exists,
          CASE WHEN EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE object_id = OBJECT_ID(N'dbo.tenancy_billing_adjustments')
              AND name = N'IX_tenancy_billing_adjustments_pending'
          ) THEN 1 ELSE 0 END AS index_exists;
      `);
      const row = result.recordset?.[0] || {};
      if (!row.table_exists || !row.index_exists) {
        throw new Error('Billing-adjustments migration verification failed.');
      }
    }
  },
  {
    id: '20260920_02_create_platform_admins',
    file: 'migrations/20260920_02_create_platform_admins.sql',
    verify: async (pool) => {
      const result = await pool.request().query(`
        SELECT CASE WHEN OBJECT_ID(N'dbo.platform_admins', N'U') IS NOT NULL THEN 1 ELSE 0 END AS table_exists;
      `);
      if (!result.recordset?.[0]?.table_exists) {
        throw new Error('Platform-admin migration verification failed.');
      }
    }
  },
  {
    id: '20260920_03_backfill_legacy_app_user_memberships',
    file: 'migrations/20260920_03_backfill_legacy_app_user_memberships.sql',
    verify: async (pool) => {
      const result = await pool.request().query(`
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
      const missing = Number(result.recordset?.[0]?.missing_memberships || 0);
      if (missing !== 0) {
        throw new Error(`Membership backfill verification failed: ${missing} legacy users remain without memberships.`);
      }
    }
  }
];

const LEDGER_TABLE = 'dbo.schema_migrations';

const parseArgs = () => {
  const values = Object.fromEntries(
    process.argv.slice(2).map((argument) => {
      const [key, ...parts] = argument.replace(/^--/, '').split('=');
      return [key, parts.join('=')];
    })
  );

  const mode = values.mode || 'plan';
  const through = values.through || 'all';

  if (!['plan', 'apply'].includes(mode)) {
    throw new Error(`Unsupported migration mode: ${mode}`);
  }

  if (through !== 'all' && !MIGRATIONS.some((migration) => migration.id === through)) {
    throw new Error(`Unknown migration target: ${through}`);
  }

  return { mode, through };
};

const getSelectedMigrations = (through) => {
  if (through === 'all') return MIGRATIONS;
  const targetIndex = MIGRATIONS.findIndex((migration) => migration.id === through);
  return MIGRATIONS.slice(0, targetIndex + 1);
};

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
    connectionTimeout: 30000,
    requestTimeout: 180000,
    options: {
      encrypt: true,
      trustServerCertificate: false
    },
    pool: { max: 2, min: 0, idleTimeoutMillis: 30000 }
  };

  if (migrationUser || migrationPassword) {
    if (!migrationUser || !migrationPassword) {
      throw new Error('Both MSSQL_MIGRATION_USER and MSSQL_MIGRATION_PASSWORD are required when SQL migration credentials are used.');
    }
    return { ...base, user: migrationUser, password: migrationPassword };
  }

  if (!accessToken) {
    throw new Error('No privileged migration authentication is configured. Provide MSSQL_ACCESS_TOKEN or dedicated MSSQL_MIGRATION_USER/MSSQL_MIGRATION_PASSWORD credentials.');
  }

  return {
    ...base,
    authentication: {
      type: 'azure-active-directory-access-token',
      options: { token: accessToken }
    }
  };
};

const checksumFile = (filePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex');

const ledgerExists = async (pool) => {
  const result = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID(N'${LEDGER_TABLE}', N'U') IS NULL THEN 0 ELSE 1 END AS ledger_exists;
  `);
  return Boolean(result.recordset?.[0]?.ledger_exists);
};

const ensureLedger = async (pool) => {
  await pool.request().query(`
    IF OBJECT_ID(N'${LEDGER_TABLE}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${LEDGER_TABLE} (
        migration_id NVARCHAR(200) NOT NULL CONSTRAINT PK_schema_migrations PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_schema_migrations_applied_at DEFAULT SYSUTCDATETIME(),
        applied_by NVARCHAR(200) NULL,
        source_sha NVARCHAR(64) NULL
      );
    END;
  `);
};

const loadApplied = async (pool, hasLedger) => {
  if (!hasLedger) return new Map();
  const result = await pool.request().query(`
    SELECT migration_id, checksum, applied_at, applied_by, source_sha
    FROM ${LEDGER_TABLE}
    ORDER BY migration_id;
  `);
  return new Map((result.recordset || []).map((row) => [row.migration_id, row]));
};

const verifyMigrationChecksum = (migration, appliedRow, checksum) => {
  if (appliedRow && appliedRow.checksum !== checksum) {
    throw new Error(
      `Migration ${migration.id} was previously applied with checksum ${appliedRow.checksum}, but the repository now contains ${checksum}. Refusing to continue.`
    );
  }
};

const assertDdlPermission = async (pool) => {
  const result = await pool.request().query(`
    SELECT
      HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS can_create_table,
      HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER') AS can_alter_database;
  `);
  const row = result.recordset?.[0] || {};
  if (!row.can_create_table) {
    throw new Error('The migration identity does not have CREATE TABLE permission in the production database.');
  }
};

const recordMigration = async (pool, migration, checksum) => {
  const request = pool.request();
  request.input('migrationId', sql.NVarChar(200), migration.id);
  request.input('checksum', sql.Char(64), checksum);
  request.input('appliedBy', sql.NVarChar(200), process.env.GITHUB_ACTOR || null);
  request.input('sourceSha', sql.NVarChar(64), process.env.GITHUB_SHA || null);
  await request.query(`
    INSERT INTO ${LEDGER_TABLE} (migration_id, checksum, applied_by, source_sha)
    VALUES (@migrationId, @checksum, @appliedBy, @sourceSha);
  `);
};

const main = async () => {
  const { mode, through } = parseArgs();
  const selected = getSelectedMigrations(through);
  const pool = await new sql.ConnectionPool(createConnectionConfig()).connect();

  try {
    const hasLedger = await ledgerExists(pool);
    const applied = await loadApplied(pool, hasLedger);
    const planned = selected.map((migration) => {
      const filePath = path.resolve(process.cwd(), migration.file);
      if (!fs.existsSync(filePath)) throw new Error(`Migration file not found: ${migration.file}`);
      const checksum = checksumFile(filePath);
      const appliedRow = applied.get(migration.id) || null;
      verifyMigrationChecksum(migration, appliedRow, checksum);
      return { migration, filePath, checksum, appliedRow };
    });

    console.log(`Migration mode: ${mode}`);
    console.log(`Database: ${process.env.MSSQL_SERVER}/${process.env.MSSQL_DATABASE}`);
    console.log(`Migration ledger: ${hasLedger ? 'present' : 'not yet created'}`);

    for (const item of planned) {
      console.log(`${item.appliedRow ? 'APPLIED' : 'PENDING'}  ${item.migration.id}  ${item.checksum}`);
    }

    if (mode === 'plan') {
      console.log('Plan completed without modifying the database.');
      return;
    }

    await assertDdlPermission(pool);
    await ensureLedger(pool);

    for (const item of planned) {
      if (item.appliedRow) {
        console.log(`Skipping already applied migration: ${item.migration.id}`);
        continue;
      }

      console.log(`Applying migration: ${item.migration.id}`);
      const script = fs.readFileSync(item.filePath, 'utf8');
      await pool.request().batch(script);
      await item.migration.verify(pool);
      await recordMigration(pool, item.migration, item.checksum);
      console.log(`Applied and verified: ${item.migration.id}`);
    }

    console.log('Production migration run completed successfully.');
  } finally {
    await pool.close();
  }
};

main().catch((error) => {
  console.error('Production migration run failed:', error.message);
  process.exitCode = 1;
});
