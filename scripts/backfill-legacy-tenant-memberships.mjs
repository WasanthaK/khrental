import { runQuery } from '../src/api/mssql/query.js';

const expectedCount = Number(process.env.EXPECTED_LEGACY_MEMBERSHIP_BACKFILL_COUNT || '2');

if (!Number.isInteger(expectedCount) || expectedCount < 0 || expectedCount > 10) {
  throw new Error(`Invalid EXPECTED_LEGACY_MEMBERSHIP_BACKFILL_COUNT: ${process.env.EXPECTED_LEGACY_MEMBERSHIP_BACKFILL_COUNT}`);
}

const missingQuery = `
  SELECT
    au.id AS app_user_id,
    au.tenant_id,
    LOWER(COALESCE(au.role, N'')) AS app_user_role,
    LOWER(COALESCE(au.user_type, N'')) AS app_user_user_type,
    LOWER(COALESCE(au.status, N'active')) AS app_user_status,
    t.status AS tenant_status
  FROM dbo.app_users au
  INNER JOIN dbo.tenants t
      ON t.id = au.tenant_id
  WHERE au.tenant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.tenant_memberships tm
      WHERE tm.tenant_id = au.tenant_id
        AND tm.app_user_id = au.id
    )
  ORDER BY au.createdat ASC, au.id ASC;
`;

const beforeRows = await runQuery(missingQuery);

console.log(JSON.stringify({
  phase: 'before',
  database: process.env.MSSQL_DATABASE || null,
  expected_missing_count: expectedCount,
  missing_count: beforeRows.length,
  missing_records: beforeRows.map((row) => ({
    app_user_id: row.app_user_id,
    tenant_id: row.tenant_id,
    app_user_role: row.app_user_role,
    app_user_user_type: row.app_user_user_type,
    app_user_status: row.app_user_status,
    tenant_status: row.tenant_status
  }))
}, null, 2));

if (beforeRows.length === 0) {
  console.log('LEGACY_MEMBERSHIP_BACKFILL_OK');
  console.log(JSON.stringify({ inserted_count: 0, remaining_missing_count: 0 }, null, 2));
  process.exit(0);
}

if (beforeRows.length !== expectedCount) {
  throw new Error(`Refusing to backfill: expected exactly ${expectedCount} missing legacy memberships, found ${beforeRows.length}.`);
}

const [result] = await runQuery(`
  SET XACT_ABORT ON;

  DECLARE @expectedCount INT = @expectedCountParam;
  DECLARE @beforeCount INT;
  DECLARE @insertedCount INT;
  DECLARE @afterCount INT;

  SELECT @beforeCount = COUNT(1)
  FROM dbo.app_users au
  INNER JOIN dbo.tenants t
      ON t.id = au.tenant_id
  WHERE au.tenant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.tenant_memberships tm
      WHERE tm.tenant_id = au.tenant_id
        AND tm.app_user_id = au.id
    );

  IF @beforeCount <> @expectedCount
  BEGIN
    THROW 51000, 'Legacy membership backfill count changed before insert; refusing to continue.', 1;
  END;

  BEGIN TRANSACTION;

  ;WITH MissingLegacyMemberships AS (
    SELECT
      au.id AS app_user_id,
      au.tenant_id,
      au.role,
      au.user_type,
      au.status,
      au.createdat
    FROM dbo.app_users au
    INNER JOIN dbo.tenants t
        ON t.id = au.tenant_id
    WHERE au.tenant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.tenant_memberships tm
        WHERE tm.tenant_id = au.tenant_id
          AND tm.app_user_id = au.id
      )
  )
  INSERT INTO dbo.tenant_memberships (
      id,
      tenant_id,
      app_user_id,
      role,
      status,
      is_default,
      createdat,
      updatedat
  )
  SELECT
      NEWID(),
      missing.tenant_id,
      missing.app_user_id,
      CASE
          WHEN LOWER(COALESCE(missing.role, N'')) = N'admin' THEN N'admin'
          WHEN LOWER(COALESCE(missing.role, N'')) IN (N'rentee', N'tenant')
            OR LOWER(COALESCE(missing.user_type, N'')) IN (N'rentee', N'tenant') THEN N'rentee'
          ELSE N'staff'
      END,
      CASE
          WHEN LOWER(COALESCE(missing.status, N'active')) = N'active' THEN N'active'
          ELSE N'inactive'
      END,
      CASE
          WHEN LOWER(COALESCE(missing.status, N'active')) = N'active' THEN 1
          ELSE 0
      END,
      COALESCE(missing.createdat, SYSUTCDATETIME()),
      SYSUTCDATETIME()
  FROM MissingLegacyMemberships missing;

  SET @insertedCount = @@ROWCOUNT;

  IF @insertedCount <> @expectedCount
  BEGIN
    ROLLBACK TRANSACTION;
    THROW 51001, 'Legacy membership backfill inserted an unexpected number of rows; rolled back.', 1;
  END;

  SELECT @afterCount = COUNT(1)
  FROM dbo.app_users au
  INNER JOIN dbo.tenants t
      ON t.id = au.tenant_id
  WHERE au.tenant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.tenant_memberships tm
      WHERE tm.tenant_id = au.tenant_id
        AND tm.app_user_id = au.id
    );

  IF @afterCount <> 0
  BEGIN
    ROLLBACK TRANSACTION;
    THROW 51002, 'Legacy membership backfill did not clear all missing rows; rolled back.', 1;
  END;

  COMMIT TRANSACTION;

  SELECT
    @insertedCount AS inserted_count,
    @afterCount AS remaining_missing_count;
`, { expectedCountParam: expectedCount });

console.log('LEGACY_MEMBERSHIP_BACKFILL_OK');
console.log(JSON.stringify(result || {}, null, 2));
