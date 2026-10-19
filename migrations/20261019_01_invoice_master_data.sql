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
    ALTER TABLE dbo.tenant_settings WITH CHECK
      ADD CONSTRAINT CK_tenant_settings_invoice_issuer_profile_json
      CHECK (invoice_issuer_profile_json IS NULL OR ISJSON(invoice_issuer_profile_json) = 1);
  IF COL_LENGTH(N'dbo.properties', N'bank_beneficiary_name') IS NULL
    ALTER TABLE dbo.properties ADD bank_beneficiary_name NVARCHAR(255) NULL;
  IF COL_LENGTH(N'dbo.property_units', N'bank_beneficiary_name') IS NULL
    ALTER TABLE dbo.property_units ADD bank_beneficiary_name NVARCHAR(255) NULL;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
