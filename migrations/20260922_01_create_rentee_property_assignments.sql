SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.tenants', N'U') IS NULL
        THROW 50001, 'dbo.tenants must exist before renter property assignments can be created.', 1;

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
        THROW 50002, 'dbo.app_users must exist before renter property assignments can be created.', 1;

    IF OBJECT_ID(N'dbo.tenant_memberships', N'U') IS NULL
        THROW 50003, 'dbo.tenant_memberships must exist before renter property assignments can be created.', 1;

    IF OBJECT_ID(N'dbo.properties', N'U') IS NULL
        THROW 50004, 'dbo.properties must exist before renter property assignments can be created.', 1;

    IF OBJECT_ID(N'dbo.rentee_property_assignments', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.rentee_property_assignments (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_rentee_property_assignments PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            app_user_id UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NOT NULL,
            unitid UNIQUEIDENTIFIER NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_rentee_property_assignments_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_rentee_property_assignments_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_rentee_property_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_rentee_property_assignments_app_user FOREIGN KEY (app_user_id) REFERENCES dbo.app_users(id) ON DELETE CASCADE,
            CONSTRAINT FK_rentee_property_assignments_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id),
            CONSTRAINT FK_rentee_property_assignments_unit FOREIGN KEY (unitid) REFERENCES dbo.property_units(id)
        );
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.rentee_property_assignments')
          AND name = N'UX_rentee_property_assignments_scope'
    )
    BEGIN
        CREATE UNIQUE INDEX UX_rentee_property_assignments_scope
            ON dbo.rentee_property_assignments (tenant_id, app_user_id, propertyid, unitid);
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.rentee_property_assignments')
          AND name = N'IX_rentee_property_assignments_renter'
    )
    BEGIN
        CREATE INDEX IX_rentee_property_assignments_renter
            ON dbo.rentee_property_assignments (tenant_id, app_user_id);
    END;

    -- Backfill only associations that can be proven to belong to the same
    -- organization as an existing renter membership. Legacy app_users fields are
    -- global, so property ownership is used to avoid copying one organization's
    -- assignments into another organization's membership.
    IF COL_LENGTH(N'dbo.app_users', N'associated_property_ids') IS NOT NULL
    BEGIN
        INSERT INTO dbo.rentee_property_assignments (
            tenant_id,
            app_user_id,
            propertyid,
            unitid
        )
        SELECT DISTINCT
            p.tenant_id,
            au.id,
            p.id,
            NULL
        FROM dbo.app_users au
        CROSS APPLY OPENJSON(
            CASE WHEN ISJSON(au.associated_property_ids) = 1 THEN au.associated_property_ids ELSE N'[]' END
        ) legacy_property
        INNER JOIN dbo.properties p
            ON p.id = TRY_CONVERT(UNIQUEIDENTIFIER, legacy_property.[value])
        INNER JOIN dbo.tenant_memberships tm
            ON tm.tenant_id = p.tenant_id
           AND tm.app_user_id = au.id
           AND LOWER(COALESCE(tm.role, N'')) IN (N'rentee', N'tenant')
        WHERE TRY_CONVERT(UNIQUEIDENTIFIER, legacy_property.[value]) IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.rentee_property_assignments existing_assignment
              WHERE existing_assignment.tenant_id = p.tenant_id
                AND existing_assignment.app_user_id = au.id
                AND existing_assignment.propertyid = p.id
                AND existing_assignment.unitid IS NULL
          );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
