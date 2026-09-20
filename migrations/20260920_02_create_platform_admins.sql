SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.platform_admins', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.platform_admins (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_platform_admins PRIMARY KEY DEFAULT NEWID(),
        app_user_id UNIQUEIDENTIFIER NOT NULL,
        status NVARCHAR(32) NOT NULL
            CONSTRAINT DF_platform_admins_status DEFAULT N'active',
        createdat DATETIME2 NOT NULL
            CONSTRAINT DF_platform_admins_createdat DEFAULT SYSUTCDATETIME(),
        updatedat DATETIME2 NOT NULL
            CONSTRAINT DF_platform_admins_updatedat DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_platform_admins_app_user UNIQUE (app_user_id),
        CONSTRAINT FK_platform_admins_app_users
            FOREIGN KEY (app_user_id) REFERENCES dbo.app_users(id)
    );

    CREATE INDEX IX_platform_admins_status
        ON dbo.platform_admins(status);
END;

/*
 * Bootstrap the existing KH Rentals platform owner.  This is deliberately
 * separate from tenant_memberships: a platform administrator may manage the
 * organization registry without being a business operator inside every tenant.
 */
DECLARE @BootstrapAppUserId UNIQUEIDENTIFIER = (
    SELECT TOP 1 id
    FROM dbo.app_users
    WHERE LOWER(LTRIM(RTRIM(email))) = LOWER(N'wweerakoone@gmail.com')
);

IF @BootstrapAppUserId IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
       FROM dbo.platform_admins
       WHERE app_user_id = @BootstrapAppUserId
   )
BEGIN
    INSERT INTO dbo.platform_admins (app_user_id, status)
    VALUES (@BootstrapAppUserId, N'active');
END;

COMMIT TRANSACTION;
