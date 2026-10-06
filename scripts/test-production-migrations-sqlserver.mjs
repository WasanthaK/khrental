import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const SQL_SERVER_IMAGE = process.env.MSSQL_TEST_IMAGE || 'mcr.microsoft.com/mssql/server:2022-latest';
const MIGRATION_ID = '20260926_01_add_rentee_property_unit_associations';
const MIGRATION_FILE = `migrations/${MIGRATION_ID}.sql`;
const PROPERTY_UTILITY_MIGRATION_ID = '20261005_01_add_property_utility_configs';
const PROPERTY_UTILITY_MIGRATION_FILE = `migrations/${PROPERTY_UTILITY_MIGRATION_ID}.sql`;
const AUTH_STORE_MIGRATION_ID = '20261006_01_repair_auth_store_runtime_columns';
const AUTH_STORE_MIGRATION_FILE = `migrations/${AUTH_STORE_MIGRATION_ID}.sql`;
const ALREADY_PRODUCTION_APPLIED_MIGRATION_IDS = new Set([
  '20260920_01_add_tenancy_billing_adjustments',
  '20260920_02_create_platform_admins',
  '20260920_03_backfill_legacy_app_user_memberships'
]);
const INTEGRATION_TESTED_MIGRATION_IDS = new Set([
  MIGRATION_ID,
  PROPERTY_UTILITY_MIGRATION_ID,
  AUTH_STORE_MIGRATION_ID
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runDocker = (args) => execFileSync('docker', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trim();

const assertProductionMigrationCoverage = () => {
  const runnerSource = fs.readFileSync(path.resolve('scripts/run-production-migrations.mjs'), 'utf8');
  const ids = [...runnerSource.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.ok(ids.length > 0, 'No production migration IDs were discovered in run-production-migrations.mjs.');

  const uncovered = ids.filter((id) => (
    !ALREADY_PRODUCTION_APPLIED_MIGRATION_IDS.has(id)
    && !INTEGRATION_TESTED_MIGRATION_IDS.has(id)
  ));

  assert.deepEqual(
    uncovered,
    [],
    `Production migrations without real SQL Server execution proof: ${uncovered.join(', ')}`
  );
};

const connect = async ({ server, port, password, database = 'master', timeout = 2500 }) => {
  const pool = new sql.ConnectionPool({
    server,
    port,
    database,
    user: 'sa',
    password,
    connectionTimeout: timeout,
    requestTimeout: 30000,
    options: {
      encrypt: false,
      trustServerCertificate: true
    },
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 }
  });
  return pool.connect();
};

const waitForSqlServer = async (connection) => {
  let lastError;
  for (let attempt = 1; attempt <= 45; attempt += 1) {
    try {
      const pool = await connect(connection);
      await pool.close();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 45) await sleep(2000);
    }
  }
  throw new Error(`Disposable SQL Server did not become ready: ${lastError?.message || 'unknown error'}`);
};

const parsePublishedPort = (value) => {
  const line = String(value || '').split(/\r?\n/).find(Boolean) || '';
  const match = line.match(/:(\d+)$/);
  if (!match) throw new Error(`Unable to resolve disposable SQL Server port from: ${line}`);
  return Number(match[1]);
};

const queryJson = (value) => {
  assert.equal(typeof value, 'string');
  return JSON.parse(value);
};

const assertSchemaState = async (pool) => {
  const metadata = await pool.request().query(`
    SELECT
      CASE WHEN COL_LENGTH(N'dbo.app_users', N'associated_properties') IS NOT NULL THEN 1 ELSE 0 END AS column_exists,
      CASE WHEN EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.app_users')
          AND name = N'CK_app_users_associated_properties_json'
      ) THEN 1 ELSE 0 END AS constraint_exists,
      (
        SELECT COUNT_BIG(*)
        FROM dbo.app_users
        WHERE associated_properties IS NOT NULL
          AND ISJSON(associated_properties) <> 1
      ) AS invalid_json;
  `);
  const row = metadata.recordset[0];
  assert.equal(Number(row.column_exists), 1, 'associated_properties column must exist');
  assert.equal(Number(row.constraint_exists), 1, 'JSON check constraint must exist');
  assert.equal(Number(row.invalid_json), 0, 'associated_properties must contain only valid JSON or NULL');
};

const assertBackfilledAssociation = (entry, expectedPropertyId) => {
  assert.equal(entry.propertyId, expectedPropertyId);
  assert.ok(Object.hasOwn(entry, 'unitId'), 'backfilled association must explicitly contain unitId');
  assert.equal(entry.unitId, null, 'legacy property-only association must backfill unitId as null');
};

const main = async () => {
  assertProductionMigrationCoverage();

  const migrationSql = fs.readFileSync(path.resolve(MIGRATION_FILE), 'utf8');
  assert.match(migrationSql, /ALTER TABLE dbo\.app_users[\s\S]*ADD associated_properties NVARCHAR\(MAX\)/);
  assert.match(migrationSql, /FOR JSON PATH, INCLUDE_NULL_VALUES/);
  const propertyUtilityMigrationSql = fs.readFileSync(
    path.resolve(PROPERTY_UTILITY_MIGRATION_FILE),
    'utf8'
  );
  assert.match(propertyUtilityMigrationSql, /ADD propertyid UNIQUEIDENTIFIER NULL/);
  assert.match(propertyUtilityMigrationSql, /FK_utility_configs_property/);
  assert.match(propertyUtilityMigrationSql, /UX_utility_configs_property_rule/);
  const authStoreMigrationSql = fs.readFileSync(
    path.resolve(AUTH_STORE_MIGRATION_FILE),
    'utf8'
  );
  assert.match(authStoreMigrationSql, /ADD last_login_at DATETIME2 NULL/);
  assert.match(authStoreMigrationSql, /ADD revoked_at DATETIME2 NULL/);
  assert.match(authStoreMigrationSql, /IX_auth_sessions_active/);

  const containerName = `khrental-migration-proof-${process.pid}-${Date.now()}`;
  const password = `CiSql!${crypto.randomBytes(18).toString('base64url')}9aA`;
  const databaseName = `khrental_migration_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  let containerStarted = false;
  let publishedPort;
  let masterPool;
  let testPool;

  try {
    runDocker([
      'run', '-d', '--name', containerName,
      '-e', 'ACCEPT_EULA=Y',
      '-e', 'MSSQL_PID=Developer',
      '-e', `MSSQL_SA_PASSWORD=${password}`,
      '-p', '127.0.0.1::1433',
      SQL_SERVER_IMAGE
    ]);
    containerStarted = true;

    publishedPort = parsePublishedPort(runDocker(['port', containerName, '1433/tcp']));
    const connection = { server: '127.0.0.1', port: publishedPort, password };
    await waitForSqlServer(connection);

    masterPool = await connect({ ...connection, timeout: 10000 });
    await masterPool.request().query(`CREATE DATABASE [${databaseName}];`);
    await masterPool.close();
    masterPool = undefined;

    testPool = await connect({ ...connection, database: databaseName, timeout: 10000 });
    await testPool.request().batch(`
      CREATE TABLE dbo.app_users (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_app_users_migration_proof PRIMARY KEY,
        associated_property_ids NVARCHAR(MAX) NULL
      );
    `);

    const fixtures = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        legacy: '["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]'
      },
      { id: '22222222-2222-4222-8222-222222222222', legacy: '[]' },
      { id: '33333333-3333-4333-8333-333333333333', legacy: 'not-json' },
      { id: '44444444-4444-4444-8444-444444444444', legacy: null },
      {
        id: '55555555-5555-4555-8555-555555555555',
        legacy: '["cccccccc-cccc-4ccc-8ccc-cccccccccccc","not-a-uuid"]'
      }
    ];

    for (const fixture of fixtures) {
      const request = testPool.request();
      request.input('id', sql.UniqueIdentifier, fixture.id);
      request.input('legacy', sql.NVarChar(sql.MAX), fixture.legacy);
      await request.query(`
        INSERT INTO dbo.app_users (id, associated_property_ids)
        VALUES (@id, @legacy);
      `);
    }

    // Execute the exact SQL with the same batch API used by production.
    await testPool.request().batch(migrationSql);
    await assertSchemaState(testPool);

    const data = await testPool.request().query(`
      SELECT CONVERT(NVARCHAR(36), id) AS id, associated_properties
      FROM dbo.app_users
      ORDER BY id;
    `);
    const byId = new Map(data.recordset.map((row) => [row.id.toLowerCase(), queryJson(row.associated_properties)]));

    const first = byId.get(fixtures[0].id);
    assert.equal(first.length, 2);
    assertBackfilledAssociation(first[0], 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assertBackfilledAssociation(first[1], 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    assert.deepEqual(byId.get(fixtures[1].id), []);
    assert.deepEqual(byId.get(fixtures[2].id), []);
    assert.deepEqual(byId.get(fixtures[3].id), []);
    const mixed = byId.get(fixtures[4].id);
    assert.equal(mixed.length, 1);
    assertBackfilledAssociation(mixed[0], 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');

    // Execute the exact migration a second time to prove idempotency.
    await testPool.request().batch(migrationSql);
    await assertSchemaState(testPool);

    // Prove recovery from a partially migrated state: column exists, constraint is missing.
    await testPool.request().batch(`
      ALTER TABLE dbo.app_users DROP CONSTRAINT CK_app_users_associated_properties_json;
      UPDATE dbo.app_users
      SET associated_properties = NULL
      WHERE id = '44444444-4444-4444-8444-444444444444';
    `);
    await testPool.request().batch(migrationSql);
    await assertSchemaState(testPool);

    const repaired = await testPool.request().query(`
      SELECT associated_properties
      FROM dbo.app_users
      WHERE id = '44444444-4444-4444-8444-444444444444';
    `);
    assert.deepEqual(queryJson(repaired.recordset[0].associated_properties), []);

    // Prove the installed constraint is effective, not merely present in metadata.
    await assert.rejects(
      testPool.request().query(`
        UPDATE dbo.app_users
        SET associated_properties = N'not-json'
        WHERE id = '44444444-4444-4444-8444-444444444444';
      `)
    );

    console.log(`PASS: ${MIGRATION_ID} executed against SQL Server 2022, preserved canonical association shape, reran idempotently, and recovered partial state.`);

    await testPool.request().batch(`
      CREATE TABLE dbo.properties (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_properties_utility_migration_proof PRIMARY KEY
      );

      CREATE TABLE dbo.utility_configs (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_utility_configs_migration_proof PRIMARY KEY DEFAULT NEWID(),
        tenant_id UNIQUEIDENTIFIER NOT NULL,
        utilitytype NVARCHAR(100) NOT NULL,
        billingtype NVARCHAR(100) NULL,
        rate DECIMAL(18, 4) NULL,
        fixedamount DECIMAL(18, 2) NULL,
        createdat DATETIMEOFFSET NOT NULL DEFAULT SYSUTCDATETIME(),
        updatedat DATETIMEOFFSET NOT NULL DEFAULT SYSUTCDATETIME()
      );
    `);

    await testPool.request().batch(propertyUtilityMigrationSql);

    const utilityMetadata = await testPool.request().query(`
      SELECT
        CASE WHEN COL_LENGTH(N'dbo.utility_configs', N'propertyid') IS NOT NULL THEN 1 ELSE 0 END AS column_exists,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.foreign_keys
          WHERE parent_object_id = OBJECT_ID(N'dbo.utility_configs')
            AND name = N'FK_utility_configs_property'
        ) THEN 1 ELSE 0 END AS fk_exists,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID(N'dbo.utility_configs')
            AND name = N'IX_utility_configs_propertyid'
        ) THEN 1 ELSE 0 END AS property_index_exists,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID(N'dbo.utility_configs')
            AND name = N'UX_utility_configs_property_rule'
        ) THEN 1 ELSE 0 END AS unique_index_exists;
    `);
    const utilityState = utilityMetadata.recordset[0];
    assert.equal(Number(utilityState.column_exists), 1, 'utility_configs.propertyid must exist');
    assert.equal(Number(utilityState.fk_exists), 1, 'utility_configs property FK must exist');
    assert.equal(Number(utilityState.property_index_exists), 1, 'utility_configs property index must exist');
    assert.equal(Number(utilityState.unique_index_exists), 1, 'utility_configs property uniqueness rule must exist');

    const propertyId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    const tenantId = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    await testPool.request().query(`
      INSERT INTO dbo.properties (id) VALUES ('${propertyId}');
      INSERT INTO dbo.utility_configs (
        tenant_id, propertyid, utilitytype, billingtype, fixedamount
      ) VALUES (
        '${tenantId}', '${propertyId}', N'water', N'fixed', 800.00
      );
    `);

    await assert.rejects(
      testPool.request().query(`
        INSERT INTO dbo.utility_configs (
          tenant_id, propertyid, utilitytype, billingtype, fixedamount
        ) VALUES (
          '${tenantId}', '${propertyId}', N'water', N'fixed', 900.00
        );
      `)
    );

    await assert.rejects(
      testPool.request().query(`
        INSERT INTO dbo.utility_configs (
          tenant_id, propertyid, utilitytype, billingtype, fixedamount
        ) VALUES (
          '${tenantId}', 'cccccccc-3333-4333-8333-cccccccccccc', N'garbage', N'fixed', 500.00
        );
      `)
    );

    await testPool.request().batch(propertyUtilityMigrationSql);
    const afterRerun = await testPool.request().query(`
      SELECT COUNT_BIG(*) AS matching_rows
      FROM dbo.utility_configs
      WHERE tenant_id = '${tenantId}'
        AND propertyid = '${propertyId}'
        AND utilitytype = N'water'
        AND billingtype = N'fixed';
    `);
    assert.equal(Number(afterRerun.recordset[0].matching_rows), 1);

    console.log(`PASS: ${PROPERTY_UTILITY_MIGRATION_ID} executed against SQL Server 2022, enforced property scope and uniqueness, and reran idempotently.`);

    await testPool.request().batch(`
      CREATE TABLE dbo.auth_users (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_auth_users_runtime_migration_proof PRIMARY KEY DEFAULT NEWID(),
        auth_id UNIQUEIDENTIFIER NOT NULL,
        app_user_id UNIQUEIDENTIFIER NULL,
        email NVARCHAR(320) NOT NULL,
        password_hash NVARCHAR(256) NOT NULL,
        password_salt NVARCHAR(128) NULL,
        password_algorithm NVARCHAR(32) NULL,
        role NVARCHAR(64) NULL,
        metadata NVARCHAR(MAX) NULL,
        createdat DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );

      CREATE TABLE dbo.auth_sessions (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_auth_sessions_runtime_migration_proof PRIMARY KEY DEFAULT NEWID(),
        auth_user_id UNIQUEIDENTIFIER NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME2 NOT NULL,
        createdat DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
    `);

    await testPool.request().batch(authStoreMigrationSql);

    const authMetadata = await testPool.request().query(`
      SELECT
        CASE WHEN COL_LENGTH(N'dbo.auth_users', N'last_login_at') IS NOT NULL THEN 1 ELSE 0 END AS last_login_exists,
        CASE WHEN COL_LENGTH(N'dbo.auth_users', N'updatedat') IS NOT NULL THEN 1 ELSE 0 END AS updated_exists,
        CASE WHEN COL_LENGTH(N'dbo.auth_sessions', N'last_seen_at') IS NOT NULL THEN 1 ELSE 0 END AS last_seen_exists,
        CASE WHEN COL_LENGTH(N'dbo.auth_sessions', N'revoked_at') IS NOT NULL THEN 1 ELSE 0 END AS revoked_exists,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID(N'dbo.auth_sessions')
            AND name = N'IX_auth_sessions_active'
        ) THEN 1 ELSE 0 END AS active_index_exists;
    `);
    const authState = authMetadata.recordset[0];
    assert.equal(Number(authState.last_login_exists), 1, 'auth_users.last_login_at must exist');
    assert.equal(Number(authState.updated_exists), 1, 'auth_users.updatedat must exist');
    assert.equal(Number(authState.last_seen_exists), 1, 'auth_sessions.last_seen_at must exist');
    assert.equal(Number(authState.revoked_exists), 1, 'auth_sessions.revoked_at must exist');
    assert.equal(Number(authState.active_index_exists), 1, 'auth_sessions active index must exist');

    const authUserId = 'dddddddd-4444-4444-8444-dddddddddddd';
    await testPool.request().query(`
      INSERT INTO dbo.auth_users (
        id, auth_id, email, password_hash, createdat, updatedat, last_login_at
      ) VALUES (
        '${authUserId}',
        'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
        N'auth-proof@example.com',
        N'deadbeef',
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        SYSUTCDATETIME()
      );

      INSERT INTO dbo.auth_sessions (
        auth_user_id, token_hash, expires_at, revoked_at
      ) VALUES (
        '${authUserId}',
        REPLICATE('a', 64),
        DATEADD(day, 1, SYSUTCDATETIME()),
        SYSUTCDATETIME()
      );
    `);

    await testPool.request().batch(authStoreMigrationSql);

    const authRows = await testPool.request().query(`
      SELECT
        (SELECT COUNT_BIG(*) FROM dbo.auth_users WHERE id = '${authUserId}' AND last_login_at IS NOT NULL) AS login_rows,
        (SELECT COUNT_BIG(*) FROM dbo.auth_sessions WHERE auth_user_id = '${authUserId}' AND revoked_at IS NOT NULL) AS revoked_rows;
    `);
    assert.equal(Number(authRows.recordset[0].login_rows), 1);
    assert.equal(Number(authRows.recordset[0].revoked_rows), 1);

    console.log(`PASS: ${AUTH_STORE_MIGRATION_ID} repaired stale auth runtime columns/indexes and reran idempotently on SQL Server 2022.`);
  } finally {
    if (testPool) {
      try { await testPool.close(); } catch {}
    }

    if (containerStarted) {
      try {
        masterPool = await connect({
          server: '127.0.0.1',
          port: publishedPort,
          password,
          timeout: 5000
        });
        await masterPool.request().batch(`
          IF DB_ID(N'${databaseName}') IS NOT NULL
          BEGIN
            ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            DROP DATABASE [${databaseName}];
          END;
        `);
      } catch {
        // The disposable container is removed below even if database cleanup cannot run.
      } finally {
        if (masterPool) {
          try { await masterPool.close(); } catch {}
        }
        try { runDocker(['rm', '-f', containerName]); } catch {}
      }
    }
  }
};

main().catch((error) => {
  console.error('SQL Server migration integration proof failed:', error);
  process.exitCode = 1;
});
