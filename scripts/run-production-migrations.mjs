import {inspectRentalOffers} from './inspect-rental-offers-schema.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sql from 'mssql';
import {inspectPropertyApplications} from './inspect-property-applications-schema.mjs';
import {inspectPropertyViewings} from './inspect-property-viewings-schema.mjs';
import {inspectPropertyEnquiries} from './inspect-property-enquiries-schema.mjs';

const inspectBillingAdjustments = async (pool) => {
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
  return {
    satisfied: Boolean(row.table_exists && row.index_exists),
    detail: `table=${row.table_exists ? 'present' : 'missing'}, index=${row.index_exists ? 'present' : 'missing'}`
  };
};

const inspectPlatformAdmins = async (pool) => {
  const result = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.platform_admins', N'U') IS NOT NULL THEN 1 ELSE 0 END AS table_exists;
  `);
  const tableExists = Boolean(result.recordset?.[0]?.table_exists);
  return {
    satisfied: tableExists,
    detail: `table=${tableExists ? 'present' : 'missing'}`
  };
};

const inspectMembershipBackfill = async (pool) => {
  const result = await pool.request().query(`
    IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
       OR OBJECT_ID(N'dbo.tenants', N'U') IS NULL
       OR OBJECT_ID(N'dbo.tenant_memberships', N'U') IS NULL
    BEGIN
      SELECT CAST(0 AS BIT) AS prerequisites_present, CAST(NULL AS BIGINT) AS missing_memberships;
    END
    ELSE
    BEGIN
      SELECT
        CAST(1 AS BIT) AS prerequisites_present,
        COUNT_BIG(*) AS missing_memberships
      FROM dbo.app_users au
      INNER JOIN dbo.tenants t ON t.id = au.tenant_id
      WHERE au.tenant_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.tenant_memberships tm
          WHERE tm.tenant_id = au.tenant_id
            AND tm.app_user_id = au.id
        );
    END;
  `);
  const row = result.recordset?.[0] || {};
  const prerequisitesPresent = Boolean(row.prerequisites_present);
  const missing = row.missing_memberships == null ? null : Number(row.missing_memberships);
  return {
    satisfied: prerequisitesPresent && missing === 0,
    detail: prerequisitesPresent ? `missing_memberships=${missing}` : 'prerequisite tables missing'
  };
};

const inspectAuthStoreRuntimeColumns = async (pool) => {
  const result = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.auth_users', N'U') IS NOT NULL THEN 1 ELSE 0 END AS auth_users_exists,
      CASE WHEN OBJECT_ID(N'dbo.auth_sessions', N'U') IS NOT NULL THEN 1 ELSE 0 END AS auth_sessions_exists,
      CASE WHEN COL_LENGTH(N'dbo.auth_users', N'last_login_at') IS NOT NULL THEN 1 ELSE 0 END AS last_login_exists,
      CASE WHEN COL_LENGTH(N'dbo.auth_users', N'updatedat') IS NOT NULL THEN 1 ELSE 0 END AS auth_updated_exists,
      CASE WHEN COL_LENGTH(N'dbo.auth_sessions', N'last_seen_at') IS NOT NULL THEN 1 ELSE 0 END AS last_seen_exists,
      CASE WHEN COL_LENGTH(N'dbo.auth_sessions', N'revoked_at') IS NOT NULL THEN 1 ELSE 0 END AS revoked_exists,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.auth_sessions')
          AND name = N'IX_auth_sessions_active'
      ) THEN 1 ELSE 0 END AS active_index_exists;
  `);
  const row = result.recordset?.[0] || {};
  return {
    satisfied: Boolean(
      row.auth_users_exists
      && row.auth_sessions_exists
      && row.last_login_exists
      && row.auth_updated_exists
      && row.last_seen_exists
      && row.revoked_exists
      && row.active_index_exists
    ),
    detail: `auth_users=${row.auth_users_exists ? 'present' : 'missing'}, auth_sessions=${row.auth_sessions_exists ? 'present' : 'missing'}, last_login_at=${row.last_login_exists ? 'present' : 'missing'}, updatedat=${row.auth_updated_exists ? 'present' : 'missing'}, last_seen_at=${row.last_seen_exists ? 'present' : 'missing'}, revoked_at=${row.revoked_exists ? 'present' : 'missing'}, active_index=${row.active_index_exists ? 'present' : 'missing'}`
  };
};

