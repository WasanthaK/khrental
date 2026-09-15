SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.auth_users', N'U') IS NULL
        THROW 51010, 'dbo.auth_users must exist before applying password reset token migration.', 1;

    IF OBJECT_ID(N'dbo.password_reset_tokens', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.password_reset_tokens (
            id UNIQUEIDENTIFIER NOT NULL
                CONSTRAINT PK_password_reset_tokens PRIMARY KEY DEFAULT NEWID(),
            auth_user_id UNIQUEIDENTIFIER NOT NULL,
            email NVARCHAR(320) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME2 NOT NULL,
            used_at DATETIME2 NULL,
            revoked_at DATETIME2 NULL,
            createdat DATETIME2 NOT NULL
                CONSTRAINT DF_password_reset_tokens_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIME2 NOT NULL
                CONSTRAINT DF_password_reset_tokens_updatedat DEFAULT SYSUTCDATETIME(),

            CONSTRAINT UQ_password_reset_tokens_token_hash UNIQUE (token_hash),
            CONSTRAINT FK_password_reset_tokens_auth_user
                FOREIGN KEY (auth_user_id)
                REFERENCES dbo.auth_users(id)
                ON DELETE CASCADE
        );
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.password_reset_tokens')
          AND name = N'IX_password_reset_tokens_auth_user_active'
    )
    BEGIN
        CREATE INDEX IX_password_reset_tokens_auth_user_active
            ON dbo.password_reset_tokens (
                auth_user_id,
                used_at,
                revoked_at,
                expires_at
            );
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.password_reset_tokens')
          AND name = N'IX_password_reset_tokens_email_active'
    )
    BEGIN
        CREATE INDEX IX_password_reset_tokens_email_active
            ON dbo.password_reset_tokens (
                email,
                used_at,
                revoked_at,
                expires_at
            );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
