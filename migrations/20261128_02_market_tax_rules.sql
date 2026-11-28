SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.management_market_tax_rules',N'U') IS NULL
  CREATE TABLE dbo.management_market_tax_rules (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    market CHAR(2) COLLATE Latin1_General_100_BIN2 NOT NULL CHECK (market LIKE '[A-Z][A-Z]'),
    effective_at_utc DATETIME2(7) NOT NULL,
    approval_reference NVARCHAR(250) NOT NULL CHECK (LEN(TRIM(approval_reference)) > 0),
    vat_status VARCHAR(16) NOT NULL,
    vat_rate_basis_points INT NOT NULL,
    vat_invoice_treatment VARCHAR(16) NOT NULL,
    withholding_status VARCHAR(16) NOT NULL,
    withholding_rate_basis_points INT NOT NULL,
    withholding_basis VARCHAR(32) NOT NULL,
    withholding_settlement_treatment VARCHAR(32) NOT NULL,
    created_by UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.app_users(id),
    created_at DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_management_market_tax_rule_date UNIQUE(market,effective_at_utc),
    CONSTRAINT CK_management_market_tax_vat CHECK (
      (vat_status='disabled' AND vat_rate_basis_points=0 AND vat_invoice_treatment='none') OR
      (vat_status='enabled' AND vat_rate_basis_points BETWEEN 1 AND 10000
        AND vat_invoice_treatment IN('exclusive','inclusive'))),
    CONSTRAINT CK_management_market_tax_withholding CHECK (
      (withholding_status='disabled' AND withholding_rate_basis_points=0
        AND withholding_basis='none' AND withholding_settlement_treatment='none') OR
      (withholding_status='enabled' AND withholding_rate_basis_points BETWEEN 1 AND 10000
        AND withholding_basis IN('platform_fee','gross_invoice')
        AND withholding_settlement_treatment='deducted_from_settlement'))
  );

EXEC(N'CREATE OR ALTER TRIGGER dbo.management_market_tax_rule_history
ON dbo.management_market_tax_rules AFTER UPDATE,DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS(SELECT 1 FROM deleted)
    THROW 51260, ''Approved tax-rule history is immutable. Schedule a new dated rule.'', 1;
END');

EXEC(N'CREATE OR ALTER FUNCTION dbo.management_market_tax_rule_at(@market CHAR(2),@at DATETIME2(7))
RETURNS TABLE AS RETURN (
  SELECT TOP (1) id,market,effective_at_utc,approval_reference,
    vat_status,vat_rate_basis_points,vat_invoice_treatment,
    withholding_status,withholding_rate_basis_points,withholding_basis,withholding_settlement_treatment
  FROM dbo.management_market_tax_rules
  WHERE market=@market AND effective_at_utc<=@at
  ORDER BY effective_at_utc DESC
)');

-- A signed row 34 instruction supplies the first LK record. This migration
-- intentionally seeds no rate, applicability decision or effective date.
COMMIT TRANSACTION;