const inspectPropertyUtilityConfigs = async (pool) => {
  const result = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.utility_configs', N'U') IS NOT NULL THEN 1 ELSE 0 END AS table_exists,
      CASE WHEN COL_LENGTH(N'dbo.utility_configs', N'propertyid') IS NOT NULL THEN 1 ELSE 0 END AS column_exists,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.utility_configs')
          AND name = N'FK_utility_configs_property'
      ) THEN 1 ELSE 0 END AS fk_exists,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.utility_configs')
          AND name = N'UX_utility_configs_property_rule'
      ) THEN 1 ELSE 0 END AS unique_index_exists;
  `);
  const row = result.recordset?.[0] || {};
  return {
    satisfied: Boolean(row.table_exists && row.column_exists && row.fk_exists && row.unique_index_exists),
    detail: `table=${row.table_exists ? 'present' : 'missing'}, column=${row.column_exists ? 'present' : 'missing'}, fk=${row.fk_exists ? 'present' : 'missing'}, unique_index=${row.unique_index_exists ? 'present' : 'missing'}`
  };
};

const inspectRenterAssociations = async (pool) => {
  const metadata = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL THEN 1 ELSE 0 END AS table_exists,
      CASE WHEN COL_LENGTH(N'dbo.app_users', N'associated_properties') IS NOT NULL THEN 1 ELSE 0 END AS column_exists,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.app_users')
          AND name = N'CK_app_users_associated_properties_json'
      ) THEN 1 ELSE 0 END AS constraint_exists;
  `);
  const row = metadata.recordset?.[0] || {};
  if (!row.table_exists || !row.column_exists || !row.constraint_exists) {
    return {
      satisfied: false,
      detail: `table=${row.table_exists ? 'present' : 'missing'}, column=${row.column_exists ? 'present' : 'missing'}, constraint=${row.constraint_exists ? 'present' : 'missing'}`
    };
  }

  const data = await pool.request().query(`
    SELECT COUNT_BIG(*) AS invalid_json
    FROM dbo.app_users
    WHERE associated_properties IS NOT NULL
      AND ISJSON(associated_properties) <> 1;
  `);
  const invalid = Number(data.recordset?.[0]?.invalid_json || 0);
  return {
    satisfied: invalid === 0,
    detail: `table=present, column=present, constraint=present, invalid_json=${invalid}`
  };
};

const assertSatisfied = async (inspection, message) => {
  const state = await inspection;
  if (!state.satisfied) throw new Error(`${message} (${state.detail})`);
};

