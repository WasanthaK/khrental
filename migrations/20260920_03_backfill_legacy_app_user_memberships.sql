SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.tenant_memberships', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.tenants', N'U') IS NOT NULL
BEGIN
    INSERT INTO dbo.tenant_memberships (
        id,
        tenant_id,
        app_user_id,
        role,
        status,
        is_default,
        createdat,
        updatedat
    )
    SELECT
        NEWID(),
        au.tenant_id,
        au.id,
        CASE
            WHEN LOWER(COALESCE(au.role, N'')) = N'admin' THEN N'admin'
            WHEN LOWER(COALESCE(au.role, N'')) IN (N'rentee', N'tenant')
              OR LOWER(COALESCE(au.user_type, N'')) IN (N'rentee', N'tenant') THEN N'rentee'
            ELSE N'staff'
        END,
        CASE
            WHEN LOWER(COALESCE(au.status, N'active')) = N'active' THEN N'active'
            ELSE N'inactive'
        END,
        CASE
            WHEN LOWER(COALESCE(au.status, N'active')) = N'active' THEN 1
            ELSE 0
        END,
        COALESCE(au.createdat, SYSUTCDATETIME()),
        SYSUTCDATETIME()
    FROM dbo.app_users au
    INNER JOIN dbo.tenants t
        ON t.id = au.tenant_id
    WHERE au.tenant_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.tenant_memberships tm
          WHERE tm.tenant_id = au.tenant_id
            AND tm.app_user_id = au.id
      );

    /*
     * app_users.tenant_id remains as a compatibility/default-tenant pointer.
     * Ensure the corresponding active membership is the default membership
     * without changing the person's memberships in other organizations.
     */
    UPDATE tm
    SET tm.is_default = CASE WHEN tm.tenant_id = au.tenant_id THEN 1 ELSE 0 END,
        tm.updatedat = SYSUTCDATETIME()
    FROM dbo.tenant_memberships tm
    INNER JOIN dbo.app_users au
        ON au.id = tm.app_user_id
    WHERE au.tenant_id IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM dbo.tenant_memberships preferred
          WHERE preferred.app_user_id = au.id
            AND preferred.tenant_id = au.tenant_id
            AND LOWER(COALESCE(preferred.status, N'active')) = N'active'
      );
END;

COMMIT TRANSACTION;
