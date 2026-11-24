SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.management_invoice_issuers', N'U') IS NULL
  CREATE TABLE dbo.management_invoice_issuers (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    legal_name NVARCHAR(200) NOT NULL CHECK (LEN(TRIM(legal_name)) > 0),
    country_code CHAR(2) COLLATE Latin1_General_100_BIN2 NOT NULL
      CHECK (country_code LIKE '[A-Z][A-Z]'),
    UNIQUE (country_code, legal_name)
  );

IF OBJECT_ID(N'dbo.management_market_issuer_assignments', N'U') IS NULL
  CREATE TABLE dbo.management_market_issuer_assignments (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    market CHAR(2) COLLATE Latin1_General_100_BIN2 NOT NULL CHECK (market LIKE '[A-Z][A-Z]'),
    issuer_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.management_invoice_issuers(id),
    effective_at_utc DATETIME2(7) NULL,
    approval_reference NVARCHAR(250) NULL,
    CHECK ((effective_at_utc IS NULL AND approval_reference IS NULL) OR
      (effective_at_utc IS NOT NULL AND approval_reference IS NOT NULL AND LEN(TRIM(approval_reference)) > 0))
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.management_market_issuer_assignments')
    AND name=N'UX_market_issuer_effective')
  CREATE UNIQUE INDEX UX_market_issuer_effective ON dbo.management_market_issuer_assignments(market,effective_at_utc)
    WHERE effective_at_utc IS NOT NULL;

EXEC(N'CREATE OR ALTER FUNCTION dbo.management_invoice_issuer_at(@market CHAR(2), @as_of_utc DATETIME2(7))
RETURNS TABLE AS RETURN (
  SELECT TOP (1) a.id AS assignment_id, a.issuer_id, a.market, a.effective_at_utc, i.legal_name, i.country_code
  FROM dbo.management_market_issuer_assignments a JOIN dbo.management_invoice_issuers i ON i.id=a.issuer_id
  WHERE a.market=@market AND a.effective_at_utc<=@as_of_utc
  ORDER BY a.effective_at_utc DESC
)');

-- The owner confirmed the entity, but no date for live issuance has been approved.
-- A stable seed ID prevents replay from recreating a draft after its approval.
DECLARE @issuer UNIQUEIDENTIFIER;
SELECT @issuer=id FROM dbo.management_invoice_issuers WITH (UPDLOCK,HOLDLOCK)
  WHERE country_code='US' AND legal_name=N'Quixo Inc.';
IF @issuer IS NULL
BEGIN
  SET @issuer=NEWID();
  INSERT dbo.management_invoice_issuers(id,legal_name,country_code) VALUES(@issuer,N'Quixo Inc.','US');
END;
IF NOT EXISTS (SELECT 1 FROM dbo.management_market_issuer_assignments WITH (UPDLOCK,HOLDLOCK)
    WHERE id='d7ff9299-2115-4eea-a3f3-483faaa98258')
  INSERT dbo.management_market_issuer_assignments(id,market,issuer_id)
    VALUES('d7ff9299-2115-4eea-a3f3-483faaa98258','LK',@issuer);

COMMIT TRANSACTION;