const inspectInvoicePaymentReferences = async pool => {
  const result = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.invoice_payment_references', N'U') IS NOT NULL THEN 1 ELSE 0 END AS table_exists,
      CASE WHEN COL_LENGTH(N'dbo.tenant_settings', N'billing_timezone') IS NOT NULL THEN 1 ELSE 0 END AS timezone_exists,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id=OBJECT_ID(N'dbo.invoice_payment_references')
          AND name=N'UX_invoice_payment_references_tenant_reference'
          AND is_unique=1
      ) THEN 1 ELSE 0 END AS unique_exists;
  `);
  const row = result.recordset?.[0] || {};
  return {
    satisfied: Boolean(row.table_exists && row.timezone_exists && row.unique_exists),
    detail: `table=${row.table_exists?'present':'missing'}, timezone=${row.timezone_exists?'present':'missing'}, index=${row.unique_exists?'present':'missing'}`
  };
};

const inspectInvoiceMasterData = async pool => {
  const result = await pool.request().query(`
    SELECT
      CASE WHEN COL_LENGTH(N'dbo.tenant_settings', N'invoice_issuer_profile_json') IS NOT NULL THEN 1 ELSE 0 END AS issuer_profile_exists,
      CASE WHEN EXISTS (SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.tenant_settings')
          AND name = N'CK_tenant_settings_invoice_issuer_profile_json' AND is_disabled = 0 AND is_not_trusted = 0)
        THEN 1 ELSE 0 END AS json_check_exists,
      CASE WHEN COL_LENGTH(N'dbo.properties', N'bank_beneficiary_name') IS NOT NULL THEN 1 ELSE 0 END AS property_beneficiary_exists,
      CASE WHEN COL_LENGTH(N'dbo.property_units', N'bank_beneficiary_name') IS NOT NULL THEN 1 ELSE 0 END AS unit_beneficiary_exists,
      CASE WHEN COL_LENGTH(N'dbo.properties', N'invoice_party_overrides_json') IS NOT NULL THEN 1 ELSE 0 END AS property_parties_exists,
      CASE WHEN EXISTS (SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id=OBJECT_ID(N'dbo.properties')
          AND name=N'CK_properties_invoice_party_overrides_json'
          AND is_disabled=0 AND is_not_trusted=0) THEN 1 ELSE 0 END AS parties_guard,
      CASE WHEN COL_LENGTH(N'dbo.properties', N'billing_contact_name') IS NOT NULL
        AND COL_LENGTH(N'dbo.properties', N'billing_contact_email') IS NOT NULL
        AND COL_LENGTH(N'dbo.properties', N'billing_contact_phone') IS NOT NULL THEN 1 ELSE 0 END AS property_contact_exists,
      CASE WHEN OBJECT_ID(N'dbo.invoice_master_data_audit', N'U') IS NOT NULL THEN 1 ELSE 0 END AS audit_exists,
      CASE WHEN EXISTS (SELECT 1 FROM sys.indexes
        WHERE object_id=OBJECT_ID(N'dbo.invoice_master_data_audit')
          AND name=N'IX_invoice_master_data_audit_tenant_created') THEN 1 ELSE 0 END AS audit_index_exists;
  `);
  const row = result.recordset?.[0] || {};
  return {
    satisfied: Boolean(row.issuer_profile_exists && row.json_check_exists
      && row.property_beneficiary_exists && row.unit_beneficiary_exists
      && row.property_parties_exists && row.parties_guard
      && row.property_contact_exists && row.audit_exists && row.audit_index_exists),
    detail: `issuer_profile=${row.issuer_profile_exists?'present':'missing'}, json_constraint=${row.json_check_exists?'verified':'missing'}, property_beneficiary=${row.property_beneficiary_exists?'present':'missing'}, unit_beneficiary=${row.unit_beneficiary_exists?'present':'missing'}, property_parties=${row.property_parties_exists?'present':'missing'}, parties_guard=${row.parties_guard?'verified':'missing'}, contact=${row.property_contact_exists?'present':'missing'}, audit=${row.audit_exists?'present':'missing'}, audit_index=${row.audit_index_exists?'present':'missing'}`
  };
};

const inspectInvoicePdfArchive = async pool => {
  const result = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.invoice_pdf_archives', N'U') IS NOT NULL THEN 1 ELSE 0 END AS table_exists,
      CASE WHEN EXISTS (SELECT 1 FROM sys.key_constraints
        WHERE parent_object_id=OBJECT_ID(N'dbo.invoice_pdf_archives')
          AND name=N'PK_invoice_pdf_archives') THEN 1 ELSE 0 END AS pk_exists,
      CASE WHEN EXISTS (SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id=OBJECT_ID(N'dbo.invoice_pdf_archives')
          AND name=N'FK_invoice_pdf_archives_invoice') THEN 1 ELSE 0 END AS invoice_fk,
      CASE WHEN EXISTS (SELECT 1 FROM sys.indexes
        WHERE object_id=OBJECT_ID(N'dbo.invoice_pdf_archives')
          AND name=N'UX_invoice_pdf_archives_object_path' AND is_unique=1)
        THEN 1 ELSE 0 END AS unique_path,
      (SELECT COUNT(*) FROM sys.check_constraints
       WHERE parent_object_id=OBJECT_ID(N'dbo.invoice_pdf_archives')
         AND is_disabled=0 AND is_not_trusted=0
         AND name IN (N'CK_invoice_pdf_archives_version',N'CK_invoice_pdf_archives_size',
                      N'CK_invoice_pdf_archives_snapshot',N'CK_invoice_pdf_archives_hashes',
                      N'CK_invoice_pdf_archives_path')) AS checked_constraints,
      CASE WHEN EXISTS (SELECT 1 FROM sys.triggers
        WHERE parent_id=OBJECT_ID(N'dbo.invoice_pdf_archives')
          AND name=N'TR_invoice_pdf_archives_write_once' AND is_disabled=0)
        THEN 1 ELSE 0 END AS immutable_trigger;
  `);
  const row=result.recordset?.[0]||{};
  const satisfied=Boolean(row.table_exists&&row.pk_exists&&row.invoice_fk&&row.unique_path
    &&row.checked_constraints===5&&row.immutable_trigger);
  return {
    satisfied,
    detail:`table=${row.table_exists}, pk=${row.pk_exists}, invoice_fk=${row.invoice_fk}, unique_path=${row.unique_path}, checks=${row.checked_constraints}, immutable_trigger=${row.immutable_trigger}`
  };
};

