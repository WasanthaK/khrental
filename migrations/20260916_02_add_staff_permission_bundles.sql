-- KH Rentals Phase 3 canonical role-model foundation.
-- Keep tenant_memberships.role as the portal role and move staff specialization
-- into permission_bundle. Existing legacy staff roles are backfilled safely.

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.tenant_memberships', 'permission_bundle') IS NULL
BEGIN
    ALTER TABLE dbo.tenant_memberships
        ADD permission_bundle NVARCHAR(100) NULL;
END;

UPDATE dbo.tenant_memberships
SET permission_bundle = CASE LOWER(LTRIM(RTRIM(role)))
    WHEN N'manager' THEN N'property_operations'
    WHEN N'finance_staff' THEN N'finance'
    WHEN N'maintenance_staff' THEN N'maintenance'
    WHEN N'maintenance' THEN N'maintenance'
    WHEN N'supervisor' THEN N'maintenance'
    WHEN N'staff' THEN COALESCE(NULLIF(permission_bundle, N''), N'maintenance')
    ELSE permission_bundle
END,
updatedat = SYSUTCDATETIME()
WHERE LOWER(LTRIM(RTRIM(role))) IN (
    N'manager',
    N'finance_staff',
    N'maintenance_staff',
    N'maintenance',
    N'supervisor',
    N'staff'
)
AND (
    permission_bundle IS NULL
    OR LTRIM(RTRIM(permission_bundle)) = N''
);

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_tenant_memberships_permission_bundle'
      AND parent_object_id = OBJECT_ID(N'dbo.tenant_memberships')
)
BEGIN
    ALTER TABLE dbo.tenant_memberships WITH CHECK
        ADD CONSTRAINT CK_tenant_memberships_permission_bundle
        CHECK (
            permission_bundle IS NULL
            OR permission_bundle IN (
                N'property_operations',
                N'finance',
                N'maintenance',
                N'read_only'
            )
        );
END;

COMMIT TRANSACTION;
