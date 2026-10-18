-- Governed additive migration: do not apply to production outside the
-- approved dedicated migration executor. No historical invoice is rewritten.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
     OR OBJECT_ID(N'dbo.tenant_settings', N'U') IS NULL
    THROW 51100, 'Payment reference prerequisites are missing', 1;

  IF COL_LENGTH(N'dbo.tenant_settings', N'billing_timezone') IS NULL
    ALTER TABLE dbo.tenant_settings ADD billing_timezone NVARCHAR(100) NULL;

  -- Existing KH Rentals organization uses Sri Lankan local calendar dates.
  -- Other organizations default to UTC until an approved tenant setting is
  -- configured; never infer timezone from a user's browser or a property.
  UPDATE s
  SET billing_timezone = CASE
    WHEN t.slug = N'kh-rentals' THEN N'Asia/Colombo'
    ELSE N'UTC'
  END
  FROM dbo.tenant_settings s
  JOIN dbo.tenants t ON t.id = s.tenant_id
  WHERE s.billing_timezone IS NULL;

  IF OBJECT_ID(N'dbo.invoice_payment_references', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.invoice_payment_references (
      invoice_id UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT PK_invoice_payment_references PRIMARY KEY,
      tenant_id UNIQUEIDENTIFIER NOT NULL,
      payment_reference CHAR(8) NOT NULL,
      reference_timezone NVARCHAR(100) NOT NULL,
      source NVARCHAR(32) NOT NULL,
      assigned_by UNIQUEIDENTIFIER NULL,
      assigned_at DATETIMEOFFSET NOT NULL
        CONSTRAINT DF_invoice_payment_references_assigned_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_invoice_payment_references_invoice
        FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id),
      CONSTRAINT FK_invoice_payment_references_tenant
        FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
      CONSTRAINT CK_invoice_payment_references_source
        CHECK (source IN (N'invoice_issue', N'manual_supplement')),
      CONSTRAINT CK_invoice_payment_references_digits
        CHECK (LEN(payment_reference) = 8 AND payment_reference NOT LIKE '%[^0-9]%')
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.invoice_payment_references')
      AND name = N'UX_invoice_payment_references_tenant_reference'
  )
    CREATE UNIQUE INDEX UX_invoice_payment_references_tenant_reference
      ON dbo.invoice_payment_references(tenant_id, payment_reference);

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