// B04 S3a/S3d: independent read-only schema integrity checks. Existing
// historical migrations retain their order and checksums.
const inspectSignupChallenges = async pool => {
  const result = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.app_users',N'U') IS NOT NULL
             AND OBJECT_ID(N'dbo.auth_users',N'U') IS NOT NULL
             AND OBJECT_ID(N'dbo.public_signup_challenges',N'U') IS NOT NULL
           THEN 1 ELSE 0 END AS tables_ok,
      (SELECT COUNT(*) FROM sys.columns
       WHERE object_id=OBJECT_ID(N'dbo.public_signup_challenges')
         AND name IN (N'id',N'email_normalized',N'display_name',
           N'token_hash',N'issued_at',N'sent_at',N'expires_at',
           N'consumed_at',N'revoked_at',N'send_count',N'verify_attempts'))
          AS columns_ok,
      CASE WHEN EXISTS (SELECT 1 FROM sys.key_constraints
          WHERE parent_object_id=OBJECT_ID(N'dbo.public_signup_challenges')
            AND name=N'PK_public_signup_challenges' AND type='PK')
          THEN 1 ELSE 0 END AS pk_ok,
      CASE WHEN EXISTS (SELECT 1 FROM sys.key_constraints
          WHERE parent_object_id=OBJECT_ID(N'dbo.public_signup_challenges')
            AND name=N'UQ_public_signup_challenges_token_hash' AND type='UQ')
          THEN 1 ELSE 0 END AS token_unique,
      (SELECT COUNT(*) FROM sys.check_constraints
       WHERE parent_object_id=OBJECT_ID(N'dbo.public_signup_challenges')
         AND is_disabled=0 AND is_not_trusted=0
         AND name IN (N'CK_public_signup_challenges_expiry',
           N'CK_public_signup_challenges_counts',
           N'CK_public_signup_challenges_finished_once',
           N'CK_public_signup_challenges_normalized_email')) AS checks_ok,
      (SELECT COUNT(*) FROM sys.indexes
       WHERE object_id=OBJECT_ID(N'dbo.public_signup_challenges')
         AND name IN (N'IX_public_signup_challenges_email_state',
                      N'IX_public_signup_challenges_expiry')
         AND is_disabled=0) AS indexes_ok,
      CASE WHEN EXISTS (SELECT 1 FROM sys.columns
         WHERE object_id=OBJECT_ID(N'dbo.public_signup_challenges')
           AND name=N'token_hash' AND max_length=64
           AND collation_name=N'Latin1_General_100_BIN2')
         THEN 1 ELSE 0 END AS hash_format_ok;
  `);
  const r = result.recordset?.[0] || {};
  const satisfied=Boolean(r.tables_ok && r.columns_ok===11 && r.pk_ok
    && r.token_unique && r.checks_ok===4 && r.indexes_ok===2
    && r.hash_format_ok);
  return {satisfied,detail:`tables=${r.tables_ok||0}, columns=${r.columns_ok||0}/11, pk=${r.pk_ok||0}, token_unique=${r.token_unique||0}, checks=${r.checks_ok||0}/4, indexes=${r.indexes_ok||0}/2, hash=${r.hash_format_ok||0}`};
};

const inspectSignupLimits = async pool => {
  const result=await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.public_signup_challenges',N'U') IS NOT NULL
             AND OBJECT_ID(N'dbo.public_signup_rate_limits',N'U') IS NOT NULL
           THEN 1 ELSE 0 END AS tables_ok,
      (SELECT COUNT(*) FROM sys.columns
       WHERE object_id=OBJECT_ID(N'dbo.public_signup_rate_limits')
         AND name IN (N'bucket_hash',N'window_start',N'request_count',
                      N'updated_at')) AS columns_ok,
      CASE WHEN EXISTS (SELECT 1 FROM sys.key_constraints
         WHERE parent_object_id=OBJECT_ID(N'dbo.public_signup_rate_limits')
           AND name=N'PK_public_signup_rate_limits' AND type='PK')
         THEN 1 ELSE 0 END AS pk_ok,
      (SELECT COUNT(*) FROM sys.check_constraints
       WHERE parent_object_id=OBJECT_ID(N'dbo.public_signup_rate_limits')
         AND is_disabled=0 AND is_not_trusted=0
         AND name IN (N'CK_public_signup_rate_limits_count',
           N'CK_public_signup_rate_limits_window')) AS checks_ok,
      CASE WHEN EXISTS (SELECT 1 FROM sys.indexes
         WHERE object_id=OBJECT_ID(N'dbo.public_signup_rate_limits')
           AND name=N'IX_public_signup_rate_limits_updated'
           AND is_disabled=0) THEN 1 ELSE 0 END AS index_ok,
      CASE WHEN EXISTS (SELECT 1 FROM sys.columns
         WHERE object_id=OBJECT_ID(N'dbo.public_signup_rate_limits')
           AND name=N'bucket_hash' AND max_length=64
           AND collation_name=N'Latin1_General_100_BIN2')
         THEN 1 ELSE 0 END AS hash_format_ok;
  `);
  const r=result.recordset?.[0]||{};
  const satisfied=Boolean(r.tables_ok && r.columns_ok===4 && r.pk_ok
    && r.checks_ok===2 && r.index_ok && r.hash_format_ok);
  return {satisfied,detail:`tables=${r.tables_ok||0}, columns=${r.columns_ok||0}/4, pk=${r.pk_ok||0}, checks=${r.checks_ok||0}/2, index=${r.index_ok||0}, hash=${r.hash_format_ok||0}`};
};

