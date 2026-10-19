-- Additive invoice master data for future verified PDFs and controlled billing.
-- Leave all new fields NULL: never backfill guessed issuer or beneficiary details.
-- Does not mutate invoices, existing bank accounts, renters or payment instructions.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID(N'dbo.tenant_settings', N'U') IS NULL
     OR OBJECT_ID(N'dbo.properties', N'U') IS NULL
     OR OBJECT_ID(N'dbo.property_units', N'U') IS NULL
    THROW 51120, 'Invoice master data prerequisites are missing', 1;
  IF COL_LENGTH(N'dbo.tenant_settings', N'invoice_issuer_profile_json') IS NULL
    ALTER TABLE dbo.tenant_settings ADD invoice_issuer_profile_json NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.tenant_settings')
      AND name = N'CK_tenant_settings_invoice_issuer_profile_json')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.tenant_settings WITH CHECK
      ADD CONSTRAINT CK_tenant_settings_invoice_issuer_profile_json
      CHECK (invoice_issuer_profile_json IS NULL OR ISJSON(invoice_issuer_profile_json) = 1)';
  IF COL_LENGTH(N'dbo.properties', N'bank_beneficiary_name') IS NULL
    ALTER TABLE dbo.properties ADD bank_beneficiary_name NVARCHAR(255) NULL;
  IF COL_LENGTH(N'dbo.property_units', N'bank_beneficiary_name') IS NULL
    ALTER TABLE dbo.property_units ADD bank_beneficiary_name NVARCHAR(255) NULL;
  -- Property-specific roles are optional; the tenant organization normally
  -- manages its own properties, so no duplicate manager profile is prefilled.
  -- When present, explicit JSON overrides name the owner, outsourced manager
  -- and/or alternative legal issuer; a protected admin API validates their shape.
  IF COL_LENGTH(N'dbo.properties', N'invoice_party_overrides_json') IS NULL
    ALTER TABLE dbo.properties ADD invoice_party_overrides_json NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.properties')
      AND name=N'CK_properties_invoice_party_overrides_json')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.properties WITH CHECK
      ADD CONSTRAINT CK_properties_invoice_party_overrides_json
      CHECK (invoice_party_overrides_json IS NULL OR ISJSON(invoice_party_overrides_json) = 1)';

  -- Designated property contact may differ from both manager and issuer.
  IF COL_LENGTH(N'dbo.properties', N'billing_contact_name') IS NULL
    ALTER TABLE dbo.properties ADD billing_contact_name NVARCHAR(255) NULL;
  IF COL_LENGTH(N'dbo.properties', N'billing_contact_email') IS NULL
    ALTER TABLE dbo.properties ADD billing_contact_email NVARCHAR(320) NULL;
  IF COL_LENGTH(N'dbo.properties', N'billing_contact_phone') IS NULL
    ALTER TABLE dbo.properties ADD billing_contact_phone NVARCHAR(100) NULL;

  -- Audit field names and hashes without exposing old/new bank details.
  IF OBJECT_ID(N'dbo.invoice_master_data_audit', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.invoice_master_data_audit (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_invoice_master_data_audit PRIMARY KEY DEFAULT NEWID(),
      tenant_id UNIQUEIDENTIFIER NOT NULL,
      actor_user_id UNIQUEIDENTIFIER NOT NULL,
      resource_kind NVARCHAR(32) NOT NULL,
      resource_id UNIQUEIDENTIFIER NULL,
      changed_fields_json NVARCHAR(MAX) NOT NULL,
      previous_hash CHAR(64) NULL,
      current_hash CHAR(64) NOT NULL,
      createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_invoice_master_data_audit_createdat DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_invoice_master_data_audit_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
      CONSTRAINT CK_invoice_master_data_audit_resource CHECK (
        resource_kind IN (N'issuer', N'property_billing', N'unit_billing')
      ),
      CONSTRAINT CK_invoice_master_data_audit_fields CHECK (ISJSON(changed_fields_json) = 1)
    );
  END;
  IF NOT EXISTS (SELECT 1 FROM sys.indexes
    WHERE object_id=OBJECT_ID(N'dbo.invoice_master_data_audit')
      AND name=N'IX_invoice_master_data_audit_tenant_created')
    CREATE INDEX IX_invoice_master_data_audit_tenant_created
      ON dbo.invoice_master_data_audit(tenant_id, createdat DESC);
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
