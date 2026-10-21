-- Draft-only governed migration: add a write-once ledger for exact issued PDF.
-- Never auto-apply from runtime or use this table to manufacture historical PDFs.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.tenants', N'U') IS NULL
     OR OBJECT_ID(N'dbo.invoices', N'U') IS NULL
    THROW 51210, 'Invoice archive ledger prerequisites are missing.', 1;

  IF OBJECT_ID(N'dbo.invoice_pdf_archives', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.invoice_pdf_archives (
      tenant_id UNIQUEIDENTIFIER NOT NULL,
      invoice_id UNIQUEIDENTIFIER NOT NULL,
      archive_version SMALLINT NOT NULL,
      pdf_sha256 CHAR(64) NOT NULL,
      snapshot_sha256 CHAR(64) NOT NULL,
      object_path NVARCHAR(512) NOT NULL,
      byte_length INT NOT NULL,
      issued_snapshot_json NVARCHAR(MAX) NOT NULL,
      archived_by UNIQUEIDENTIFIER NOT NULL,
      archived_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_invoice_pdf_archives_archived_at DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_invoice_pdf_archives PRIMARY KEY (tenant_id, invoice_id),
      CONSTRAINT FK_invoice_pdf_archives_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
      CONSTRAINT FK_invoice_pdf_archives_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id),
      CONSTRAINT CK_invoice_pdf_archives_version CHECK (archive_version = 1),
      CONSTRAINT CK_invoice_pdf_archives_size CHECK (byte_length BETWEEN 100 AND 5242880),
      CONSTRAINT CK_invoice_pdf_archives_snapshot CHECK (
        ISJSON(issued_snapshot_json) = 1
        AND JSON_VALUE(issued_snapshot_json, '$.kind') = N'invoice_issued'
        AND JSON_VALUE(issued_snapshot_json, '$.version') = N'1'
      ),
      CONSTRAINT CK_invoice_pdf_archives_hashes CHECK (
        LEN(pdf_sha256) = 64 AND LEN(snapshot_sha256) = 64
        AND pdf_sha256 COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9a-f]%'
        AND snapshot_sha256 COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9a-f]%'
      ),
      CONSTRAINT CK_invoice_pdf_archives_path CHECK (
        object_path COLLATE Latin1_General_100_BIN2 = (
          N'tenants/' + LOWER(CONVERT(NVARCHAR(36), tenant_id)) +
          N'/invoices/' + LOWER(CONVERT(NVARCHAR(36), invoice_id)) +
          N'/issued/sha256-' + RTRIM(pdf_sha256) + N'.pdf'
        ) COLLATE Latin1_General_100_BIN2
      )
    );
  END;

  IF NOT EXISTS (SELECT 1 FROM sys.indexes
    WHERE object_id=OBJECT_ID(N'dbo.invoice_pdf_archives')
      AND name=N'UX_invoice_pdf_archives_object_path')
    CREATE UNIQUE INDEX UX_invoice_pdf_archives_object_path
      ON dbo.invoice_pdf_archives(object_path);

  -- No operational UPDATE or DELETE is permitted for an issued document.
  -- INSERT also enforces invoice+tenant identity: a single-column invoice FK
  -- alone cannot rule out a foreign-tenant invoice ID.
  IF OBJECT_ID(N'dbo.TR_invoice_pdf_archives_write_once', N'TR') IS NULL
  BEGIN
    EXEC sys.sp_executesql N'
      CREATE TRIGGER dbo.TR_invoice_pdf_archives_write_once
      ON dbo.invoice_pdf_archives
      AFTER INSERT, UPDATE, DELETE
      AS
      BEGIN
        SET NOCOUNT ON;
        IF EXISTS (SELECT 1 FROM deleted)
          THROW 51211, ''Issued invoice archive ledger cannot be changed or deleted.'', 1;
        IF EXISTS (
          SELECT 1 FROM inserted a
          WHERE NOT EXISTS (
            SELECT 1 FROM dbo.invoices inv WITH (UPDLOCK, HOLDLOCK)
            WHERE inv.id=a.invoice_id AND inv.tenant_id=a.tenant_id
          )
        )
          THROW 51212, ''Invoice archive tenant does not own this invoice.'', 1;
      END;';
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