const inspectPropertyCountry = async (pool) => {
  const result = await pool.request().query(`
    SELECT
      CASE WHEN COL_LENGTH(N'dbo.properties',N'country_code') IS NOT NULL THEN 1 ELSE 0 END AS country_column,
      CASE WHEN OBJECT_ID(N'dbo.iso_property_countries',N'U') IS NOT NULL THEN 1 ELSE 0 END AS codes_table,
      CASE WHEN EXISTS(SELECT 1 FROM sys.foreign_keys
        WHERE name=N'FK_properties_iso_country' AND parent_object_id=OBJECT_ID(N'dbo.properties')
          AND is_disabled=0 AND is_not_trusted=0) THEN 1 ELSE 0 END AS trusted_fk;
  `);
  const row=result.recordset?.[0] || {};
  let codeCount=0;
  if(row.codes_table) {
    codeCount=Number((await pool.request().query('SELECT COUNT(*) AS n FROM dbo.iso_property_countries')).recordset[0].n);
  }
  return {satisfied:Boolean(row.country_column && row.trusted_fk && codeCount===249),
    detail:`country_column=${row.country_column}, trusted_fk=${row.trusted_fk}, ISO_codes=${codeCount}`};
};

const inspectPublicListingProjection = async (pool) => {
  const result=await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo') AND name IN(
        'public_listing_preferences','public_listing_read_buckets','public_listing_media','public_listing_media_reviews')) AS tables_ready,
      (SELECT COUNT(*) FROM sys.triggers WHERE is_disabled=0 AND name IN(
        'trg_public_listing_preferences_property_insert','trg_public_listing_property_country_changed','trg_public_listing_media_source_changed')) AS triggers_ready,
      (SELECT COUNT(*) FROM sys.foreign_keys WHERE is_disabled=0 AND is_not_trusted=0 AND name IN(
        'FK_public_listing_preferences_property','FK_public_listing_preferences_tenant',
        'FK_public_listing_media_listing','FK_public_listing_media_reviews_media')) AS trusted_fks,
      (SELECT COUNT(*) FROM sys.indexes WHERE is_disabled=0 AND name IN(
        'IX_public_listing_preferences_market','UX_public_listing_media_current_slot','IX_public_listing_media_reviews_media')) AS indexes_ready;
  `);
  const row=result.recordset?.[0] || {};
  return {satisfied:row.tables_ready===4 && row.triggers_ready===3 && row.trusted_fks===4 && row.indexes_ready===3,
    detail:`tables=${row.tables_ready}/4, triggers=${row.triggers_ready}/3, trusted_fks=${row.trusted_fks}/4, indexes=${row.indexes_ready}/3`};
};

const MIGRATIONS = [
  {
    id: '20260920_01_add_tenancy_billing_adjustments',
    file: 'migrations/20260920_01_add_tenancy_billing_adjustments.sql',
    inspect: inspectBillingAdjustments,
    verify: async (pool) => assertSatisfied(
      inspectBillingAdjustments(pool),
      'Billing-adjustments migration verification failed.'
    )
  },
  {
    id: '20260920_02_create_platform_admins',
    file: 'migrations/20260920_02_create_platform_admins.sql',
    inspect: inspectPlatformAdmins,
    verify: async (pool) => assertSatisfied(
      inspectPlatformAdmins(pool),
      'Platform-admin migration verification failed.'
    )
  },
  {
    id: '20260920_03_backfill_legacy_app_user_memberships',
    file: 'migrations/20260920_03_backfill_legacy_app_user_memberships.sql',
    inspect: inspectMembershipBackfill,
    verify: async (pool) => assertSatisfied(
      inspectMembershipBackfill(pool),
      'Membership backfill verification failed.'
    )
  },
  {
    id: '20260926_01_add_rentee_property_unit_associations',
    file: 'migrations/20260926_01_add_rentee_property_unit_associations.sql',
    inspect: inspectRenterAssociations,
    verify: async (pool) => assertSatisfied(
      inspectRenterAssociations(pool),
      'Renter property-unit association migration verification failed.'
    )
  },
  {
    id: '20261005_01_add_property_utility_configs',
    file: 'migrations/20261005_01_add_property_utility_configs.sql',
    inspect: inspectPropertyUtilityConfigs,
    verify: async (pool) => assertSatisfied(
      inspectPropertyUtilityConfigs(pool),
      'Property utility-config migration verification failed.'
    )
  },
  {
    id: '20261006_01_repair_auth_store_runtime_columns',
    file: 'migrations/20261006_01_repair_auth_store_runtime_columns.sql',
    inspect: inspectAuthStoreRuntimeColumns,
    verify: async (pool) => assertSatisfied(
      inspectAuthStoreRuntimeColumns(pool),
      'Auth-store compatibility migration verification failed.'
    )
  },
  {
    id: '20261018_01_invoice_payment_references',
    file: 'migrations/20261018_01_invoice_payment_references.sql',
    inspect: inspectInvoicePaymentReferences,
    verify: async pool => assertSatisfied(
      inspectInvoicePaymentReferences(pool),
      'Payment reference schema verification failed.'
    )
  },
  {
    id: '20261019_01_invoice_master_data',
    file: 'migrations/20261019_01_invoice_master_data.sql',
    inspect: inspectInvoiceMasterData,
    verify: async pool => assertSatisfied(inspectInvoiceMasterData(pool),
      'Invoice master-data schema verification failed.')
  },
  {
    id: '20261020_01_immutable_invoice_pdf_archive',
    file: 'migrations/20261020_01_immutable_invoice_pdf_archive.sql',
    inspect: inspectInvoicePdfArchive,
    verify: async pool => assertSatisfied(inspectInvoicePdfArchive(pool),
      'Issued PDF archive ledger schema verification failed.')
  },
  {
    id: '20261023_01_create_public_signup_challenges',
    file: 'migrations/20261023_01_create_public_signup_challenges.sql',
    inspect: inspectSignupChallenges,
    verify: async pool => assertSatisfied(inspectSignupChallenges(pool),
      'B04 signup challenge schema verification failed.')
  },
  {
    id: '20261024_01_create_public_signup_rate_limits',
    file: 'migrations/20261024_01_create_public_signup_rate_limits.sql',
    inspect: inspectSignupLimits,
    verify: async pool => assertSatisfied(inspectSignupLimits(pool),
      'B04 atomic SQL rate-limit schema verification failed.')
  },
  {
    id: '20261026_02_property_iso_country',
    file: 'migrations/20261026_02_property_iso_country.sql',
    inspect: inspectPropertyCountry,
    verify: async pool => assertSatisfied(inspectPropertyCountry(pool), 'Property ISO country schema verification failed.')
  },
  {
    id: '20261026_01_public_listing_preferences',
    file: 'migrations/20261026_01_public_listing_preferences.sql',
    inspect: inspectPublicListingProjection,
    verify: async pool => assertSatisfied(inspectPublicListingProjection(pool), 'Public listing projection schema verification failed.')
  },
  {
    id: '20261028_01_property_enquiries',
    file: 'migrations/20261028_01_property_enquiries.sql',
    inspect: inspectPropertyEnquiries,
    verify: async pool => assertSatisfied(inspectPropertyEnquiries(pool), 'Property enquiry schema verification failed.')
  },
  {
    id: '20261028_02_property_viewings',
    file: 'migrations/20261028_02_property_viewings.sql',
    inspect: inspectPropertyViewings,
    verify: async pool => assertSatisfied(inspectPropertyViewings(pool), 'Property viewing schema verification failed.')
  },
  {
    id: '20261028_03_property_applications',
    file: 'migrations/20261028_03_property_applications.sql',
    inspect: inspectPropertyApplications,
    verify: async pool => assertSatisfied(inspectPropertyApplications(pool), 'Property application schema verification failed.')
  },
  {id:'20261029_01_rental_offers_and_holds',file:'migrations/20261029_01_rental_offers_and_holds.sql',
    inspect:inspectRentalOffers,verify:async pool=>assertSatisfied(inspectRentalOffers(pool),'Rental offer and occupancy schema verification failed.')}
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

  if (!['plan', 'apply', 'verify', 'preflight'].includes(mode)) {
    throw new Error(`Unsupported migration mode: ${mode}`);
  }

  if (mode === 'verify' && through !== 'all') {
    throw new Error('Strict migration verification must check all managed migrations.');
  }
  if (mode === 'preflight' && through !== 'all') {
    throw new Error('Read-only preflight must check all managed migrations.');
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

const envFlag = (name) => String(process.env[name] || '').trim().toLowerCase() === 'true';

const createConnectionConfig = () => {
  const server = requiredEnv('MSSQL_SERVER');
  const database = requiredEnv('MSSQL_DATABASE');
  const migrationUser = String(process.env.MSSQL_MIGRATION_USER || '').trim();
  const migrationPassword = String(process.env.MSSQL_MIGRATION_PASSWORD || '').trim();
  const accessToken = String(process.env.MSSQL_ACCESS_TOKEN || '').trim();
  const useManagedIdentity = envFlag('MSSQL_MIGRATION_USE_MANAGED_IDENTITY');

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

  if (useManagedIdentity) {
    return {
      ...base,
      authentication: {
        type: 'azure-active-directory-default',
        options: {}
      }
    };
  }

  if (!accessToken) {
    throw new Error('No privileged migration authentication is configured. Provide MSSQL_ACCESS_TOKEN, dedicated MSSQL_MIGRATION_USER/MSSQL_MIGRATION_PASSWORD credentials, or explicitly enable runtime managed identity for read-only planning.');
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

const assertExecutorGrantReadiness = async (pool) => {
  // Permission inspection is read-only; it is NOT a substitute for a governed apply.
  const result = await pool.request().query(`
    SELECT
      HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS can_create_table,
      HAS_PERMS_BY_NAME('dbo', 'SCHEMA', 'ALTER') AS can_alter_dbo;
  `);
  const row = result.recordset?.[0] || {};
  if (row.can_create_table !== 1 || row.can_alter_dbo !== 1) {
    throw new Error('The isolated migration executor does not have the required CREATE TABLE and dbo schema ALTER grants.');
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

  if (
    mode === 'verify'
    && (!envFlag('MSSQL_MIGRATION_USE_MANAGED_IDENTITY') || !envFlag('MSSQL_MIGRATION_DEDICATED_EXECUTOR'))
  ) {
    throw new Error('Strict production migration verification requires the dedicated executor managed identity.');
  }

  if (
    mode === 'preflight'
    && (!envFlag('MSSQL_MIGRATION_USE_MANAGED_IDENTITY') || !envFlag('MSSQL_MIGRATION_DEDICATED_EXECUTOR'))
  ) {
    throw new Error('Read-only preflight requires the dedicated executor managed identity.');
  }

  if (
    mode === 'apply'
    && envFlag('MSSQL_MIGRATION_USE_MANAGED_IDENTITY')
    && !envFlag('MSSQL_MIGRATION_DEDICATED_EXECUTOR')
  ) {
    throw new Error('Runtime managed identity is permitted for read-only migration planning only. Production migration apply requires the dedicated privileged migration executor.');
  }

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

    if (mode === 'verify') {
      // Never create or adopt a ledger row in verification mode.
      if (!hasLedger) {
        throw new Error('Migration ledger is missing; verification cannot claim production readiness.');
      }
      await assertExecutorGrantReadiness(pool);

      let problems = 0;
      for (const item of planned) {
        const inspection = await item.migration.inspect(pool);
        const ledgerState = item.appliedRow ? 'LEDGERED' : 'MISSING_LEDGER';
        const schemaState = inspection.satisfied ? 'SCHEMA_OK' : 'SCHEMA_MISMATCH';
        console.log(`VERIFY  ${item.migration.id}  ${ledgerState}  ${schemaState}  ${inspection.detail}`);
        if (!item.appliedRow || !inspection.satisfied) problems += 1;
      }

      if (problems) {
        throw new Error(`Strict migration verification failed for ${problems} managed migration(s); do not mark the executor or ledger production-ready.`);
      }
      console.log(`Strict read-only migration verification passed for ${planned.length} managed migrations; ledger checksums, schema state and executor grants are valid.`);
      return;
    }

    if (mode === 'preflight') {
      // Pre-apply readiness is not strict post-apply acceptance. Validate the
      // isolated identity, all applied checksums and all managed schema states.
      // No DDL, no ledger adoption, and no runtime-identity shortcut.
      if (!hasLedger) {
        throw new Error('Migration ledger is missing; executor preflight cannot establish a safe apply plan.');
      }
      await assertExecutorGrantReadiness(pool);
      let pending = 0;
      let satisfiedUntracked = 0;
      for (const item of planned) {
        const inspection = await item.migration.inspect(pool);
        if (item.appliedRow && !inspection.satisfied) {
          throw new Error(`Already-applied migration ${item.migration.id} has schema drift; refusing preflight.`);
        }
        const state = item.appliedRow
          ? 'LEDGERED'
          : inspection.satisfied ? 'SATISFIED_UNTRACKED' : 'PENDING';
        if (state === 'PENDING') pending += 1;
        if (state === 'SATISFIED_UNTRACKED') satisfiedUntracked += 1;
        console.log(`PREFLIGHT  ${item.migration.id}  ${state}  ${inspection.detail}`);
      }
      console.log(`Read-only executor preflight passed for ${planned.length} managed migrations; pending=${pending}; satisfied_untracked=${satisfiedUntracked}; executor grants and applied checksums checked. No database changes made.`);
      return;
    }

    if (mode === 'plan') {
      for (const item of planned) {
        if (item.appliedRow) {
          console.log(`APPLIED  ${item.migration.id}  ${item.checksum}`);
          continue;
        }

        const inspection = await item.migration.inspect(pool);
        const status = inspection.satisfied ? 'SATISFIED_UNTRACKED' : 'PENDING';
        console.log(`${status}  ${item.migration.id}  ${item.checksum}  ${inspection.detail}`);
      }

      console.log('Plan completed without modifying the database.');
      return;
    }

    for (const item of planned) {
      console.log(`${item.appliedRow ? 'APPLIED' : 'PENDING'}  ${item.migration.id}  ${item.checksum}`);
    }

    await assertDdlPermission(pool);
    await ensureLedger(pool);

    for (const item of planned) {
      if (item.appliedRow) {
        console.log(`Skipping already applied migration: ${item.migration.id}`);
        continue;
      }

      const inspection = await item.migration.inspect(pool);
      if (inspection.satisfied) {
        await item.migration.verify(pool);
        await recordMigration(pool, item.migration, item.checksum);
        console.log(`Adopted satisfied untracked migration without replaying SQL: ${item.migration.id}`);
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
