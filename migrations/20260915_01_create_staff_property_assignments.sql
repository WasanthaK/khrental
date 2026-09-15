-- KH Rentals Phase 2 explicit staff-to-property assignments.
-- This migration is idempotent and tenant-scoped.
-- Role permissions define what a staff member may do; this table defines where.

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.staff_property_assignments', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.staff_property_assignments (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_staff_property_assignments PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            propertyid UNIQUEIDENTIFIER NOT NULL,
            staff_user_id UNIQUEIDENTIFIER NOT NULL,
            [status] NVARCHAR(50) NOT NULL CONSTRAINT DF_staff_property_assignments_status DEFAULT N'active',
            assigned_by UNIQUEIDENTIFIER NULL,
            assignedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_staff_property_assignments_assignedat DEFAULT SYSUTCDATETIME(),
            endedat DATETIMEOFFSET NULL,
            notes NVARCHAR(MAX) NULL,
            createdat DATETIMEOFFSET NOT NULL CONSTRAINT DF_staff_property_assignments_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIMEOFFSET NOT NULL CONSTRAINT DF_staff_property_assignments_updatedat DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_staff_property_assignments_tenant_property_user UNIQUE (tenant_id, propertyid, staff_user_id),
            CONSTRAINT CK_staff_property_assignments_status CHECK ([status] IN (N'active', N'inactive')),
            CONSTRAINT FK_staff_property_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
            CONSTRAINT FK_staff_property_assignments_property FOREIGN KEY (propertyid) REFERENCES dbo.properties(id),
            CONSTRAINT FK_staff_property_assignments_staff FOREIGN KEY (staff_user_id) REFERENCES dbo.app_users(id),
            CONSTRAINT FK_staff_property_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.app_users(id)
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_staff_property_assignments_tenant_staff_status'
          AND object_id = OBJECT_ID(N'dbo.staff_property_assignments')
    )
    BEGIN
        CREATE INDEX IX_staff_property_assignments_tenant_staff_status
            ON dbo.staff_property_assignments (tenant_id, staff_user_id, [status]);
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_staff_property_assignments_tenant_property_status'
          AND object_id = OBJECT_ID(N'dbo.staff_property_assignments')
    )
    BEGIN
        CREATE INDEX IX_staff_property_assignments_tenant_property_status
            ON dbo.staff_property_assignments (tenant_id, propertyid, [status]);
    END;

    -- Compatibility backfill: older installations may already carry property IDs
    -- in app_users.associated_property_ids as a JSON array. Only active staff
    -- memberships are imported; rentee associations are deliberately ignored.
    IF COL_LENGTH(N'dbo.app_users', N'associated_property_ids') IS NOT NULL
       AND OBJECT_ID(N'dbo.tenant_memberships', N'U') IS NOT NULL
    BEGIN
        INSERT INTO dbo.staff_property_assignments (
            tenant_id,
            propertyid,
            staff_user_id,
            [status],
            notes
        )
        SELECT DISTINCT
            tm.tenant_id,
            p.id,
            au.id,
            N'active',
            N'Migrated from app_users.associated_property_ids'
        FROM dbo.app_users au
        INNER JOIN dbo.tenant_memberships tm
            ON tm.app_user_id = au.id
           AND tm.status = N'active'
           AND LOWER(tm.role) IN (N'staff', N'manager', N'finance_staff', N'maintenance_staff', N'maintenance', N'supervisor')
        CROSS APPLY OPENJSON(
            CASE
                WHEN ISJSON(au.associated_property_ids) = 1 THEN au.associated_property_ids
                ELSE N'[]'
            END
        ) legacy_property
        INNER JOIN dbo.properties p
            ON p.id = TRY_CONVERT(UNIQUEIDENTIFIER, legacy_property.[value])
           AND p.tenant_id = tm.tenant_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.staff_property_assignments existing_assignment
            WHERE existing_assignment.tenant_id = tm.tenant_id
              AND existing_assignment.propertyid = p.id
              AND existing_assignment.staff_user_id = au.id
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
