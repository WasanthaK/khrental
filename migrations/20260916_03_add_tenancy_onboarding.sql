SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.agreements', N'U') IS NULL
        THROW 50001, 'dbo.agreements must exist before applying the Phase 4 tenancy onboarding migration.', 1;

    IF COL_LENGTH(N'dbo.agreements', N'activated_at') IS NULL
        ALTER TABLE dbo.agreements ADD activated_at DATETIMEOFFSET NULL;

    IF COL_LENGTH(N'dbo.agreements', N'activated_by') IS NULL
        ALTER TABLE dbo.agreements ADD activated_by UNIQUEIDENTIFIER NULL;

    IF OBJECT_ID(N'dbo.tenancy_deposit_transactions', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_deposit_transactions (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_deposit_transactions PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            agreement_id UNIQUEIDENTIFIER NOT NULL,
            renteeid UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NOT NULL,
            unitid UNIQUEIDENTIFIER NULL,
            transaction_type NVARCHAR(50) NOT NULL,
            amount DECIMAL(18, 2) NOT NULL,
            status NVARCHAR(30) NOT NULL CONSTRAINT DF_tenancy_deposit_transactions_status DEFAULT N'received',
            payment_method NVARCHAR(100) NULL,
            payment_reference NVARCHAR(255) NULL,
            received_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_deposit_transactions_received_at DEFAULT SYSUTCDATETIME(),
            notes NVARCHAR(MAX) NULL,
            recorded_by UNIQUEIDENTIFIER NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_deposit_transactions_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_deposit_transactions_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_tenancy_deposit_transactions_type CHECK (transaction_type IN (N'confirmation_advance', N'security_deposit')),
            CONSTRAINT CK_tenancy_deposit_transactions_amount CHECK (amount > 0),
            CONSTRAINT CK_tenancy_deposit_transactions_status CHECK (status IN (N'received', N'voided'))
        );
    END;

    IF OBJECT_ID(N'dbo.tenancy_move_in_checklists', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_move_in_checklists (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_move_in_checklists PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            agreement_id UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NOT NULL,
            unitid UNIQUEIDENTIFIER NULL,
            status NVARCHAR(30) NOT NULL CONSTRAINT DF_tenancy_move_in_checklists_status DEFAULT N'open',
            created_by UNIQUEIDENTIFIER NULL,
            completed_by UNIQUEIDENTIFIER NULL,
            completed_at DATETIMEOFFSET NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_move_in_checklists_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_move_in_checklists_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_tenancy_move_in_checklists_status CHECK (status IN (N'open', N'completed'))
        );
    END;

    IF OBJECT_ID(N'dbo.tenancy_move_in_checklist_items', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_move_in_checklist_items (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_move_in_checklist_items PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            checklist_id UNIQUEIDENTIFIER NOT NULL,
            item_order INT NOT NULL,
            label NVARCHAR(500) NOT NULL,
            is_required BIT NOT NULL CONSTRAINT DF_tenancy_move_in_checklist_items_required DEFAULT 1,
            status NVARCHAR(30) NOT NULL CONSTRAINT DF_tenancy_move_in_checklist_items_status DEFAULT N'pending',
            notes NVARCHAR(MAX) NULL,
            completed_by UNIQUEIDENTIFIER NULL,
            completed_at DATETIMEOFFSET NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_move_in_checklist_items_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_move_in_checklist_items_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_tenancy_move_in_checklist_items_status CHECK (status IN (N'pending', N'completed'))
        );
    END;

    IF OBJECT_ID(N'dbo.tenancy_lifecycle_events', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.tenancy_lifecycle_events (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_tenancy_lifecycle_events PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            agreement_id UNIQUEIDENTIFIER NOT NULL,
            event_type NVARCHAR(100) NOT NULL,
            from_status NVARCHAR(50) NULL,
            to_status NVARCHAR(50) NULL,
            actor_user_id UNIQUEIDENTIFIER NULL,
            metadata NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_tenancy_lifecycle_events_createdat DEFAULT SYSUTCDATETIME()
        );
    END;

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_deposit_transactions_tenant')
        ALTER TABLE dbo.tenancy_deposit_transactions ADD CONSTRAINT FK_tenancy_deposit_transactions_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_deposit_transactions_agreement')
        ALTER TABLE dbo.tenancy_deposit_transactions ADD CONSTRAINT FK_tenancy_deposit_transactions_agreement FOREIGN KEY (agreement_id) REFERENCES dbo.agreements(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_deposit_transactions_rentee')
        ALTER TABLE dbo.tenancy_deposit_transactions ADD CONSTRAINT FK_tenancy_deposit_transactions_rentee FOREIGN KEY (renteeid) REFERENCES dbo.app_users(id);

    IF OBJECT_ID(N'dbo.properties', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_deposit_transactions_property')
        ALTER TABLE dbo.tenancy_deposit_transactions ADD CONSTRAINT FK_tenancy_deposit_transactions_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id);

    IF OBJECT_ID(N'dbo.property_units', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_deposit_transactions_unit')
        ALTER TABLE dbo.tenancy_deposit_transactions ADD CONSTRAINT FK_tenancy_deposit_transactions_unit FOREIGN KEY (unitid) REFERENCES dbo.property_units(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_deposit_transactions_recorded_by')
        ALTER TABLE dbo.tenancy_deposit_transactions ADD CONSTRAINT FK_tenancy_deposit_transactions_recorded_by FOREIGN KEY (recorded_by) REFERENCES dbo.app_users(id);

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_in_checklists_tenant')
        ALTER TABLE dbo.tenancy_move_in_checklists ADD CONSTRAINT FK_tenancy_move_in_checklists_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_in_checklists_agreement')
        ALTER TABLE dbo.tenancy_move_in_checklists ADD CONSTRAINT FK_tenancy_move_in_checklists_agreement FOREIGN KEY (agreement_id) REFERENCES dbo.agreements(id);

    IF OBJECT_ID(N'dbo.properties', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_in_checklists_property')
        ALTER TABLE dbo.tenancy_move_in_checklists ADD CONSTRAINT FK_tenancy_move_in_checklists_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id);

    IF OBJECT_ID(N'dbo.property_units', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_in_checklists_unit')
        ALTER TABLE dbo.tenancy_move_in_checklists ADD CONSTRAINT FK_tenancy_move_in_checklists_unit FOREIGN KEY (unitid) REFERENCES dbo.property_units(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_in_checklists_created_by')
        ALTER TABLE dbo.tenancy_move_in_checklists ADD CONSTRAINT FK_tenancy_move_in_checklists_created_by FOREIGN KEY (created_by) REFERENCES dbo.app_users(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_in_checklists_completed_by')
        ALTER TABLE dbo.tenancy_move_in_checklists ADD CONSTRAINT FK_tenancy_move_in_checklists_completed_by FOREIGN KEY (completed_by) REFERENCES dbo.app_users(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_in_checklist_items_checklist')
        ALTER TABLE dbo.tenancy_move_in_checklist_items ADD CONSTRAINT FK_tenancy_move_in_checklist_items_checklist FOREIGN KEY (checklist_id) REFERENCES dbo.tenancy_move_in_checklists(id);

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_in_checklist_items_tenant')
        ALTER TABLE dbo.tenancy_move_in_checklist_items ADD CONSTRAINT FK_tenancy_move_in_checklist_items_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_move_in_checklist_items_completed_by')
        ALTER TABLE dbo.tenancy_move_in_checklist_items ADD CONSTRAINT FK_tenancy_move_in_checklist_items_completed_by FOREIGN KEY (completed_by) REFERENCES dbo.app_users(id);

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_lifecycle_events_tenant')
        ALTER TABLE dbo.tenancy_lifecycle_events ADD CONSTRAINT FK_tenancy_lifecycle_events_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_lifecycle_events_agreement')
        ALTER TABLE dbo.tenancy_lifecycle_events ADD CONSTRAINT FK_tenancy_lifecycle_events_agreement FOREIGN KEY (agreement_id) REFERENCES dbo.agreements(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_tenancy_lifecycle_events_actor')
        ALTER TABLE dbo.tenancy_lifecycle_events ADD CONSTRAINT FK_tenancy_lifecycle_events_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.app_users(id);

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_agreements_activated_by')
        ALTER TABLE dbo.agreements ADD CONSTRAINT FK_agreements_activated_by FOREIGN KEY (activated_by) REFERENCES dbo.app_users(id);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.tenancy_deposit_transactions') AND name = N'IX_tenancy_deposit_transactions_agreement')
        CREATE INDEX IX_tenancy_deposit_transactions_agreement ON dbo.tenancy_deposit_transactions (tenant_id, agreement_id, status, transaction_type);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.tenancy_move_in_checklists') AND name = N'UX_tenancy_move_in_checklists_agreement')
        CREATE UNIQUE INDEX UX_tenancy_move_in_checklists_agreement ON dbo.tenancy_move_in_checklists (tenant_id, agreement_id);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.tenancy_move_in_checklist_items') AND name = N'IX_tenancy_move_in_checklist_items_checklist')
        CREATE INDEX IX_tenancy_move_in_checklist_items_checklist ON dbo.tenancy_move_in_checklist_items (tenant_id, checklist_id, item_order);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.tenancy_lifecycle_events') AND name = N'IX_tenancy_lifecycle_events_agreement')
        CREATE INDEX IX_tenancy_lifecycle_events_agreement ON dbo.tenancy_lifecycle_events (tenant_id, agreement_id, createdat DESC);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.agreements') AND name = N'UX_agreements_active_unit')
        CREATE UNIQUE INDEX UX_agreements_active_unit ON dbo.agreements (tenant_id, unitid) WHERE status = N'active' AND unitid IS NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.agreements') AND name = N'UX_agreements_active_property_without_unit')
        CREATE UNIQUE INDEX UX_agreements_active_property_without_unit ON dbo.agreements (tenant_id, propertyid) WHERE status = N'active' AND unitid IS NULL AND propertyid IS NOT NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;