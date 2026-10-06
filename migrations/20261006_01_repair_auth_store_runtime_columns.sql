SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.auth_users', N'U') IS NULL
    THROW 51020, 'dbo.auth_users must exist before applying auth-store compatibility migration.', 1;

  IF OBJECT_ID(N'dbo.auth_sessions', N'U') IS NULL
    THROW 51021, 'dbo.auth_sessions must exist before applying auth-store compatibility migration.', 1;

  IF COL_LENGTH(N'dbo.auth_users', N'last_login_at') IS NULL
  BEGIN
    ALTER TABLE dbo.auth_users ADD last_login_at DATETIME2 NULL;
  END;

  IF COL_LENGTH(N'dbo.auth_users', N'updatedat') IS NULL
  BEGIN
    ALTER TABLE dbo.auth_users ADD updatedat DATETIME2 NULL;
    UPDATE dbo.auth_users SET updatedat = SYSUTCDATETIME() WHERE updatedat IS NULL;
  END;

  IF COL_LENGTH(N'dbo.auth_sessions', N'last_seen_at') IS NULL
  BEGIN
    ALTER TABLE dbo.auth_sessions ADD last_seen_at DATETIME2 NULL;
  END;

  IF COL_LENGTH(N'dbo.auth_sessions', N'revoked_at') IS NULL
  BEGIN
    ALTER TABLE dbo.auth_sessions ADD revoked_at DATETIME2 NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.auth_sessions')
      AND name = N'IX_auth_sessions_active'
  )
  BEGIN
    EXEC(N'
      CREATE INDEX IX_auth_sessions_active
        ON dbo.auth_sessions(token_hash, expires_at, revoked_at);
    ');
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
