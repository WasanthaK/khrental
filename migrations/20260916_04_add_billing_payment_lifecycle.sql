SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
        THROW 50001, 'dbo.invoices must exist before applying the Phase 5 billing migration.', 1;

    IF OBJECT_ID(N'dbo.payments', N'U') IS NULL
        THROW 50002, 'dbo.payments must exist before applying the Phase 5 billing migration.', 1;

    -- Use dynamic SQL for additive columns because later statements in the same
    -- batch depend on them. This avoids SQL Server compile-time name resolution
    -- failures when the migration runs against the pre-Phase-5 schema.
    IF COL_LENGTH(N'dbo.invoices', N'agreementid') IS NULL
        EXEC(N'ALTER TABLE dbo.invoices ADD agreementid UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.invoices', N'issued_at') IS NULL
        EXEC(N'ALTER TABLE dbo.invoices ADD issued_at DATETIMEOFFSET NULL;');

    IF COL_LENGTH(N'dbo.invoices', N'issued_by') IS NULL
        EXEC(N'ALTER TABLE dbo.invoices ADD issued_by UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.invoices', N'reminderdate') IS NULL
        EXEC(N'ALTER TABLE dbo.invoices ADD reminderdate DATETIMEOFFSET NULL;');

    IF COL_LENGTH(N'dbo.payments', N'propertyid') IS NULL
        EXEC(N'ALTER TABLE dbo.payments ADD propertyid UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.payments', N'renteeid') IS NULL
        EXEC(N'ALTER TABLE dbo.payments ADD renteeid UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.payments', N'proofurl') IS NULL
        EXEC(N'ALTER TABLE dbo.payments ADD proofurl NVARCHAR(MAX) NULL;');

    IF COL_LENGTH(N'dbo.payments', N'submitted_by') IS NULL
        EXEC(N'ALTER TABLE dbo.payments ADD submitted_by UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.payments', N'submitted_at') IS NULL
        EXEC(N'ALTER TABLE dbo.payments ADD submitted_at DATETIMEOFFSET NULL;');

    IF COL_LENGTH(N'dbo.payments', N'verified_by') IS NULL
        EXEC(N'ALTER TABLE dbo.payments ADD verified_by UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.payments', N'verified_at') IS NULL
        EXEC(N'ALTER TABLE dbo.payments ADD verified_at DATETIMEOFFSET NULL;');

    IF COL_LENGTH(N'dbo.payments', N'rejection_reason') IS NULL
        EXEC(N'ALTER TABLE dbo.payments ADD rejection_reason NVARCHAR(MAX) NULL;');

    IF OBJECT_ID(N'dbo.invoice_components', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.invoice_components (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_invoice_components PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            invoice_id UNIQUEIDENTIFIER NOT NULL,
            component_type NVARCHAR(50) NOT NULL,
            description NVARCHAR(500) NULL,
            amount DECIMAL(18, 2) NOT NULL,
            source_type NVARCHAR(100) NULL,
            source_id UNIQUEIDENTIFIER NULL,
            metadata NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_invoice_components_createdat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_invoice_components_type CHECK (
                component_type IN (N'rent', N'electricity', N'water', N'utility', N'arrears', N'tax', N'adjustment', N'other')
            ),
            CONSTRAINT CK_invoice_components_amount CHECK (amount <> 0)
        );
    END;

    IF OBJECT_ID(N'dbo.payment_receipts', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.payment_receipts (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_payment_receipts PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            payment_id UNIQUEIDENTIFIER NOT NULL,
            invoice_id UNIQUEIDENTIFIER NOT NULL,
            receipt_number NVARCHAR(100) NOT NULL,
            amount DECIMAL(18, 2) NOT NULL,
            issued_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_payment_receipts_issued_at DEFAULT SYSUTCDATETIME(),
            issued_by UNIQUEIDENTIFIER NULL,
            snapshot NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_payment_receipts_createdat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_payment_receipts_amount CHECK (amount > 0)
        );
    END;

    IF OBJECT_ID(N'dbo.billing_lifecycle_events', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.billing_lifecycle_events (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_billing_lifecycle_events PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            invoice_id UNIQUEIDENTIFIER NULL,
            payment_id UNIQUEIDENTIFIER NULL,
            event_type NVARCHAR(100) NOT NULL,
            from_status NVARCHAR(50) NULL,
            to_status NVARCHAR(50) NULL,
            actor_user_id UNIQUEIDENTIFIER NULL,
            metadata NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_billing_lifecycle_events_createdat DEFAULT SYSUTCDATETIME()
        );
    END;

    IF OBJECT_ID(N'dbo.agreements', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_invoices_agreement')
        EXEC(N'ALTER TABLE dbo.invoices ADD CONSTRAINT FK_invoices_agreement FOREIGN KEY (agreementid) REFERENCES dbo.agreements(id);');

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_invoices_issued_by')
        EXEC(N'ALTER TABLE dbo.invoices ADD CONSTRAINT FK_invoices_issued_by FOREIGN KEY (issued_by) REFERENCES dbo.app_users(id);');

    IF OBJECT_ID(N'dbo.properties', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_payments_property')
        EXEC(N'ALTER TABLE dbo.payments ADD CONSTRAINT FK_payments_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id);');

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_payments_rentee')
        EXEC(N'ALTER TABLE dbo.payments ADD CONSTRAINT FK_payments_rentee FOREIGN KEY (renteeid) REFERENCES dbo.app_users(id);');

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_payments_submitted_by')
        EXEC(N'ALTER TABLE dbo.payments ADD CONSTRAINT FK_payments_submitted_by FOREIGN KEY (submitted_by) REFERENCES dbo.app_users(id);');

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_payments_verified_by')
        EXEC(N'ALTER TABLE dbo.payments ADD CONSTRAINT FK_payments_verified_by FOREIGN KEY (verified_by) REFERENCES dbo.app_users(id);');

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_invoice_components_tenant')
        ALTER TABLE dbo.invoice_components ADD CONSTRAINT FK_invoice_components_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_invoice_components_invoice')
        ALTER TABLE dbo.invoice_components ADD CONSTRAINT FK_invoice_components_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id) ON DELETE CASCADE;

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_payment_receipts_tenant')
        ALTER TABLE dbo.payment_receipts ADD CONSTRAINT FK_payment_receipts_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_payment_receipts_payment')
        ALTER TABLE dbo.payment_receipts ADD CONSTRAINT FK_payment_receipts_payment FOREIGN KEY (payment_id) REFERENCES dbo.payments(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_payment_receipts_invoice')
        ALTER TABLE dbo.payment_receipts ADD CONSTRAINT FK_payment_receipts_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_payment_receipts_issued_by')
        ALTER TABLE dbo.payment_receipts ADD CONSTRAINT FK_payment_receipts_issued_by FOREIGN KEY (issued_by) REFERENCES dbo.app_users(id);

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_billing_lifecycle_events_tenant')
        ALTER TABLE dbo.billing_lifecycle_events ADD CONSTRAINT FK_billing_lifecycle_events_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_billing_lifecycle_events_invoice')
        ALTER TABLE dbo.billing_lifecycle_events ADD CONSTRAINT FK_billing_lifecycle_events_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_billing_lifecycle_events_payment')
        ALTER TABLE dbo.billing_lifecycle_events ADD CONSTRAINT FK_billing_lifecycle_events_payment FOREIGN KEY (payment_id) REFERENCES dbo.payments(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_billing_lifecycle_events_actor')
        ALTER TABLE dbo.billing_lifecycle_events ADD CONSTRAINT FK_billing_lifecycle_events_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.app_users(id);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoices') AND name = N'IX_invoices_agreementid')
        EXEC(N'CREATE INDEX IX_invoices_agreementid ON dbo.invoices (tenant_id, agreementid, billingperiod);');

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoices') AND name = N'UX_invoices_tenancy_billing_period')
        EXEC(N'CREATE UNIQUE INDEX UX_invoices_tenancy_billing_period
            ON dbo.invoices (tenant_id, agreementid, billingperiod)
            WHERE agreementid IS NOT NULL AND billingperiod IS NOT NULL;');

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.payments') AND name = N'IX_payments_invoice_status')
        CREATE INDEX IX_payments_invoice_status ON dbo.payments (tenant_id, invoiceid, status, createdat);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoice_components') AND name = N'IX_invoice_components_invoice')
        CREATE INDEX IX_invoice_components_invoice ON dbo.invoice_components (tenant_id, invoice_id, component_type);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.payment_receipts') AND name = N'UX_payment_receipts_payment')
        CREATE UNIQUE INDEX UX_payment_receipts_payment ON dbo.payment_receipts (tenant_id, payment_id);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.payment_receipts') AND name = N'UX_payment_receipts_number')
        CREATE UNIQUE INDEX UX_payment_receipts_number ON dbo.payment_receipts (tenant_id, receipt_number);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.billing_lifecycle_events') AND name = N'IX_billing_lifecycle_events_invoice')
        CREATE INDEX IX_billing_lifecycle_events_invoice ON dbo.billing_lifecycle_events (tenant_id, invoice_id, createdat DESC);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
