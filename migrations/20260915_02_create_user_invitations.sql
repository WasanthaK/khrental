-- Stage 3A.1: secure invitation ledger for KH Rentals.
-- Stores only hashes of invitation tokens; raw tokens must never be persisted.
-- Idempotent for fresh/repeated migration runs.

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.user_invitations', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.user_invitations (
            id UNIQUEIDENTIFIER NOT NULL
                CONSTRAINT PK_user_invitations PRIMARY KEY DEFAULT NEWID(),
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            app_user_id UNIQUEIDENTIFIER NOT NULL,
            email NVARCHAR(320) NOT NULL,
            intended_role NVARCHAR(100) NOT NULL,
            user_type NVARCHAR(64) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME2 NOT NULL,
            accepted_at DATETIME2 NULL,
            revoked_at DATETIME2 NULL,
            created_by UNIQUEIDENTIFIER NULL,
            createdat DATETIME2 NOT NULL
                CONSTRAINT DF_user_invitations_createdat DEFAULT SYSUTCDATETIME(),
            updatedat DATETIME2 NOT NULL
                CONSTRAINT DF_user_invitations_updatedat DEFAULT SYSUTCDATETIME(),

            CONSTRAINT UQ_user_invitations_token_hash UNIQUE (token_hash),
            CONSTRAINT FK_user_invitations_tenant
                FOREIGN KEY (tenant_id)
                REFERENCES dbo.tenants(id),
            CONSTRAINT FK_user_invitations_app_user
                FOREIGN KEY (app_user_id)
                REFERENCES dbo.app_users(id)
                ON DELETE CASCADE
        );
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.user_invitations')
          AND name = N'IX_user_invitations_tenant_user_active'
    )
    BEGIN
        CREATE INDEX IX_user_invitations_tenant_user_active
            ON dbo.user_invitations (
                tenant_id,
                app_user_id,
                accepted_at,
                revoked_at,
                expires_at
            );
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.user_invitations')
          AND name = N'IX_user_invitations_email_active'
    )
    BEGIN
        CREATE INDEX IX_user_invitations_email_active
            ON dbo.user_invitations (
                email,
                accepted_at,
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
