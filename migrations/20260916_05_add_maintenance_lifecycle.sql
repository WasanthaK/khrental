SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.maintenance_requests', N'U') IS NULL
        THROW 50001, 'dbo.maintenance_requests must exist before applying the maintenance lifecycle migration.', 1;

    -- Dynamic SQL is intentional for additive columns that are referenced later
    -- in this same batch. It avoids SQL Server compile-time name-resolution errors
    -- against the pre-Phase-6 schema.
    IF COL_LENGTH(N'dbo.maintenance_requests', N'agreementid') IS NULL
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD agreementid UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.maintenance_requests', N'unitid') IS NULL
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD unitid UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.maintenance_requests', N'assigned_by') IS NULL
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD assigned_by UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.maintenance_requests', N'completed_by') IS NULL
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD completed_by UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.maintenance_requests', N'cancelled_by') IS NULL
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD cancelled_by UNIQUEIDENTIFIER NULL;');

    IF COL_LENGTH(N'dbo.maintenance_requests', N'completion_cost') IS NULL
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD completion_cost DECIMAL(18, 2) NULL;');

    IF OBJECT_ID(N'dbo.maintenance_request_comments', N'U') IS NOT NULL
       AND COL_LENGTH(N'dbo.maintenance_request_comments', N'is_internal') IS NULL
        EXEC(N'ALTER TABLE dbo.maintenance_request_comments ADD is_internal BIT NOT NULL CONSTRAINT DF_maintenance_request_comments_internal DEFAULT 0;');

    IF OBJECT_ID(N'dbo.maintenance_lifecycle_events', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.maintenance_lifecycle_events (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_maintenance_lifecycle_events PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            maintenance_request_id UNIQUEIDENTIFIER NOT NULL,
            event_type NVARCHAR(100) NOT NULL,
            from_status NVARCHAR(50) NULL,
            to_status NVARCHAR(50) NULL,
            actor_user_id UNIQUEIDENTIFIER NULL,
            metadata NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_maintenance_lifecycle_events_createdat DEFAULT SYSUTCDATETIME()
        );
    END;

    IF OBJECT_ID(N'dbo.agreements', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_maintenance_requests_agreement')
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD CONSTRAINT FK_maintenance_requests_agreement FOREIGN KEY (agreementid) REFERENCES dbo.agreements(id);');

    IF OBJECT_ID(N'dbo.property_units', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_maintenance_requests_unit')
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD CONSTRAINT FK_maintenance_requests_unit FOREIGN KEY (unitid) REFERENCES dbo.property_units(id);');

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_maintenance_requests_assigned_by')
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD CONSTRAINT FK_maintenance_requests_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.app_users(id);');

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_maintenance_requests_completed_by')
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD CONSTRAINT FK_maintenance_requests_completed_by FOREIGN KEY (completed_by) REFERENCES dbo.app_users(id);');

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_maintenance_requests_cancelled_by')
        EXEC(N'ALTER TABLE dbo.maintenance_requests ADD CONSTRAINT FK_maintenance_requests_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES dbo.app_users(id);');

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_maintenance_lifecycle_events_tenant')
        ALTER TABLE dbo.maintenance_lifecycle_events ADD CONSTRAINT FK_maintenance_lifecycle_events_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id);

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_maintenance_lifecycle_events_request')
        ALTER TABLE dbo.maintenance_lifecycle_events ADD CONSTRAINT FK_maintenance_lifecycle_events_request FOREIGN KEY (maintenance_request_id) REFERENCES dbo.maintenance_requests(id) ON DELETE CASCADE;

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_maintenance_lifecycle_events_actor')
        ALTER TABLE dbo.maintenance_lifecycle_events ADD CONSTRAINT FK_maintenance_lifecycle_events_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.app_users(id);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.maintenance_requests') AND name = N'IX_maintenance_requests_agreement')
        EXEC(N'CREATE INDEX IX_maintenance_requests_agreement ON dbo.maintenance_requests (tenant_id, agreementid, status);');

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.maintenance_requests') AND name = N'IX_maintenance_requests_assigned')
        CREATE INDEX IX_maintenance_requests_assigned ON dbo.maintenance_requests (tenant_id, assignedto, status);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.maintenance_lifecycle_events') AND name = N'IX_maintenance_lifecycle_events_request')
        CREATE INDEX IX_maintenance_lifecycle_events_request ON dbo.maintenance_lifecycle_events (tenant_id, maintenance_request_id, createdat DESC);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
