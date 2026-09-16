SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.agreements', N'U') IS NULL
        THROW 50001, 'dbo.agreements must exist before applying the tenancy exit migration.', 1;

    IF OBJECT_ID(N'dbo.tenancy_deposit_transactions', N'U') IS NULL
        THROW 50002, 'Phase 4 tenancy onboarding migration must be applied first.', 1;

    IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL OR COL_LENGTH(N'dbo.invoices', N'agreementid') IS NULL
        THROW 50003, 'Phase 5 billing migration must be applied before tenancy exit/settlement.', 1;

    -- Dynamic SQL is intentional for additive agreement columns that are
    -- referenced later in this same batch. This avoids SQL Server compile-time
    -- name-resolution failures against the pre-Phase-7 schema.
    IF COL_LENGTH(N'dbo.agreements', N'renewed_from_agreement_id') IS NULL
        EXEC(N'ALTER TABLE dbo.agreements ADD renewed_from_agreement_id UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.agreements', N'closed_at') IS NULL
        EXEC(N'ALTER TABLE dbo.agreements ADD closed_at DATETIMEOFFSET NULL;');

    IF COL_LENGTH(N'dbo.agreements', N'closed_by') IS NULL
        EXEC(N'ALTER TABLE dbo.agreements ADD closed_by UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.agreements', N'closure_reason') IS NULL
        EXEC(N'ALTER TABLE dbo.agreements ADD closure_reason NVARCHAR(MAX) NULL;');

    IF OBJECT_ID(N'dbo.tenancy_notices', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_notices (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_notices PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            agreement_id UNIQUEIDENTIFIER NOT NULL,
            notice_type NVARCHAR(50) NOT NULL,
            status NVARCHAR(30) NOT NULL CONSTRAINT DF_tenancy_notices_status DEFAULT N'draft',
            notice_date DATE NOT NULL,
            effective_date DATE NULL,
            content NVARCHAR(MAX) NULL,
            created_by UNIQUEIDENTIFIER NULL,
            sent_at DATETIMEOFFSET NULL,
            responded_by UNIQUEIDENTIFIER NULL,
            responded_at DATETIMEOFFSET NULL,
            response_notes NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_notices_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_notices_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_tenancy_notices_type CHECK (notice_type IN (N'renewal_offer', N'termination_notice')),
            CONSTRAINT CK_tenancy_notices_status CHECK (status IN (N'draft', N'sent', N'accepted', N'declined', N'acknowledged', N'withdrawn'))
        );
    END;

    IF OBJECT_ID(N'dbo.tenancy_move_out_inspections', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_move_out_inspections (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_move_out_inspections PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            agreement_id UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NOT NULL,
            unitid UNIQUEIDENTIFIER NULL,
            status NVARCHAR(30) NOT NULL CONSTRAINT DF_tenancy_move_out_inspections_status DEFAULT N'open',
            inspection_date DATETIMEOFFSET NULL,
            notes NVARCHAR(MAX) NULL,
            created_by UNIQUEIDENTIFIER NULL,
            completed_by UNIQUEIDENTIFIER NULL,
            completed_at DATETIMEOFFSET NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_move_out_inspections_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_move_out_inspections_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_tenancy_move_out_inspections_status CHECK (status IN (N'open', N'completed'))
        );
    END;

    IF OBJECT_ID(N'dbo.tenancy_move_out_inspection_items', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_move_out_inspection_items (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_move_out_inspection_items PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            inspection_id UNIQUEIDENTIFIER NOT NULL,
            item_order INT NOT NULL,
            label NVARCHAR(500) NOT NULL,
            condition_status NVARCHAR(30) NOT NULL CONSTRAINT DF_tenancy_move_out_items_condition DEFAULT N'pending',
            notes NVARCHAR(MAX) NULL,
            proposed_deduction DECIMAL(18,2) NULL,
            completed_by UNIQUEIDENTIFIER NULL,
            completed_at DATETIMEOFFSET NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_move_out_items_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_move_out_items_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_tenancy_move_out_items_condition CHECK (condition_status IN (N'pending', N'good', N'damaged', N'missing', N'not_applicable')),
            CONSTRAINT CK_tenancy_move_out_items_deduction CHECK (proposed_deduction IS NULL OR proposed_deduction >= 0)
        );
    END;

    IF OBJECT_ID(N'dbo.tenancy_settlements', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_settlements (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_settlements PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            agreement_id UNIQUEIDENTIFIER NOT NULL,
            status NVARCHAR(30) NOT NULL CONSTRAINT DF_tenancy_settlements_status DEFAULT N'draft',
            deposit_received DECIMAL(18,2) NOT NULL CONSTRAINT DF_tenancy_settlements_deposit DEFAULT 0,
            approved_deductions DECIMAL(18,2) NOT NULL CONSTRAINT DF_tenancy_settlements_deductions DEFAULT 0,
            outstanding_invoices DECIMAL(18,2) NOT NULL CONSTRAINT DF_tenancy_settlements_outstanding DEFAULT 0,
            refund_amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_tenancy_settlements_refund DEFAULT 0,
            amount_due DECIMAL(18,2) NOT NULL CONSTRAINT DF_tenancy_settlements_due DEFAULT 0,
            notes NVARCHAR(MAX) NULL,
            approved_by UNIQUEIDENTIFIER NULL,
            approved_at DATETIMEOFFSET NULL,
            settled_by UNIQUEIDENTIFIER NULL,
            settled_at DATETIMEOFFSET NULL,
            settlement_reference NVARCHAR(255) NULL,
            created_by UNIQUEIDENTIFIER NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_settlements_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_settlements_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_tenancy_settlements_status CHECK (status IN (N'draft', N'approved', N'settled', N'voided')),
            CONSTRAINT CK_tenancy_settlements_amounts CHECK (
                deposit_received >= 0 AND approved_deductions >= 0 AND outstanding_invoices >= 0 AND refund_amount >= 0 AND amount_due >= 0
            )
        );
    END;

    IF OBJECT_ID(N'dbo.tenancy_settlement_items', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_settlement_items (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_settlement_items PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            settlement_id UNIQUEIDENTIFIER NOT NULL,
            item_type NVARCHAR(50) NOT NULL,
            description NVARCHAR(500) NOT NULL,
            amount DECIMAL(18,2) NOT NULL,
            status NVARCHAR(30) NOT NULL CONSTRAINT DF_tenancy_settlement_items_status DEFAULT N'proposed',
            source_type NVARCHAR(100) NULL,
            source_id UNIQUEIDENTIFIER NULL,
            notes NVARCHAR(MAX) NULL,
            reviewed_by UNIQUEIDENTIFIER NULL,
            reviewed_at DATETIMEOFFSET NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_settlement_items_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_settlement_items_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_tenancy_settlement_items_type CHECK (item_type IN (N'damage', N'arrears', N'utility', N'cleaning', N'other')),
            CONSTRAINT CK_tenancy_settlement_items_status CHECK (status IN (N'proposed', N'approved', N'rejected')),
            CONSTRAINT CK_tenancy_settlement_items_amount CHECK (amount >= 0)
        );
    END;

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_notices_tenant')
        ALTER TABLE dbo.tenancy_notices ADD CONSTRAINT FK_tenancy_notices_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_notices_agreement')
        ALTER TABLE dbo.tenancy_notices ADD CONSTRAINT FK_tenancy_notices_agreement FOREIGN KEY (agreement_id) REFERENCES dbo.agreements(id);

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_out_inspections_tenant')
        ALTER TABLE dbo.tenancy_move_out_inspections ADD CONSTRAINT FK_tenancy_move_out_inspections_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_out_inspections_agreement')
        ALTER TABLE dbo.tenancy_move_out_inspections ADD CONSTRAINT FK_tenancy_move_out_inspections_agreement FOREIGN KEY (agreement_id) REFERENCES dbo.agreements(id);

    IF OBJECT_ID(N'dbo.properties', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_out_inspections_property')
        ALTER TABLE dbo.tenancy_move_out_inspections ADD CONSTRAINT FK_tenancy_move_out_inspections_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id);

    IF OBJECT_ID(N'dbo.property_units', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_out_inspections_unit')
        ALTER TABLE dbo.tenancy_move_out_inspections ADD CONSTRAINT FK_tenancy_move_out_inspections_unit FOREIGN KEY (unitid) REFERENCES dbo.property_units(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_out_items_inspection')
        ALTER TABLE dbo.tenancy_move_out_inspection_items ADD CONSTRAINT FK_tenancy_move_out_items_inspection FOREIGN KEY (inspection_id) REFERENCES dbo.tenancy_move_out_inspections(id) ON DELETE CASCADE;

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_settlements_tenant')
        ALTER TABLE dbo.tenancy_settlements ADD CONSTRAINT FK_tenancy_settlements_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_settlements_agreement')
        ALTER TABLE dbo.tenancy_settlements ADD CONSTRAINT FK_tenancy_settlements_agreement FOREIGN KEY (agreement_id) REFERENCES dbo.agreements(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_settlement_items_settlement')
        ALTER TABLE dbo.tenancy_settlement_items ADD CONSTRAINT FK_tenancy_settlement_items_settlement FOREIGN KEY (settlement_id) REFERENCES dbo.tenancy_settlements(id) ON DELETE CASCADE;

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_agreements_renewed_from')
        EXEC(N'ALTER TABLE dbo.agreements ADD CONSTRAINT FK_agreements_renewed_from FOREIGN KEY (renewed_from_agreement_id) REFERENCES dbo.agreements(id);');

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_agreements_closed_by')
            EXEC(N'ALTER TABLE dbo.agreements ADD CONSTRAINT FK_agreements_closed_by FOREIGN KEY (closed_by) REFERENCES dbo.app_users(id);');

        IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_notices_created_by')
            ALTER TABLE dbo.tenancy_notices ADD CONSTRAINT FK_tenancy_notices_created_by FOREIGN KEY (created_by) REFERENCES dbo.app_users(id);

        IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_notices_responded_by')
            ALTER TABLE dbo.tenancy_notices ADD CONSTRAINT FK_tenancy_notices_responded_by FOREIGN KEY (responded_by) REFERENCES dbo.app_users(id);

        IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_settlements_created_by')
            ALTER TABLE dbo.tenancy_settlements ADD CONSTRAINT FK_tenancy_settlements_created_by FOREIGN KEY (created_by) REFERENCES dbo.app_users(id);
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.tenancy_notices') AND name = N'IX_tenancy_notices_agreement')
        CREATE INDEX IX_tenancy_notices_agreement ON dbo.tenancy_notices (tenant_id, agreement_id, notice_type, createdat DESC);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.tenancy_move_out_inspections') AND name = N'UX_tenancy_move_out_inspection_agreement')
        CREATE UNIQUE INDEX UX_tenancy_move_out_inspection_agreement ON dbo.tenancy_move_out_inspections (tenant_id, agreement_id);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.tenancy_settlements') AND name = N'UX_tenancy_settlement_agreement')
        CREATE UNIQUE INDEX UX_tenancy_settlement_agreement ON dbo.tenancy_settlements (tenant_id, agreement_id);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.tenancy_settlement_items') AND name = N'IX_tenancy_settlement_items_settlement')
        CREATE INDEX IX_tenancy_settlement_items_settlement ON dbo.tenancy_settlement_items (tenant_id, settlement_id, status);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
