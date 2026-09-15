SELECT
    CASE
        WHEN OBJECT_ID(N'dbo.password_reset_tokens', N'U') IS NOT NULL
        THEN 1
        ELSE 0
    END AS table_exists;

SELECT COUNT(*) AS password_reset_token_count
FROM dbo.password_reset_tokens;

SELECT
    CASE WHEN EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.password_reset_tokens')
          AND name = N'IX_password_reset_tokens_auth_user_active'
    ) THEN 1 ELSE 0 END AS auth_user_index_exists,

    CASE WHEN EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.password_reset_tokens')
          AND name = N'IX_password_reset_tokens_email_active'
    ) THEN 1 ELSE 0 END AS email_index_exists,

    CASE WHEN EXISTS (
        SELECT 1
        FROM sys.key_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.password_reset_tokens')
          AND name = N'UQ_password_reset_tokens_token_hash'
          AND [type] = N'UQ'
    ) THEN 1 ELSE 0 END AS token_hash_unique_exists,

    CASE WHEN EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.password_reset_tokens')
          AND name = N'FK_password_reset_tokens_auth_user'
          AND delete_referential_action = 1
    ) THEN 1 ELSE 0 END AS auth_user_cascade_fk_exists;
