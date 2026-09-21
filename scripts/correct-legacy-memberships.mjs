import { getMssqlPool, sql } from '../src/api/mssql/pool.js';

const EXPECTED_TENANT_ID = 'FEEC0269-D580-49C3-A982-5B3ECBBB1A09';
const EXPECTED_USER_IDS = [
  '58FB0FC2-6F7F-4F8B-B2E3-1176B9900AB3',
  '79211B8A-D990-406C-80F0-C310B355F1F2'
];

const normalize = (value) => String(value || '').trim().toLowerCase();
const normalizeId = (value) => String(value || '').trim().toUpperCase();

const pool = await getMssqlPool();
const transaction = new sql.Transaction(pool);
let committed = false;

try {
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  const preflightRequest = new sql.Request(transaction);
  const preflightResult = await preflightRequest.query(`
    SELECT
      au.id AS app_user_id,
      au.tenant_id AS legacy_tenant_id,
      au.role AS app_user_role,
      au.user_type AS app_user_type,
      au.status AS app_user_status,
      (
        SELECT COUNT_BIG(*)
        FROM dbo.tenant_memberships existing
        WHERE existing.app_user_id = au.id
      ) AS existing_membership_count
    FROM dbo.app_users au
    INNER JOIN dbo.tenants t ON t.id = au.tenant_id
    WHERE au.tenant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.tenant_memberships tm
        WHERE tm.tenant_id = au.tenant_id
          AND tm.app_user_id = au.id
      )
    ORDER BY au.id;
  `);

  const candidates = preflightResult.recordset || [];
  if (candidates.length !== 2) {
    throw new Error(`Guard failed: expected exactly 2 missing legacy memberships, found ${candidates.length}.`);
  }

  const actualIds = candidates.map((row) => normalizeId(row.app_user_id)).sort();
  const expectedIds = EXPECTED_USER_IDS.map(normalizeId).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error(`Guard failed: candidate IDs changed. Found ${actualIds.join(', ')}.`);
  }

  for (const row of candidates) {
    if (normalizeId(row.legacy_tenant_id) !== normalizeId(EXPECTED_TENANT_ID)) {
      throw new Error(`Guard failed: ${row.app_user_id} no longer points to the expected KH Rentals tenant.`);
    }
    if (normalize(row.app_user_role) !== 'rentee' || normalize(row.app_user_type) !== 'rentee') {
      throw new Error(`Guard failed: ${row.app_user_id} is no longer a rentee/rentee identity.`);
    }
    if (normalize(row.app_user_status) !== 'active') {
      throw new Error(`Guard failed: ${row.app_user_id} is no longer active.`);
    }
    if (Number(row.existing_membership_count || 0) !== 0) {
      throw new Error(`Guard failed: ${row.app_user_id} now has an existing membership.`);
    }
  }

  const insertRequest = new sql.Request(transaction);
  insertRequest.input('tenantId', sql.UniqueIdentifier, EXPECTED_TENANT_ID);
  insertRequest.input('userId1', sql.UniqueIdentifier, EXPECTED_USER_IDS[0]);
  insertRequest.input('userId2', sql.UniqueIdentifier, EXPECTED_USER_IDS[1]);

  const insertResult = await insertRequest.query(`
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
    OUTPUT
      inserted.id AS membership_id,
      inserted.tenant_id,
      inserted.app_user_id,
      inserted.role,
      inserted.status,
      inserted.is_default
    SELECT
      NEWID(),
      au.tenant_id,
      au.id,
      N'rentee',
      N'active',
      CAST(1 AS bit),
      SYSUTCDATETIME(),
      SYSUTCDATETIME()
    FROM dbo.app_users au
    WHERE au.id IN (@userId1, @userId2)
      AND au.tenant_id = @tenantId
      AND LOWER(COALESCE(au.role, N'')) = N'rentee'
      AND LOWER(COALESCE(au.user_type, N'')) = N'rentee'
      AND LOWER(COALESCE(au.status, N'')) = N'active'
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.tenant_memberships existing
        WHERE existing.app_user_id = au.id
      );
  `);

  const inserted = insertResult.recordset || [];
  if (inserted.length !== 2) {
    throw new Error(`Guard failed during insert: expected 2 inserted memberships, got ${inserted.length}.`);
  }

  const verifyRequest = new sql.Request(transaction);
  verifyRequest.input('tenantId', sql.UniqueIdentifier, EXPECTED_TENANT_ID);
  verifyRequest.input('userId1', sql.UniqueIdentifier, EXPECTED_USER_IDS[0]);
  verifyRequest.input('userId2', sql.UniqueIdentifier, EXPECTED_USER_IDS[1]);

  const verifyResult = await verifyRequest.query(`
    SELECT
      (
        SELECT COUNT_BIG(*)
        FROM dbo.app_users au
        INNER JOIN dbo.tenants t ON t.id = au.tenant_id
        WHERE au.tenant_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.tenant_memberships tm
            WHERE tm.tenant_id = au.tenant_id
              AND tm.app_user_id = au.id
          )
      ) AS remaining_missing_memberships,
      (
        SELECT COUNT_BIG(*)
        FROM dbo.tenant_memberships tm
        WHERE tm.tenant_id = @tenantId
          AND tm.app_user_id IN (@userId1, @userId2)
          AND tm.role = N'rentee'
          AND tm.status = N'active'
          AND tm.is_default = 1
      ) AS expected_memberships_present;
  `);

  const verification = verifyResult.recordset?.[0] || {};
  if (Number(verification.remaining_missing_memberships || 0) !== 0) {
    throw new Error(`Verification failed: ${verification.remaining_missing_memberships} legacy membership(s) would remain missing.`);
  }
  if (Number(verification.expected_memberships_present || 0) !== 2) {
    throw new Error(`Verification failed: expected 2 canonical memberships, found ${verification.expected_memberships_present}.`);
  }

  await transaction.commit();
  committed = true;

  const postCommitResult = await pool.request().query(`
    SELECT COUNT_BIG(*) AS remaining_missing_memberships
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

  const remaining = Number(postCommitResult.recordset?.[0]?.remaining_missing_memberships || 0);
  if (remaining !== 0) {
    throw new Error(`Post-commit verification failed: ${remaining} legacy membership(s) remain missing.`);
  }

  console.log('LEGACY_MEMBERSHIP_CORRECTION_OK');
  console.log(JSON.stringify({
    inserted_count: inserted.length,
    remaining_missing_memberships: remaining,
    inserted: inserted.map((row) => ({
      membership_id: row.membership_id,
      tenant_id: row.tenant_id,
      app_user_id: row.app_user_id,
      role: row.role,
      status: row.status,
      is_default: Boolean(row.is_default)
    }))
  }, null, 2));

  // Keep this zero-traffic correction replica alive long enough to retrieve logs.
  await new Promise((resolve) => setTimeout(resolve, 300000));
} catch (error) {
  if (!committed) {
    await transaction.rollback().catch(() => {});
  }
  console.error('LEGACY_MEMBERSHIP_CORRECTION_FAILED');
  console.error(error?.stack || error);
  process.exitCode = 1;
  await new Promise((resolve) => setTimeout(resolve, 60000));
}
