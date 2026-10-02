import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const SQL_SERVER_IMAGE = process.env.MSSQL_TEST_IMAGE || 'mcr.microsoft.com/mssql/server:2022-latest';
const FRESH_SCHEMA_FILE = 'migrations/20260913_00_create_fresh_mssql_schema.sql';
const ASSOCIATION_MIGRATION_FILE = 'migrations/20260926_01_add_rentee_property_unit_associations.sql';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runDocker = (args) => execFileSync('docker', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trim();

const connect = async ({ server, port, password, database = 'master', timeout = 2500 }) => {
  const pool = new sql.ConnectionPool({
    server,
    port,
    database,
    user: 'sa',
    password,
    connectionTimeout: timeout,
    requestTimeout: 120000,
    options: {
      encrypt: false,
      trustServerCertificate: true
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 5000 }
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

const queryOne = async (pool, queryText, inputs = {}) => {
  const request = pool.request();
  for (const [name, value] of Object.entries(inputs)) request.input(name, value);
  const result = await request.query(queryText);
  return result.recordset?.[0] || null;
};

const insertProperty = async (pool, { tenantId, name }) => {
  const row = await queryOne(pool, `
    INSERT INTO dbo.properties (tenant_id, name, status)
    OUTPUT INSERTED.id
    VALUES (@tenantId, @name, N'available');
  `, { tenantId, name });
  return String(row.id).toLowerCase();
};

const insertUnit = async (pool, { tenantId, propertyId, unitNumber }) => {
  const row = await queryOne(pool, `
    INSERT INTO dbo.property_units (tenant_id, propertyid, unitnumber, status)
    OUTPUT INSERTED.id
    VALUES (@tenantId, @propertyId, @unitNumber, N'available');
  `, { tenantId, propertyId, unitNumber });
  return String(row.id).toLowerCase();
};

const assertAssociation = (actual, propertyId, unitId) => {
  assert.deepEqual(actual, [{ propertyId, unitId }]);
};

const main = async () => {
  const freshSchemaSql = fs.readFileSync(path.resolve(FRESH_SCHEMA_FILE), 'utf8');
  const associationMigrationSql = fs.readFileSync(path.resolve(ASSOCIATION_MIGRATION_FILE), 'utf8');

  const containerName = `khrental-rentee-proof-${process.pid}-${Date.now()}`;
  const password = `CiSql!${crypto.randomBytes(18).toString('base64url')}9aA`;
  const databaseName = `khrental_rentee_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  let containerStarted = false;
  let masterPool;
  let fixturePool;
  let closeMssqlPool;

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

    const publishedPort = parsePublishedPort(runDocker(['port', containerName, '1433/tcp']));
    const connection = { server: '127.0.0.1', port: publishedPort, password };
    await waitForSqlServer(connection);

    masterPool = await connect({ ...connection, timeout: 10000 });
    await masterPool.request().query(`CREATE DATABASE [${databaseName}];`);
    await masterPool.close();
    masterPool = undefined;

    fixturePool = await connect({ ...connection, database: databaseName, timeout: 10000 });
    await fixturePool.request().batch(freshSchemaSql);
    await fixturePool.request().batch(associationMigrationSql);

    const defaultTenant = await queryOne(
      fixturePool,
      `SELECT TOP 1 id FROM dbo.tenants WHERE slug = N'kh-rentals';`
    );
    assert.ok(defaultTenant?.id, 'fresh schema must create the KH Rentals tenant');
    const tenantId = String(defaultTenant.id).toLowerCase();

    const propertyA = await insertProperty(fixturePool, { tenantId, name: 'Acceptance Property A' });
    const propertyB = await insertProperty(fixturePool, { tenantId, name: 'Acceptance Property B' });
    const unitA = await insertUnit(fixturePool, { tenantId, propertyId: propertyA, unitNumber: 'A-1' });
    const unitB = await insertUnit(fixturePool, { tenantId, propertyId: propertyB, unitNumber: 'B-1' });

    const otherTenant = await queryOne(fixturePool, `
      INSERT INTO dbo.tenants (name, slug, status, [plan])
      OUTPUT INSERTED.id
      VALUES (N'Other Organization', N'other-organization', N'active', N'test');
    `);
    const otherTenantId = String(otherTenant.id).toLowerCase();
    const otherProperty = await insertProperty(fixturePool, {
      tenantId: otherTenantId,
      name: 'Other Organization Property'
    });

    process.env.MSSQL_SERVER = '127.0.0.1';
    process.env.MSSQL_PORT = String(publishedPort);
    process.env.MSSQL_DATABASE = databaseName;
    process.env.MSSQL_USER = 'sa';
    process.env.MSSQL_PASSWORD = password;
    process.env.MSSQL_AUTHENTICATION = 'sql-password';
    process.env.MSSQL_ENCRYPT = 'false';
    process.env.MSSQL_TRUST_SERVER_CERTIFICATE = 'true';

    const {
      createOrAttachTenantRentee,
      getTenantRenteeById,
      listTenantRentees,
      updateTenantRentee,
      updateTenantRenteeMembershipStatus
    } = await import('../src/api/mssql/renteeRepository.js');
    ({ closeMssqlPool } = await import('../src/api/mssql/pool.js'));

    const renterEmail = `phase1-renter-${Date.now()}@example.invalid`;
    const created = await createOrAttachTenantRentee(tenantId, {
      name: 'Phase 1 Renter',
      email: renterEmail,
      role: 'platform_admin',
      user_type: 'platform_admin',
      contact_details: { email: renterEmail, phone: '+10000000000' },
      associated_property_ids: [propertyA],
      associated_properties: [{ propertyId: propertyA, unitId: unitA }]
    });

    assert.equal(created.created, true);
    assert.equal(created.attached, false);
    assert.ok(created.data?.id);
    assert.equal(created.data.directory_role, 'rentee');
    assertAssociation(created.data.associated_properties, propertyA, unitA);

    const createdDb = await queryOne(fixturePool, `
      SELECT role, user_type, associated_properties
      FROM dbo.app_users
      WHERE id = @id;
    `, { id: created.data.id });
    assert.equal(String(createdDb.role).toLowerCase(), 'rentee', 'tenant workflow must not create platform-admin role');
    assert.equal(String(createdDb.user_type).toLowerCase(), 'rentee', 'tenant workflow must not create platform-admin user_type');
    assertAssociation(JSON.parse(createdDb.associated_properties), propertyA, unitA);

    const updated = await updateTenantRentee(tenantId, created.data.id, {
      name: 'Phase 1 Renter Edited',
      associated_property_ids: [propertyB],
      associated_properties: [{ propertyId: propertyB, unitId: unitB }]
    });
    assert.equal(updated.name, 'Phase 1 Renter Edited');
    assertAssociation(updated.associated_properties, propertyB, unitB);

    // Prove the edit survives a fresh database connection rather than an in-memory/browser cache.
    await closeMssqlPool();
    const reloaded = await getTenantRenteeById(tenantId, created.data.id);
    assert.equal(reloaded.name, 'Phase 1 Renter Edited');
    assertAssociation(reloaded.associated_properties, propertyB, unitB);

    // Add Tenant must not double as an edit operation for an existing renter in
    // the same organization. Reusing the email must fail before shared profile
    // fields or property associations are changed.
    await assert.rejects(
      createOrAttachTenantRentee(tenantId, {
        name: 'Should Never Overwrite Existing Renter',
        email: renterEmail,
        contact_details: { email: renterEmail, phone: '+19999999999' },
        associated_property_ids: [propertyA],
        associated_properties: [{ propertyId: propertyA, unitId: unitA }]
      }),
      (error) => error?.status === 409 && error?.code === 'RENTEE_ALREADY_EXISTS'
    );

    const afterDuplicateCreate = await getTenantRenteeById(tenantId, created.data.id);
    assert.equal(afterDuplicateCreate.name, 'Phase 1 Renter Edited');
    assert.equal(afterDuplicateCreate.contact_details?.phone, '+10000000000');
    assertAssociation(afterDuplicateCreate.associated_properties, propertyB, unitB);

    await assert.rejects(
      updateTenantRentee(tenantId, created.data.id, {
        associated_properties: [{ propertyId: propertyA, unitId: unitB }]
      }),
      (error) => error?.status === 400 && error?.code === 'RENTEE_UNIT_PROPERTY_MISMATCH'
    );
    const afterInvalidPair = await getTenantRenteeById(tenantId, created.data.id);
    assertAssociation(afterInvalidPair.associated_properties, propertyB, unitB);

    await assert.rejects(
      updateTenantRentee(tenantId, created.data.id, {
        associated_properties: [{ propertyId: otherProperty, unitId: null }]
      }),
      (error) => error?.status === 400 && error?.code === 'RENTEE_PROPERTY_INVALID'
    );
    const afterCrossTenantProperty = await getTenantRenteeById(tenantId, created.data.id);
    assertAssociation(afterCrossTenantProperty.associated_properties, propertyB, unitB);

    const deactivated = await updateTenantRenteeMembershipStatus(tenantId, created.data.id, 'inactive');
    assert.equal(deactivated.membership.status, 'inactive');
    assert.equal(deactivated.data.status, 'inactive');

    const activeAfterDeactivate = await listTenantRentees(tenantId, { status: 'active' });
    const inactiveAfterDeactivate = await listTenantRentees(tenantId, { status: 'inactive' });
    assert.equal(activeAfterDeactivate.some((renter) => renter.id === created.data.id), false);
    assert.equal(inactiveAfterDeactivate.some((renter) => renter.id === created.data.id), true);

    const globalIdentityAfterDeactivate = await queryOne(fixturePool, `
      SELECT status, active
      FROM dbo.app_users
      WHERE id = @id;
    `, { id: created.data.id });
    assert.equal(String(globalIdentityAfterDeactivate.status).toLowerCase(), 'active');
    assert.equal(Boolean(globalIdentityAfterDeactivate.active), true);

    const reactivated = await updateTenantRenteeMembershipStatus(tenantId, created.data.id, 'active');
    assert.equal(reactivated.membership.status, 'active');
    assert.equal(reactivated.data.status, 'active');
    const activeAfterReactivate = await listTenantRentees(tenantId, { status: 'active' });
    assert.equal(activeAfterReactivate.some((renter) => renter.id === created.data.id), true);

    const conflictUserId = crypto.randomUUID();
    const conflictEmail = `phase1-role-conflict-${Date.now()}@example.invalid`;
    const originalName = 'Existing Staff Profile';
    const insertConflictUser = fixturePool.request();
    insertConflictUser.input('id', sql.UniqueIdentifier, conflictUserId);
    insertConflictUser.input('tenantId', sql.UniqueIdentifier, tenantId);
    insertConflictUser.input('email', sql.NVarChar(320), conflictEmail);
    insertConflictUser.input('name', sql.NVarChar(255), originalName);
    await insertConflictUser.query(`
      INSERT INTO dbo.app_users (id, tenant_id, email, name, role, user_type, status, active)
      VALUES (@id, @tenantId, @email, @name, N'staff', N'staff', N'active', 1);
    `);

    const insertConflictMembership = fixturePool.request();
    insertConflictMembership.input('tenantId', sql.UniqueIdentifier, tenantId);
    insertConflictMembership.input('appUserId', sql.UniqueIdentifier, conflictUserId);
    await insertConflictMembership.query(`
      INSERT INTO dbo.tenant_memberships (tenant_id, app_user_id, role, status, is_default)
      VALUES (@tenantId, @appUserId, N'staff', N'active', 1);
    `);

    await assert.rejects(
      createOrAttachTenantRentee(tenantId, {
        name: 'Should Never Replace Staff Profile',
        email: conflictEmail,
        associated_property_ids: [propertyA],
        associated_properties: [{ propertyId: propertyA, unitId: unitA }]
      }),
      (error) => error?.status === 409 && error?.code === 'RENTEE_MEMBERSHIP_ROLE_CONFLICT'
    );

    const conflictState = await queryOne(fixturePool, `
      SELECT
        au.name,
        au.role,
        au.user_type,
        au.associated_properties,
        tm.role AS membership_role,
        (SELECT COUNT_BIG(*) FROM dbo.app_users WHERE email = @email) AS identity_count
      FROM dbo.app_users au
      INNER JOIN dbo.tenant_memberships tm
        ON tm.tenant_id = @tenantId
       AND tm.app_user_id = au.id
      WHERE au.id = @id;
    `, { id: conflictUserId, tenantId, email: conflictEmail });

    assert.equal(conflictState.name, originalName, 'role conflict must not mutate the shared profile');
    assert.equal(String(conflictState.role).toLowerCase(), 'staff');
    assert.equal(String(conflictState.user_type).toLowerCase(), 'staff');
    assert.equal(conflictState.associated_properties, null);
    assert.equal(String(conflictState.membership_role).toLowerCase(), 'staff');
    assert.equal(Number(conflictState.identity_count), 1, 'role conflict must not create a duplicate global identity');

    console.log('PASS: Phase 1 renter workflow persisted structured associations across create/edit/reconnect, rejected duplicate same-organization renter creates without profile mutation, rejected invalid associations without data loss, scoped deactivate/reactivate to membership, blocked platform-admin creation, and rejected same-organization role conflicts without profile mutation.');
  } finally {
    if (closeMssqlPool) {
      try { await closeMssqlPool(); } catch {}
    }
    if (fixturePool) {
      try { await fixturePool.close(); } catch {}
    }
    if (masterPool) {
      try { await masterPool.close(); } catch {}
    }
    if (containerStarted) {
      try { runDocker(['rm', '-f', containerName]); } catch {}
    }
  }
};

main().catch((error) => {
  console.error('Phase 1 renter SQL Server acceptance failed:', error);
  process.exitCode = 1;
});
