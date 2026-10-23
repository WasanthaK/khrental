-- Quixo.Homes B04 S3a: storage ONLY for prospective email-verified global registration.
-- Use the dedicated governed migration process; never run from web startup.
-- Does NOT create users, authentication records, memberships, sessions or entitlements.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
       OR OBJECT_ID(N'dbo.auth_users', N'U') IS NULL
        THROW 51400, 'Global auth schema prerequisites are missing', 1;

    IF OBJECT_ID(N'dbo.public_signup_challenges', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.public_signup_challenges (
            id UNIQUEIDENTIFIER NOT NULL
                CONSTRAINT PK_public_signup_challenges PRIMARY KEY DEFAULT NEWID(),
            email_normalized NVARCHAR(320) NOT NULL,
            display_name NVARCHAR(255) NOT NULL,
            token_hash CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
            issued_at DATETIME2(3) NOT NULL
                CONSTRAINT DF_public_signup_challenges_issued_at DEFAULT SYSUTCDATETIME(),
            sent_at DATETIME2(3) NULL,
            expires_at DATETIME2(3) NOT NULL,
            consumed_at DATETIME2(3) NULL,
            revoked_at DATETIME2(3) NULL,
            send_count INT NOT NULL
                CONSTRAINT DF_public_signup_challenges_send_count DEFAULT 0,
            verify_attempts INT NOT NULL
                CONSTRAINT DF_public_signup_challenges_verify_attempts DEFAULT 0,
            CONSTRAINT UQ_public_signup_challenges_token_hash UNIQUE (token_hash),
            CONSTRAINT CK_public_signup_challenges_expiry CHECK (expires_at > issued_at),
            CONSTRAINT CK_public_signup_challenges_counts CHECK (
                send_count BETWEEN 0 AND 100 AND verify_attempts BETWEEN 0 AND 100
            ),
            CONSTRAINT CK_public_signup_challenges_finished_once CHECK (
                consumed_at IS NULL OR revoked_at IS NULL
            ),
            CONSTRAINT CK_public_signup_challenges_normalized_email CHECK (
                email_normalized = LOWER(LTRIM(RTRIM(email_normalized)))
            )
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.public_signup_challenges')
          AND name = N'IX_public_signup_challenges_email_state'
    )
        CREATE INDEX IX_public_signup_challenges_email_state
            ON dbo.public_signup_challenges (email_normalized, consumed_at, revoked_at, expires_at);

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.public_signup_challenges')
          AND name = N'IX_public_signup_challenges_expiry'
    )
        CREATE INDEX IX_public_signup_challenges_expiry
            ON dbo.public_signup_challenges (expires_at);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
