IF OBJECT_ID('dbo.auth_users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.auth_users (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_auth_users PRIMARY KEY DEFAULT NEWID(),
    auth_id UNIQUEIDENTIFIER NOT NULL,
    app_user_id UNIQUEIDENTIFIER NULL,
    email NVARCHAR(320) NOT NULL,
    password_hash NVARCHAR(256) NOT NULL,
    password_salt NVARCHAR(128) NULL,
    password_algorithm NVARCHAR(32) NOT NULL CONSTRAINT DF_auth_users_password_algorithm DEFAULT 'scrypt',
    role NVARCHAR(64) NOT NULL CONSTRAINT DF_auth_users_role DEFAULT 'authenticated',
    metadata NVARCHAR(MAX) NULL,
    createdat DATETIME2 NOT NULL CONSTRAINT DF_auth_users_createdat DEFAULT SYSUTCDATETIME(),
    updatedat DATETIME2 NOT NULL CONSTRAINT DF_auth_users_updatedat DEFAULT SYSUTCDATETIME(),
    last_login_at DATETIME2 NULL,
    CONSTRAINT UQ_auth_users_auth_id UNIQUE (auth_id),
    CONSTRAINT UQ_auth_users_email UNIQUE (email)
  );
END;

IF OBJECT_ID('dbo.auth_sessions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.auth_sessions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_auth_sessions PRIMARY KEY DEFAULT NEWID(),
    auth_user_id UNIQUEIDENTIFIER NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME2 NOT NULL,
    createdat DATETIME2 NOT NULL CONSTRAINT DF_auth_sessions_createdat DEFAULT SYSUTCDATETIME(),
    last_seen_at DATETIME2 NULL,
    revoked_at DATETIME2 NULL,
    CONSTRAINT UQ_auth_sessions_token_hash UNIQUE (token_hash),
    CONSTRAINT FK_auth_sessions_auth_users FOREIGN KEY (auth_user_id)
      REFERENCES dbo.auth_users(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_auth_sessions_active
    ON dbo.auth_sessions(token_hash, expires_at, revoked_at);
END;
