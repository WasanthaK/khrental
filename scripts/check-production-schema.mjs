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

  // B04: read-only presence and integrity inspection. This is NOT a DDL
  // migration, does not inspect customer records, and is NOT proof that the
  // migration ledger contains the two governed B04 IDs.
  const signup = await runSingleQuery(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.public_signup_challenges', N'U') IS NOT NULL
        THEN 1 ELSE 0 END AS challenge_table,
      (SELECT COUNT(*) FROM sys.columns WHERE object_id =
        OBJECT_ID(N'dbo.public_signup_challenges') AND name IN
          (N'id',N'email_normalized',N'display_name',N'token_hash',
           N'issued_at',N'sent_at',N'expires_at',N'consumed_at',
           N'revoked_at',N'send_count',N'verify_attempts')) AS challenge_columns,
      CASE WHEN EXISTS (SELECT 1 FROM sys.key_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.public_signup_challenges')
          AND name = N'UQ_public_signup_challenges_token_hash' AND type = 'UQ')
        THEN 1 ELSE 0 END AS challenge_unique,
      (SELECT COUNT(*) FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.public_signup_challenges')
          AND is_disabled = 0 AND is_not_trusted = 0
          AND name IN (N'CK_public_signup_challenges_expiry',
                       N'CK_public_signup_challenges_counts',
                       N'CK_public_signup_challenges_finished_once',
                       N'CK_public_signup_challenges_normalized_email')) AS challenge_checks,
      (SELECT COUNT(*) FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.public_signup_challenges')
          AND name IN (N'IX_public_signup_challenges_email_state',
                       N'IX_public_signup_challenges_expiry')) AS challenge_indexes,
      CASE WHEN OBJECT_ID(N'dbo.public_signup_rate_limits', N'U') IS NOT NULL
        THEN 1 ELSE 0 END AS throttle_table,
      (SELECT COUNT(*) FROM sys.columns WHERE object_id =
        OBJECT_ID(N'dbo.public_signup_rate_limits') AND name IN
          (N'bucket_hash',N'window_start',N'request_count',N'updated_at')) AS throttle_columns,
      CASE WHEN EXISTS (SELECT 1 FROM sys.key_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.public_signup_rate_limits')
          AND name = N'PK_public_signup_rate_limits' AND type = 'PK')
        THEN 1 ELSE 0 END AS throttle_pk,
      (SELECT COUNT(*) FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.public_signup_rate_limits')
          AND is_disabled = 0 AND is_not_trusted = 0
          AND name IN (N'CK_public_signup_rate_limits_count',
                       N'CK_public_signup_rate_limits_window')) AS throttle_checks,
      CASE WHEN EXISTS (SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.public_signup_rate_limits')
          AND name = N'IX_public_signup_rate_limits_updated')
        THEN 1 ELSE 0 END AS throttle_index,
      CASE WHEN COL_LENGTH(N'dbo.public_signup_rate_limits', N'bucket_hash') = 64
        THEN 1 ELSE 0 END AS throttle_hash_width;
  `);

  const challengesPresent = Boolean(asBoolean(signup?.challenge_table) &&
    Number(signup?.challenge_columns) === 11 &&
    asBoolean(signup?.challenge_unique) &&
    Number(signup?.challenge_checks) === 4 &&
    Number(signup?.challenge_indexes) === 2);
  const throttlePresent = Boolean(asBoolean(signup?.throttle_table) &&
    Number(signup?.throttle_columns) === 4 &&
    asBoolean(signup?.throttle_pk) &&
    Number(signup?.throttle_checks) === 2 &&
    asBoolean(signup?.throttle_index) &&
    asBoolean(signup?.throttle_hash_width));

  // Only metadata for the two exact B04 migration IDs is read. A ledger
  // marker alone is NOT checksum verification and never authorizes apply.
  const b04Ledger = asBoolean(schema?.schema_migrations)
    ? await runSingleQuery(`
      SELECT
        (SELECT COUNT(*) FROM dbo.schema_migrations
         WHERE migration_id = N'20261023_01_create_public_signup_challenges')
          AS challenge_ledger,
        (SELECT COUNT(*) FROM dbo.schema_migrations
         WHERE migration_id = N'20261024_01_create_public_signup_rate_limits')
          AS limiter_ledger;
    `)
    : null;
  const challengeLedgered = Number(b04Ledger?.challenge_ledger || 0) === 1;
  const limiterLedgered = Number(b04Ledger?.limiter_ledger || 0) === 1;
  const schemaState = (exists, valid, ledgered) => !exists
    ? 'ABSENT_OR_NOT_VISIBLE'
    : !valid ? 'PRESENT_BUT_INCOMPLETE'
      : !ledgered ? 'STRUCTURE_PRESENT_NOT_LEDGERED'
        : 'STRUCTURE_AND_LEDGER_PRESENT_CHECKSUM_UNVERIFIED';
  const challengeState = schemaState(
    asBoolean(signup?.challenge_table), challengesPresent, challengeLedgered
  );
  const limiterState = schemaState(
    asBoolean(signup?.throttle_table), throttlePresent, limiterLedgered
  );

  const output = {
    database: process.env.MSSQL_DATABASE || null,
    checks: {
      tenancy_billing_adjustments_table_exists: asBoolean(schema?.tenancy_billing_adjustments),
      platform_admins_table_exists: asBoolean(schema?.platform_admins),
      tenant_memberships_table_exists: asBoolean(schema?.tenant_memberships),
      schema_migrations_table_exists: asBoolean(schema?.schema_migrations),
      legacy_users_missing_tenant_membership: missingLegacyMemberships,
      b04_signup_challenge_schema_valid: challengesPresent,
      b04_signup_sql_limiter_schema_valid: throttlePresent,
      b04_signup_challenge_table_exists: asBoolean(signup?.challenge_table),
      b04_signup_sql_limiter_table_exists: asBoolean(signup?.throttle_table),
      b04_signup_challenge_ledgered: challengeLedgered,
      b04_signup_sql_limiter_ledgered: limiterLedgered,
      b04_signup_challenge_status: challengeState,
      b04_signup_sql_limiter_status: limiterState
    }
  };

  console.log('SCHEMA_DIAGNOSTIC_OK');
  console.log('B04_SIGNUP_SQL_SCHEMA ' + (challengesPresent && throttlePresent ? 'PRESENT_NOT_LEDGER_VERIFIED' : 'MISSING_OR_INCOMPLETE'));
  console.log('B04_SIGNUP_METADATA challenge=' + challengeState + ' limiter=' + limiterState);
  console.log(JSON.stringify(output, null, 2));
};

main().catch((error) => {
  console.error(`SCHEMA_DIAGNOSTIC_FAILED: ${error?.message || error}`);
  process.exitCode = 1;
});
