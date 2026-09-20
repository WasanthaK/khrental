SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.agreements', N'U') IS NULL
        THROW 50001, 'dbo.agreements must exist before applying the billing-adjustment migration.', 1;

    IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
        THROW 50002, 'dbo.invoices must exist before applying the billing-adjustment migration.', 1;

    IF OBJECT_ID(N'dbo.tenancy_billing_adjustments', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_billing_adjustments (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_billing_adjustments PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            agreement_id UNIQUEIDENTIFIER NOT NULL,
            billing_period NVARCHAR(7) NOT NULL,
            component_type NVARCHAR(50) NOT NULL,
            description NVARCHAR(500) NOT NULL,
            amount DECIMAL(18, 2) NOT NULL,
            status NVARCHAR(30) NOT NULL CONSTRAINT DF_tenancy_billing_adjustments_status DEFAULT N'approved',
            invoice_id UNIQUEIDENTIFIER NULL,
            created_by UNIQUEIDENTIFIER NOT NULL,
            created_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_billing_adjustments_created_at DEFAULT SYSUTCDATETIME(),
            approved_by UNIQUEIDENTIFIER NOT NULL,
            approved_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_billing_adjustments_approved_at DEFAULT SYSUTCDATETIME(),
            voided_by UNIQUEIDENTIFIER NULL,
            voided_at DATETIMEOFFSET NULL,
            void_reason NVARCHAR(500) NULL,
            metadata NVARCHAR(MAX) NULL,
            CONSTRAINT CK_tenancy_billing_adjustments_type CHECK (
                component_type IN (N'arrears', N'tax', N'adjustment', N'other')
            ),
            CONSTRAINT CK_tenancy_billing_adjustments_amount CHECK (
                (component_type = N'adjustment' AND amount <> 0)
                OR (component_type IN (N'arrears', N'tax', N'other') AND amount > 0)
            ),
            CONSTRAINT CK_tenancy_billing_adjustments_status CHECK (
                status IN (N'approved', N'voided')
            )
        );
    END;

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_billing_adjustments_tenant')
        ALTER TABLE dbo.tenancy_billing_adjustments
            ADD CONSTRAINT FK_tenancy_billing_adjustments_tenant
            FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_billing_adjustments_agreement')
        ALTER TABLE dbo.tenancy_billing_adjustments
            ADD CONSTRAINT FK_tenancy_billing_adjustments_agreement
            FOREIGN KEY (agreement_id) REFERENCES dbo.agreements(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_billing_adjustments_invoice')
        ALTER TABLE dbo.tenancy_billing_adjustments
            ADD CONSTRAINT FK_tenancy_billing_adjustments_invoice
            FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_billing_adjustments_created_by')
        ALTER TABLE dbo.tenancy_billing_adjustments
            ADD CONSTRAINT FK_tenancy_billing_adjustments_created_by
            FOREIGN KEY (created_by) REFERENCES dbo.app_users(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_billing_adjustments_approved_by')
        ALTER TABLE dbo.tenancy_billing_adjustments
            ADD CONSTRAINT FK_tenancy_billing_adjustments_approved_by
            FOREIGN KEY (approved_by) REFERENCES dbo.app_users(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_billing_adjustments_voided_by')
        ALTER TABLE dbo.tenancy_billing_adjustments
            ADD CONSTRAINT FK_tenancy_billing_adjustments_voided_by
            FOREIGN KEY (voided_by) REFERENCES dbo.app_users(id);

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.tenancy_billing_adjustments')
          AND name = N'IX_tenancy_billing_adjustments_pending'
    )
        CREATE INDEX IX_tenancy_billing_adjustments_pending
            ON dbo.tenancy_billing_adjustments (
                tenant_id, agreement_id, billing_period, status, invoice_id, created_at
            );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
