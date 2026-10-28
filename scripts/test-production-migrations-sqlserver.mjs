import {PROPERTY_COUNTRIES} from '../src/utils/constants.js';
import {inspectPropertyViewings} from './inspect-property-viewings-schema.mjs';
import {inspectPropertyEnquiries} from './inspect-property-enquiries-schema.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import os from 'node:os';
import { createInvoiceDocumentPdfCandidate, normalizeInvoiceDocumentSnapshot } from '../src/api/platform/invoicePdfCandidate.js';
import { publishIssuedInvoiceArchiveCandidate } from '../src/api/platform/issuedInvoiceArchiveWriteCandidate.js';
import { createInvoiceArchiveSqlCandidateAdapters } from '../src/api/platform/invoiceArchiveSqlCandidateAdapters.js';
import { createInvoiceArchiveLocalProofStore } from '../src/api/platform/invoiceArchiveLocalProofStore.js';
import { prepareImmutableIssuedInvoiceAttachment } from '../src/api/platform/immutableInvoiceEmailAttachment.js';
import { loadVerifiedIssuedInvoiceDocument } from '../src/api/platform/issuedInvoiceDocumentRead.js';

const SQL_SERVER_IMAGE = process.env.MSSQL_TEST_IMAGE || 'mcr.microsoft.com/mssql/server:2022-latest';
const MIGRATION_ID = '20260926_01_add_rentee_property_unit_associations';
const MIGRATION_FILE = `migrations/${MIGRATION_ID}.sql`;
const PROPERTY_UTILITY_MIGRATION_ID = '20261005_01_add_property_utility_configs';
const PROPERTY_UTILITY_MIGRATION_FILE = `migrations/${PROPERTY_UTILITY_MIGRATION_ID}.sql`;
const AUTH_STORE_MIGRATION_ID = '20261006_01_repair_auth_store_runtime_columns';
const AUTH_STORE_MIGRATION_FILE = `migrations/${AUTH_STORE_MIGRATION_ID}.sql`;
const PAYMENT_REF_MIGRATION_ID = '20261018_01_invoice_payment_references';
const PAYMENT_REF_MIGRATION_FILE = `migrations/${PAYMENT_REF_MIGRATION_ID}.sql`;
const INVOICE_MASTER_MIGRATION_ID = '20261019_01_invoice_master_data';
const INVOICE_MASTER_MIGRATION_FILE = `migrations/${INVOICE_MASTER_MIGRATION_ID}.sql`;
const INVOICE_ARCHIVE_MIGRATION_ID = '20261020_01_immutable_invoice_pdf_archive';
const INVOICE_ARCHIVE_MIGRATION_FILE = `migrations/${INVOICE_ARCHIVE_MIGRATION_ID}.sql`;
const SIGNUP_CHALLENGE_MIGRATION_ID = '20261023_01_create_public_signup_challenges';
const SIGNUP_CHALLENGE_MIGRATION_FILE = `migrations/${SIGNUP_CHALLENGE_MIGRATION_ID}.sql`;
const SIGNUP_LIMIT_MIGRATION_ID = '20261024_01_create_public_signup_rate_limits';
const SIGNUP_LIMIT_MIGRATION_FILE = `migrations/${SIGNUP_LIMIT_MIGRATION_ID}.sql`;
const ALREADY_PRODUCTION_APPLIED_MIGRATION_IDS = new Set([
  '20260920_01_add_tenancy_billing_adjustments',
  '20260920_02_create_platform_admins',
  '20260920_03_backfill_legacy_app_user_memberships'
]);
const INTEGRATION_TESTED_MIGRATION_IDS = new Set([
  MIGRATION_ID,
  PROPERTY_UTILITY_MIGRATION_ID,
  AUTH_STORE_MIGRATION_ID,
  PAYMENT_REF_MIGRATION_ID,
  INVOICE_MASTER_MIGRATION_ID,
  INVOICE_ARCHIVE_MIGRATION_ID,
  SIGNUP_CHALLENGE_MIGRATION_ID,
  SIGNUP_LIMIT_MIGRATION_ID,
  '20261026_02_property_iso_country',
  '20261026_01_public_listing_preferences',
  '20261028_01_property_enquiries',
  '20261028_02_property_viewings'
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

  const paymentReferenceSql = fs.readFileSync(path.resolve(PAYMENT_REF_MIGRATION_FILE),'utf8');
  assert.match(paymentReferenceSql,/UX_invoice_payment_references_tenant_reference/);
  const invoiceMasterSql = fs.readFileSync(path.resolve(INVOICE_MASTER_MIGRATION_FILE), 'utf8');
  assert.match(invoiceMasterSql, /CK_tenant_settings_invoice_issuer_profile_json/);
  const invoiceArchiveSql = fs.readFileSync(path.resolve(INVOICE_ARCHIVE_MIGRATION_FILE),'utf8');
  assert.match(invoiceArchiveSql, /TR_invoice_pdf_archives_write_once/);
  const signupChallengeSql = fs.readFileSync(path.resolve(SIGNUP_CHALLENGE_MIGRATION_FILE), 'utf8');
  const signupLimitSql = fs.readFileSync(path.resolve(SIGNUP_LIMIT_MIGRATION_FILE), 'utf8');
  assert.match(signupChallengeSql, /UQ_public_signup_challenges_token_hash/);
  assert.match(signupLimitSql, /PK_public_signup_rate_limits/);
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
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_properties_utility_migration_proof PRIMARY KEY,
        tenant_id UNIQUEIDENTIFIER NOT NULL,
        bank_name NVARCHAR(255) NULL,
        bank_branch NVARCHAR(255) NULL,
        bank_account_number NVARCHAR(255) NULL
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
      INSERT INTO dbo.properties (id, tenant_id) VALUES ('${propertyId}', '${tenantId}');
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

    // B04 governed schema proof on the same disposable SQL Server 2022.
    // These SQL files are executed twice, without production credentials,
    // to prove prerequisite ordering, idempotency, checks and key uniqueness.
    await assert.rejects(testPool.request().batch(signupLimitSql),
      /Apply approved B04 S3a pending challenges schema first/);
    await testPool.request().batch(signupChallengeSql);
    await testPool.request().batch(signupChallengeSql);
    await testPool.request().batch(signupLimitSql);
    await testPool.request().batch(signupLimitSql);
    const signupSchema = await testPool.request().query(`
      SELECT
       (SELECT COUNT(*) FROM sys.columns
         WHERE object_id=OBJECT_ID(N'dbo.public_signup_challenges')) AS challenge_columns,
       (SELECT COUNT(*) FROM sys.check_constraints
         WHERE parent_object_id=OBJECT_ID(N'dbo.public_signup_challenges')
           AND is_disabled=0 AND is_not_trusted=0) AS challenge_checks,
       (SELECT COUNT(*) FROM sys.columns
         WHERE object_id=OBJECT_ID(N'dbo.public_signup_rate_limits')) AS limiter_columns,
       (SELECT COUNT(*) FROM sys.check_constraints
         WHERE parent_object_id=OBJECT_ID(N'dbo.public_signup_rate_limits')
           AND is_disabled=0 AND is_not_trusted=0) AS limiter_checks;
    `);
    assert.equal(signupSchema.recordset[0].challenge_columns,11);
    assert.equal(signupSchema.recordset[0].challenge_checks,4);
    assert.equal(signupSchema.recordset[0].limiter_columns,4);
    assert.equal(signupSchema.recordset[0].limiter_checks,2);
    await testPool.request().query(`
      INSERT INTO dbo.public_signup_rate_limits
        (bucket_hash,window_start,request_count,updated_at)
      VALUES (REPLICATE('a',64),SYSUTCDATETIME(),1,SYSUTCDATETIME());
    `);
    await assert.rejects(testPool.request().query(`
      INSERT INTO dbo.public_signup_rate_limits
        (bucket_hash,window_start,request_count,updated_at)
      VALUES (REPLICATE('a',64),SYSUTCDATETIME(),1,SYSUTCDATETIME());
    `), error=>[2601,2627].includes(Number(error?.number)));
    await assert.rejects(testPool.request().query(`
      INSERT INTO dbo.public_signup_rate_limits
        (bucket_hash,window_start,request_count,updated_at)
      VALUES (REPLICATE('b',64),SYSUTCDATETIME(),0,SYSUTCDATETIME());
    `), error=>Number(error?.number)===547);
    console.log('PASS: governed B04 signup challenge/SQL limiter migration order, double apply, constrained schema and unique bucket on disposable SQL Server 2022');

    // Execute the exact additive invoice reference migration on disposable
    // SQL Server, including second-run idempotency and a real unique index
    // violation. Do not exempt it from mandatory migration coverage.
    await testPool.request().batch(`
      CREATE TABLE dbo.tenants (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        slug NVARCHAR(100) NOT NULL
      );
      CREATE TABLE dbo.tenant_settings (
        tenant_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY
      );
      CREATE TABLE dbo.invoices (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        tenant_id UNIQUEIDENTIFIER NOT NULL
      );
      INSERT INTO dbo.tenants VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', N'kh-rentals'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', N'other-business');
      INSERT INTO dbo.tenant_settings VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      INSERT INTO dbo.invoices VALUES
        ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        ('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    `);
    await testPool.request().batch(paymentReferenceSql);
    await testPool.request().batch(paymentReferenceSql);
    const refState = await testPool.request().query(`
      SELECT
        (SELECT billing_timezone FROM dbo.tenant_settings WHERE tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS kh_timezone,
        (SELECT billing_timezone FROM dbo.tenant_settings WHERE tenant_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') AS other_timezone,
        (SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.invoice_payment_references')
          AND name=N'UX_invoice_payment_references_tenant_reference' AND is_unique=1) AS unique_index;
    `);
    assert.equal(refState.recordset[0].kh_timezone,'Asia/Colombo');
    assert.equal(refState.recordset[0].other_timezone,'UTC');
    assert.equal(refState.recordset[0].unique_index,1);
    await testPool.request().query(`
      INSERT INTO dbo.invoice_payment_references
        (invoice_id,tenant_id,payment_reference,reference_timezone,source)
      VALUES
        ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','26101801','Asia/Colombo','invoice_issue');
    `);
    await assert.rejects(testPool.request().query(`
      INSERT INTO dbo.invoice_payment_references
        (invoice_id,tenant_id,payment_reference,reference_timezone,source)
      VALUES
        ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','26101801','Asia/Colombo','invoice_issue');
    `), 'same tenant must not reuse reference');
    await testPool.request().query(`
      INSERT INTO dbo.invoice_payment_references
        (invoice_id,tenant_id,payment_reference,reference_timezone,source)
      VALUES
        ('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','26101801','UTC','invoice_issue');
    `);
    console.log(`PASS: ${PAYMENT_REF_MIGRATION_ID} SQL Server execution, idempotency, timezone setup, tenant-specific uniqueness`);
    // Verify additive issuer/beneficiary schema on real SQL Server, twice.
    // Existing payment-reference rows and bank settings must survive exactly.
    // Reuse dbo.properties from the utility migration fixture; creating it a
    // second time makes the five-value bank insert fail on SQL Server.
    await testPool.request().batch(`
      CREATE TABLE dbo.property_units (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        tenant_id UNIQUEIDENTIFIER NOT NULL,
        propertyid UNIQUEIDENTIFIER NOT NULL,
        bank_name NVARCHAR(255) NULL,
        bank_branch NVARCHAR(255) NULL,
        bank_account_number NVARCHAR(255) NULL
      );
      INSERT INTO dbo.properties
        (id, tenant_id, bank_name, bank_branch, bank_account_number) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Recorded Bank', 'Recorded Branch', '12345678');
    `);
    await testPool.request().batch(invoiceMasterSql);
    await testPool.request().batch(invoiceMasterSql);
    const invoiceMasterResult = await testPool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.invoice_payment_references) AS original_refs,
        (SELECT invoice_issuer_profile_json FROM dbo.tenant_settings
         WHERE tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS issuer_profile,
        (SELECT bank_beneficiary_name FROM dbo.properties
         WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc') AS beneficiary,
        (SELECT bank_name FROM dbo.properties
         WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc') AS original_bank,
        (SELECT COUNT(*) FROM sys.check_constraints
         WHERE parent_object_id=OBJECT_ID(N'dbo.tenant_settings')
         AND name=N'CK_tenant_settings_invoice_issuer_profile_json'
         AND is_disabled=0 AND is_not_trusted=0) AS json_guard;
    `);
    assert.equal(invoiceMasterResult.recordset[0].original_refs,2);
    assert.equal(invoiceMasterResult.recordset[0].issuer_profile,null);
    assert.equal(invoiceMasterResult.recordset[0].beneficiary,null);
    assert.equal(invoiceMasterResult.recordset[0].original_bank,'Recorded Bank');
    assert.equal(invoiceMasterResult.recordset[0].json_guard,1);
    const additionalMasterData = await testPool.request().query(`
      SELECT
        CASE WHEN COL_LENGTH(N'dbo.properties', N'invoice_party_overrides_json') IS NOT NULL THEN 1 ELSE 0 END AS party_column,
        CASE WHEN COL_LENGTH(N'dbo.properties', N'billing_contact_name') IS NOT NULL
          AND COL_LENGTH(N'dbo.properties', N'billing_contact_email') IS NOT NULL
          AND COL_LENGTH(N'dbo.properties', N'billing_contact_phone') IS NOT NULL THEN 1 ELSE 0 END AS contact_columns,
        CASE WHEN EXISTS (SELECT 1 FROM sys.check_constraints
          WHERE parent_object_id=OBJECT_ID(N'dbo.properties')
          AND name=N'CK_properties_invoice_party_overrides_json'
          AND is_disabled=0 AND is_not_trusted=0) THEN 1 ELSE 0 END AS parties_guard,
        CASE WHEN OBJECT_ID(N'dbo.invoice_master_data_audit', N'U') IS NOT NULL THEN 1 ELSE 0 END AS audit_table,
        (SELECT COUNT(*) FROM sys.indexes
         WHERE object_id=OBJECT_ID(N'dbo.invoice_master_data_audit')
           AND name=N'IX_invoice_master_data_audit_tenant_created') AS audit_index,
        (SELECT invoice_party_overrides_json FROM dbo.properties
         WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc') AS parties_before_admin,
        (SELECT billing_contact_name FROM dbo.properties
         WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc') AS contact_before_admin;
    `);
    const fields = additionalMasterData.recordset[0];
    assert.equal(fields.party_column,1);
    assert.equal(fields.contact_columns,1);
    assert.equal(fields.parties_guard,1);
    assert.equal(fields.audit_table,1);
    assert.equal(fields.audit_index,1);
    assert.equal(fields.parties_before_admin,null);
    assert.equal(fields.contact_before_admin,null);
    await assert.rejects(testPool.request().query(`
      UPDATE dbo.properties SET invoice_party_overrides_json='not json'
      WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc';
    `), 'invalid property party information must be rejected');
    await testPool.request().query(`
      INSERT INTO dbo.invoice_master_data_audit
        (tenant_id,actor_user_id,resource_kind,resource_id,changed_fields_json,current_hash)
      VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'property_billing','aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc',
        '["bank_beneficiary_name"]',REPLICATE('a',64));
    `);
    await assert.rejects(testPool.request().query(`
      INSERT INTO dbo.invoice_master_data_audit
        (tenant_id,actor_user_id,resource_kind,changed_fields_json,current_hash)
      VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'unrecognized','[]',REPLICATE('a',64));
    `), 'invalid audit resource kind must fail closed');

    await assert.rejects(testPool.request().query(`
      UPDATE dbo.tenant_settings SET invoice_issuer_profile_json='not json'
      WHERE tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    `), 'invalid invoice issuer JSON must be rejected');
    await testPool.request().query(`
      UPDATE dbo.tenant_settings SET invoice_issuer_profile_json=N'{"legalName":"Verified Ltd"}'
      WHERE tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      UPDATE dbo.properties SET bank_beneficiary_name=N'Verified beneficiary'
      WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc';
    `);
    console.log(`PASS: ${INVOICE_MASTER_MIGRATION_ID} SQL Server additive schema, JSON guard, idempotency and no legacy backfill`);

    // Write-once invoice archive ledger: executes real SQL Server DDL twice.
    await testPool.request().batch(invoiceArchiveSql);
    await testPool.request().batch(invoiceArchiveSql);
    const archiveMeta = await testPool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=
          OBJECT_ID(N'dbo.invoice_pdf_archives') AND is_disabled=0 AND is_not_trusted=0) AS guards,
        (SELECT COUNT(*) FROM sys.triggers WHERE parent_id=
          OBJECT_ID(N'dbo.invoice_pdf_archives') AND name=N'TR_invoice_pdf_archives_write_once'
          AND is_disabled=0) AS trigger_active,
        (SELECT COUNT(*) FROM sys.indexes WHERE object_id=
          OBJECT_ID(N'dbo.invoice_pdf_archives') AND name=N'UX_invoice_pdf_archives_object_path'
          AND is_unique=1) AS unique_path,
        (SELECT COUNT(*) FROM dbo.invoice_pdf_archives) AS archives_before;
    `);
    assert.equal(archiveMeta.recordset[0].guards,5);
    assert.equal(archiveMeta.recordset[0].trigger_active,1);
    assert.equal(archiveMeta.recordset[0].unique_path,1);
    assert.equal(archiveMeta.recordset[0].archives_before,0);

    const ownedInvoiceId='11111111-1111-4111-8111-111111111111';
    const tenantOwner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const foreignInvoiceId='33333333-3333-4333-8333-333333333333';
    const archivePath='tenants/'+tenantOwner+'/invoices/'+ownedInvoiceId+
      '/issued/sha256-'+('a'.repeat(64))+'.pdf';
    const snapshot=JSON.stringify({
      kind:'invoice_issued',version:1,tenantId:tenantOwner,invoiceId:ownedInvoiceId,
      issuer:{role:'organization',legalName:'Synthetic Business',postalAddress:'Example Street'},
      renter:{name:'Synthetic Renter'},property:{name:'Synthetic Property'},
      lines:[{description:'Rent',amountCents:200000}],totalCents:200000
    });
    const insertArchive=async ({
      tenantId=tenantOwner, invoiceId=ownedInvoiceId,
      objectPath=archivePath, pdfHash='a'.repeat(64),
      snapshotValue=snapshot
    }={}) => {
      const req=testPool.request();
      req.input('tenantId',sql.UniqueIdentifier,tenantId);
      req.input('invoiceId',sql.UniqueIdentifier,invoiceId);
      req.input('path',sql.NVarChar(512),objectPath);
      req.input('pdfHash',sql.Char(64),pdfHash);
      req.input('snapshot',sql.NVarChar(sql.MAX),snapshotValue);
      return req.query(`
        INSERT INTO dbo.invoice_pdf_archives
          (tenant_id,invoice_id,archive_version,pdf_sha256,snapshot_sha256,
           object_path,byte_length,issued_snapshot_json,archived_by)
        VALUES(@tenantId,@invoiceId,1,@pdfHash,REPLICATE('b',64),
          @path,1024,@snapshot,@tenantId);
      `);
    };
    await insertArchive();
    await assert.rejects(insertArchive(), 'second archive cannot replace the first');
    await assert.rejects(testPool.request().query(`
      UPDATE dbo.invoice_pdf_archives SET byte_length=2048 WHERE invoice_id='${ownedInvoiceId}';
    `),'issued archive cannot be altered');
    await assert.rejects(testPool.request().query(`
      DELETE FROM dbo.invoice_pdf_archives WHERE invoice_id='${ownedInvoiceId}';
    `),'issued archive cannot be deleted');
    await assert.rejects(insertArchive({
      tenantId:tenantOwner,invoiceId:foreignInvoiceId,
      objectPath:'tenants/'+tenantOwner+'/invoices/'+foreignInvoiceId+
        '/issued/sha256-'+('a'.repeat(64))+'.pdf'
    }), 'cross-tenant invoice archive must fail');
    await assert.rejects(insertArchive({
      invoiceId:'22222222-2222-4222-8222-222222222222',
      objectPath:'tenants/'+tenantOwner+'/invoices/22222222-2222-4222-8222-222222222222'+
        '/issued/sha256-'+('z'.repeat(64))+'.pdf',
      pdfHash:'z'.repeat(64)
    }), 'invalid SHA-256 must fail');
    const archived=await testPool.request().query(`
      SELECT tenant_id,invoice_id,object_path,byte_length FROM dbo.invoice_pdf_archives;
    `);
    assert.equal(archived.recordset.length,1);
    assert.equal(archived.recordset[0].object_path,archivePath);
    assert.equal(archived.recordset[0].byte_length,1024);
    const refsAfter=await testPool.request().query(`
      SELECT COUNT(*) AS original_refs FROM dbo.invoice_payment_references;
    `);
    assert.equal(refsAfter.recordset[0].original_refs,2);
    console.log(`PASS: ${INVOICE_ARCHIVE_MIGRATION_ID} SQL Server scope, write-once trigger, checks, and idempotency`);

    // Exercise the draft coordinator against actual MSSQL transactions and a
    // temporary filesystem with atomic, create-if-absent object publication.
    // No production invoice or live storage is accessed.
    const proofTenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const proofInvoice='22222222-2222-4222-8222-222222222222';
    const proofSnapshot={
      version:1,kind:'invoice_issued',
      tenantId:proofTenant,invoiceId:proofInvoice,
      paymentReference:'26102001',billingPeriod:'2026-10',
      issuedAt:'2026-10-20',dueAt:'2026-11-05',
      issuer:{role:'organization',legalName:'Synthetic Rent Management Ltd',
        postalAddress:'Synthetic Road, Colombo'},
      renter:{name:'Example Renter'},property:{name:'Example Property'},
      lines:[{description:'October rent',amountCents:1900000},
        {description:'Water',amountCents:100000}],
      totalCents:2000000,payment:null
    };
    const generated=await createInvoiceDocumentPdfCandidate(proofSnapshot);
    const issuedPdfBytes=Buffer.from(generated.content,'base64');
    const canonicalSnapshot=normalizeInvoiceDocumentSnapshot(proofSnapshot);
    assert.equal(generated.snapshotSha256,
      crypto.createHash('sha256').update(JSON.stringify(canonicalSnapshot)).digest('hex'));
    const issuedMetadata=JSON.stringify({
      documentSnapshot:canonicalSnapshot,
      documentSnapshotSha256:generated.snapshotSha256
    });
    await testPool.request().batch([
      'ALTER TABLE dbo.invoices ADD status NVARCHAR(24) NULL;',
      'CREATE TABLE dbo.billing_lifecycle_events (',
      'id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),',
      'tenant_id UNIQUEIDENTIFIER NOT NULL,',
      'invoice_id UNIQUEIDENTIFIER NOT NULL,',
      'event_type NVARCHAR(80) NOT NULL,',
      'metadata NVARCHAR(MAX) NULL,',
      'createdat DATETIMEOFFSET NOT NULL DEFAULT SYSUTCDATETIME()',
      ');'
    ].join(' '));
    await testPool.request()
      .input('invoiceId',sql.UniqueIdentifier,proofInvoice)
      .query("UPDATE dbo.invoices SET status='pending' WHERE id=@invoiceId");
    await testPool.request()
      .input('tenantId',sql.UniqueIdentifier,proofTenant)
      .input('invoiceId',sql.UniqueIdentifier,proofInvoice)
      .input('metadata',sql.NVarChar(sql.MAX),issuedMetadata)
      .query("INSERT INTO dbo.billing_lifecycle_events (tenant_id,invoice_id,event_type,metadata) "+
        "VALUES(@tenantId,@invoiceId,'invoice_issued',@metadata)");
    const sqlAdapters=createInvoiceArchiveSqlCandidateAdapters({pool:testPool,sql});
    const evidence=await sqlAdapters.issuanceLedger.loadIssued({
      tenantId:proofTenant,invoiceId:proofInvoice
    });
    assert.equal(evidence.snapshotSha256,generated.snapshotSha256);
    assert.equal(await sqlAdapters.issuanceLedger.loadIssued({
      tenantId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',invoiceId:proofInvoice
    }),null,'other tenants must not see issuance evidence');
    assert.equal(await sqlAdapters.issuanceLedger.loadIssued({
      tenantId:proofTenant,invoiceId:ownedInvoiceId
    }),null,'historical invoice without issuance snapshot cannot qualify');

    const proofDirectory=await fs.promises.mkdtemp(
      path.join(os.tmpdir(),'kh-invoice-sql-storage-proof-'));
    try {
      const storage=createInvoiceArchiveLocalProofStore({rootDirectory:proofDirectory});
      const publish=(overrides={})=>publishIssuedInvoiceArchiveCandidate({
        snapshot:proofSnapshot,pdfBytes:issuedPdfBytes,actorUserId:proofTenant,
        ...sqlAdapters,objectStorage:storage,...overrides
      });
      const first=await publish();
      assert.equal(first.state,'committed');
      assert.equal(first.archive.pdfSha256,generated.sha256);
      assert.equal(first.archive.snapshotSha256,generated.snapshotSha256);
      assert.deepEqual(
        (await storage.getObject('invoices',first.archive.path)).body,
        issuedPdfBytes);
      const replay=await publish();
      assert.equal(replay.state,'already_committed');
      assert.equal(replay.archive.path,first.archive.path);


      // Real SQL Server + temporary disk end-to-end proof for the same helper
      // that prepares both first customer email and staff-controlled resends.
      // The archive has already committed; a resend must read it with ZERO
      // rendering, ZERO new archive inserts and ZERO object overwrites.
      const historicalAttachment=await prepareImmutableIssuedInvoiceAttachment({
        tenantId:proofTenant,invoiceId:proofInvoice,actorUserId:proofTenant,
        adapters:sqlAdapters,store:storage,
        render:async()=>{throw Error('Historical resend must never render from current branding');}
      });
      assert.equal(historicalAttachment.type,'application/pdf');
      assert.equal(historicalAttachment.disposition,'attachment');
      assert.deepEqual(Buffer.from(historicalAttachment.content,'base64'),issuedPdfBytes);
      const download=await loadVerifiedIssuedInvoiceDocument({
        tenantId:proofTenant,invoiceId:proofInvoice,
        archiveLedger:sqlAdapters.archiveLedger,objectStorage:storage
      });
      assert.deepEqual(Buffer.from(download.content,'base64'),issuedPdfBytes);
      await assert.rejects(loadVerifiedIssuedInvoiceDocument({
        tenantId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',invoiceId:proofInvoice,
        archiveLedger:sqlAdapters.archiveLedger,objectStorage:storage
      }), e=>e.code==='ISSUED_INVOICE_PDF_NOT_ARCHIVED');
      const countAfterRetrieval=await testPool.request()
        .input('tenantId',sql.UniqueIdentifier,proofTenant)
        .input('invoiceId',sql.UniqueIdentifier,proofInvoice)
        .query('SELECT COUNT(*) AS count FROM dbo.invoice_pdf_archives '+
          'WHERE tenant_id=@tenantId AND invoice_id=@invoiceId');
      assert.equal(countAfterRetrieval.recordset[0].count,1,
        'download and resend never modify or duplicate archive rows');
      console.log('PASS: SQL-backed customer email attachment and download are identical to archived PDF bytes');

      // I02 crash-recovery acceptance on REAL SQL Server and disposable storage.
      // No customer data, production R2 or public files are involved.
      const stageSyntheticIssuedInvoice = async label => {
        const invoiceId=crypto.randomUUID();
        const candidate={...structuredClone(proofSnapshot),invoiceId};
        const pdf=await createInvoiceDocumentPdfCandidate(candidate);
        const bytes=Buffer.from(pdf.content,'base64');
        const canonical=normalizeInvoiceDocumentSnapshot(candidate);
        const metadata=JSON.stringify({
          documentSnapshot:canonical,
          documentSnapshotSha256:pdf.snapshotSha256
        });
        await testPool.request()
          .input('invoiceId',sql.UniqueIdentifier,invoiceId)
          .input('tenantId',sql.UniqueIdentifier,proofTenant)
          .query("INSERT INTO dbo.invoices (id,tenant_id,status) VALUES (@invoiceId,@tenantId,'pending')");
        await testPool.request()
          .input('invoiceId',sql.UniqueIdentifier,invoiceId)
          .input('tenantId',sql.UniqueIdentifier,proofTenant)
          .input('metadata',sql.NVarChar(sql.MAX),metadata)
          .query("INSERT INTO dbo.billing_lifecycle_events (tenant_id,invoice_id,event_type,metadata) "+
            "VALUES (@tenantId,@invoiceId,'invoice_issued',@metadata)");
        const descriptor=await import('../src/api/platform/issuedInvoiceArchiveCandidate.js')
          .then(m=>m.prepareInvoiceArchiveCandidate({snapshot:candidate,pdfBytes:bytes}));
        const count=async()=>Number((await testPool.request()
          .input('invoiceId',sql.UniqueIdentifier,invoiceId)
          .input('tenantId',sql.UniqueIdentifier,proofTenant)
          .query("SELECT COUNT(*) AS cnt FROM dbo.invoice_pdf_archives "+
            "WHERE tenant_id=@tenantId AND invoice_id=@invoiceId")).recordset[0].cnt);
        assert.equal(await count(),0,label+' starts without an archived SQL record');
        return {invoiceId,candidate,bytes,descriptor,count,publish:overrides=>
          publishIssuedInvoiceArchiveCandidate({
            snapshot:candidate,pdfBytes:bytes,actorUserId:proofTenant,
            ...sqlAdapters,objectStorage:storage,...overrides
          })};
      };

      // Crash immediately after conditional object creation. The real SQL
      // adapter must reconcile the existing verified bytes, insert one row,
      // reject cross-tenant lookup and preserve the original on replay.
      const orphan=await stageSyntheticIssuedInvoice('orphaned object');
      assert.equal(await storage.createIfAbsent('invoices',orphan.descriptor.path,
        orphan.bytes),'created');
      assert.equal(await orphan.count(),0);
      const recovered=await orphan.publish();
      assert.equal(recovered.state,'committed');
      assert.equal(await orphan.count(),1);
      assert.equal((await orphan.publish()).state,'already_committed');
      assert.equal(await orphan.count(),1);
      assert.deepEqual((await storage.getObject('invoices',orphan.descriptor.path)).body,
        orphan.bytes);
      assert.equal(await sqlAdapters.archiveLedger.loadCommitted({
        tenantId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        invoiceId:orphan.invoiceId
      }),null,'cross-tenant read must not locate recovered SQL archive');

      // A failed/ambiguous SQL response must not silently claim success,
      // delete the R2-equivalent object or manufacture an email success.
      // The next explicit, guarded retry can reconcile using real SQL.
      const interrupted=await stageSyntheticIssuedInvoice('ambiguous SQL result');
      await assert.rejects(interrupted.publish({archiveLedger:{
        ...sqlAdapters.archiveLedger,
        commitIfAbsent:async()=>{throw Error('SIMULATED_SQL_COMMIT_TIMEOUT');}
      }}),/SIMULATED_SQL_COMMIT_TIMEOUT/);
      assert.equal(await interrupted.count(),0);
      assert.deepEqual((await storage.getObject('invoices',interrupted.descriptor.path)).body,
        interrupted.bytes);
      assert.equal((await interrupted.publish()).state,'committed');
      assert.equal(await interrupted.count(),1);
      assert.equal((await interrupted.publish()).state,'already_committed');

      // Existing but corrupted object can NEVER be adopted into the SQL
      // ledger, even though create-if-absent correctly finds it.
      const damaged=await stageSyntheticIssuedInvoice('damaged orphan');
      const corrupted=Buffer.from(damaged.bytes);
      corrupted[corrupted.length-16]^=1;
      assert.equal(await storage.createIfAbsent('invoices',damaged.descriptor.path,
        corrupted),'created');
      await assert.rejects(damaged.publish(),
        e=>e.code==='INVOICE_ARCHIVE_INTEGRITY_FAILED');
      assert.equal(await damaged.count(),0);
      assert.deepEqual((await storage.getObject('invoices',damaged.descriptor.path)).body,
        corrupted);
      console.log('PASS: real SQL archive recovery after orphaned write, ambiguous commit, '+
        'idempotent retry, foreign tenant rejection, and corrupted object fail-closed');

      const revised=structuredClone(proofSnapshot);
      revised.issuer.legalName='Different Issuer After Invoice';
      await assert.rejects(publish({snapshot:revised}),
        e=>e.code==='INVOICE_ARCHIVE_ISSUANCE_MISMATCH');

      const exactRows=await testPool.request()
        .input('tenantId',sql.UniqueIdentifier,proofTenant)
        .input('invoiceId',sql.UniqueIdentifier,proofInvoice)
        .query('SELECT COUNT(*) AS cnt FROM dbo.invoice_pdf_archives '+
          'WHERE tenant_id=@tenantId AND invoice_id=@invoiceId');
      assert.equal(exactRows.recordset[0].cnt,1,
        'successful retry must keep one authoritative write-once archive row');

      // Even after a PDF is archived, a changed/legacy issuance event must
      // never be silently treated as new authoritative issue evidence.
      await testPool.request()
        .input('invoiceId',sql.UniqueIdentifier,proofInvoice)
        .query("UPDATE dbo.billing_lifecycle_events SET metadata=N'{}' "+
          "WHERE invoice_id=@invoiceId AND event_type='invoice_issued'");
      await assert.rejects(publish(),
        e=>e.code==='INVOICE_ARCHIVE_ISSUANCE_MISMATCH');
      const stillStored=await sqlAdapters.archiveLedger.loadCommitted({
        tenantId:proofTenant,invoiceId:proofInvoice
      });
      assert.equal(stillStored.pdfSha256,first.archive.pdfSha256);
      assert.deepEqual(
        (await storage.getObject('invoices',stillStored.path)).body,
        issuedPdfBytes);

      console.log('PASS: archive coordinator, real SQL Server serializable transaction, exact-byte local storage and replay');
    } finally {
      await fs.promises.rm(proofDirectory,{recursive:true,force:true});
    }


    const countrySql=fs.readFileSync(path.resolve('migrations/20261026_02_property_iso_country.sql'),'utf8');
    const beforeCountry=(await testPool.request().query('SELECT COUNT(*) AS n FROM dbo.properties')).recordset[0].n;
    await testPool.request().batch(countrySql);
    await testPool.request().batch(countrySql);
    const codes=(await testPool.request().query('SELECT code FROM dbo.iso_property_countries')).recordset.map(row=>row.code).sort();
    assert.deepEqual(codes,PROPERTY_COUNTRIES.map(country=>country.code).sort());
    const legacyCountries=(await testPool.request().query('SELECT COUNT(*) AS n FROM dbo.properties WHERE country_code IS NULL')).recordset[0].n;
    assert.equal(legacyCountries,beforeCountry,'migration never guesses a legacy country');
    const firstProperty=(await testPool.request().query('SELECT TOP(1) id FROM dbo.properties')).recordset[0].id;
    for(const country of ['LK','BN','AU']) {
      const result=await testPool.request().input('id',sql.UniqueIdentifier,firstProperty).input('country',sql.VarChar(2),country)
        .query('UPDATE dbo.properties SET country_code=@country OUTPUT INSERTED.country_code WHERE id=@id');
      assert.equal(result.recordset[0].country_code,country);
    }
    for(const country of ['XX','lk']) {
      await assert.rejects(testPool.request().input('id',sql.UniqueIdentifier,firstProperty).input('country',sql.VarChar(2),country)
        .query('UPDATE dbo.properties SET country_code=@country WHERE id=@id'));
    }
    // An old app revision can still save rows during deployment/rollback.
    await testPool.request().input('id',sql.UniqueIdentifier,firstProperty)
      .query('UPDATE dbo.properties SET country_code=NULL WHERE id=@id');
    assert.equal((await testPool.request().query('SELECT COUNT(*) AS n FROM dbo.properties')).recordset[0].n,beforeCountry);
    assert.equal((await testPool.request().query("SELECT COUNT(*) AS n FROM sys.tables WHERE name='public_listing_preferences'")).recordset[0].n,0);
    console.log('PASS: app-only ISO country migration double apply; 249 codes; legacy unknown; invalid code rejection; rollback compatibility; no public inventory schema');
    // Run listing schema after the exact deployed country schema, preserving the
    // explicit country assignment made by the prior app-only rollout.
    await testPool.request().input('id',sql.UniqueIdentifier,firstProperty)
      .query("UPDATE dbo.properties SET country_code='LK' WHERE id=@id");
    // Canonical properties.images is NVARCHAR(MAX); this utility fixture predates it.
    await testPool.request().query('ALTER TABLE dbo.properties ADD images NVARCHAR(MAX) NULL');
    const listingSql=fs.readFileSync(path.resolve('migrations/20261026_01_public_listing_preferences.sql'),'utf8');
    // The old utility fixture has an orphan tenant pointer. Prove migration
    // rejects it atomically, then complete that disposable fixture's parent.
    await assert.rejects(testPool.request().batch(listingSql),/Reconcile orphan property tenant references/);
    assert.equal((await testPool.request().query("SELECT OBJECT_ID('dbo.public_listing_preferences','U') AS id")).recordset[0].id,null);
    await testPool.request().query(`INSERT dbo.tenants(id,slug)
      SELECT DISTINCT p.tenant_id,N'legacy-fixture-'+CONVERT(NVARCHAR(36),p.tenant_id)
      FROM dbo.properties p WHERE NOT EXISTS(SELECT 1 FROM dbo.tenants t WHERE t.id=p.tenant_id)`);
    await testPool.request().batch(listingSql);
    await testPool.request().batch(listingSql);
    const saved=(await testPool.request().input('id',sql.UniqueIdentifier,firstProperty).query(`
      SELECT p.country_code AS property_country,pref.country_code AS public_market,pref.opted_out
      FROM dbo.properties p JOIN dbo.public_listing_preferences pref ON pref.property_id=p.id
        AND pref.tenant_id=p.tenant_id WHERE p.id=@id`)).recordset[0];
    assert.equal(saved.property_country,'LK');
    assert.equal(saved.public_market,'LK');
    assert.equal(saved.opted_out,false);
    assert.equal((await testPool.request().query('SELECT COUNT(*) AS n FROM dbo.public_listing_media')).recordset[0].n,0);
    assert.equal((await testPool.request().query('SELECT COUNT(*) AS n FROM dbo.public_listing_media_reviews')).recordset[0].n,0);
    console.log('PASS: governed public projection migration after deployed country schema; double apply; saved country preserved; zero public photos or approvals');
    const enquirySql=fs.readFileSync(path.resolve('migrations/20261028_01_property_enquiries.sql'),'utf8');
    await testPool.request().batch(enquirySql);
    await testPool.request().batch(enquirySql);
    const enquirySchema=await inspectPropertyEnquiries(testPool);
    assert.equal(enquirySchema.satisfied,true,enquirySchema.detail);
    assert.equal((await testPool.request().query('SELECT COUNT(*) AS n FROM dbo.property_enquiries')).recordset[0].n,0);
    assert.equal((await testPool.request().query('SELECT COUNT(*) AS n FROM dbo.property_enquiry_events')).recordset[0].n,0);
    console.log('PASS: governed enquiry migration double apply, strict metadata inspection, zero enquiry/contact/audit fixture writes');
    const viewingSql=fs.readFileSync(path.resolve('migrations/20261028_02_property_viewings.sql'),'utf8');
    await testPool.request().batch(viewingSql);
    await testPool.request().batch(viewingSql);
    const viewingSchema=await inspectPropertyViewings(testPool);
    assert.equal(viewingSchema.satisfied,true,viewingSchema.detail);
    console.log('PASS: governed viewing migration double apply, strict metadata inspection, zero viewing fixture writes');


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
