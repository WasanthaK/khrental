-- B04 shared signup abuse controls on EXISTING Azure SQL.
-- SCHEMA ONLY. Apply via governed migration gate, never from web startup.
-- No account, billing, tenant, invoice, contract or Evia evidence mutation.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.public_signup_challenges', N'U') IS NULL
        THROW 51420, 'Apply approved B04 S3a pending challenges schema first', 1;

    IF OBJECT_ID(N'dbo.public_signup_rate_limits', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.public_signup_rate_limits (
            bucket_hash CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
            window_start DATETIME2(3) NOT NULL,
            request_count INT NOT NULL,
            updated_at DATETIME2(3) NOT NULL
                CONSTRAINT DF_public_signup_rate_limits_updated DEFAULT SYSUTCDATETIME(),
            CONSTRAINT PK_public_signup_rate_limits PRIMARY KEY (bucket_hash),
            CONSTRAINT CK_public_signup_rate_limits_count CHECK
                (request_count BETWEEN 1 AND 100000),
            CONSTRAINT CK_public_signup_rate_limits_window CHECK
                (updated_at >= window_start)
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.public_signup_rate_limits')
          AND name = N'IX_public_signup_rate_limits_updated'
    )
        CREATE INDEX IX_public_signup_rate_limits_updated
            ON dbo.public_signup_rate_limits (updated_at);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
