SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.utility_configs', N'U') IS NULL
        THROW 50001, 'dbo.utility_configs does not exist.', 1;

    IF COL_LENGTH(N'dbo.utility_configs', N'propertyid') IS NULL
    BEGIN
        ALTER TABLE dbo.utility_configs
            ADD propertyid UNIQUEIDENTIFIER NULL;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.utility_configs')
          AND name = N'FK_utility_configs_property'
    )
    BEGIN
        EXEC(N'
            ALTER TABLE dbo.utility_configs
                ADD CONSTRAINT FK_utility_configs_property
                FOREIGN KEY (propertyid) REFERENCES dbo.properties(id);
        ');
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.utility_configs')
          AND name = N'IX_utility_configs_propertyid'
    )
    BEGIN
        EXEC(N'
            CREATE INDEX IX_utility_configs_propertyid
                ON dbo.utility_configs(propertyid);
        ');
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.utility_configs')
          AND name = N'UX_utility_configs_property_rule'
    )
    BEGIN
        EXEC(N'
            CREATE UNIQUE INDEX UX_utility_configs_property_rule
                ON dbo.utility_configs(tenant_id, propertyid, utilitytype, billingtype)
                WHERE propertyid IS NOT NULL;
        ');
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
