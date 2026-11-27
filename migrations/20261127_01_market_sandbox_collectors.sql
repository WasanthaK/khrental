SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.management_market_sandbox_collectors',N'U') IS NULL
  CREATE TABLE dbo.management_market_sandbox_collectors (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    market CHAR(2) COLLATE Latin1_General_100_BIN2 NOT NULL CHECK (market LIKE '[A-Z][A-Z]'),
    provider VARCHAR(32) NOT NULL,
    receiving_account VARCHAR(128) NOT NULL,
    effective_at_utc DATETIME2(3) NOT NULL,
    approval_reference NVARCHAR(250) NOT NULL CHECK (LEN(TRIM(approval_reference)) > 0),
    created_by UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT UQ_market_sandbox_collector_date UNIQUE (market,effective_at_utc)
  );

EXEC(N'CREATE OR ALTER TRIGGER dbo.management_sandbox_collector_history
ON dbo.management_market_sandbox_collectors AFTER UPDATE,DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS(SELECT 1 FROM deleted) THROW 51250, ''Collector history is retained. Schedule a new assignment.'', 1;
END');
EXEC(N'CREATE OR ALTER FUNCTION dbo.management_sandbox_collector_at(@market CHAR(2),@at DATETIME2(3))
RETURNS TABLE AS RETURN (
  SELECT TOP (1) id,market,provider,receiving_account,effective_at_utc
  FROM dbo.management_market_sandbox_collectors WHERE market=@market AND effective_at_utc<=@at
  ORDER BY effective_at_utc DESC
)');

IF COL_LENGTH(N'dbo.management_billing_accounts',N'collector_assignment_id') IS NULL
  ALTER TABLE dbo.management_billing_accounts ADD collector_assignment_id UNIQUEIDENTIFIER NULL
    CONSTRAINT FK_management_billing_sandbox_collector REFERENCES dbo.management_market_sandbox_collectors(id);

COMMIT TRANSACTION;
