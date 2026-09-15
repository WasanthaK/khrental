-- Verification for 20260915_02_create_user_invitations.sql
-- Safe to run repeatedly after the migration.

SET NOCOUNT ON;

SELECT
    CASE WHEN OBJECT_ID(N'dbo.user_invitations', N'U') IS NOT NULL THEN 1 ELSE 0 END AS table_exists;

IF OBJECT_ID(N'dbo.user_invitations', N'U') IS NOT NULL
BEGIN
    SELECT
        COUNT(*) AS invitation_count
    FROM dbo.user_invitations;

    SELECT
        c.name AS column_name,
        t.name AS data_type,
        c.max_length,
        c.is_nullable
    FROM sys.columns c
    INNER JOIN sys.types t
        ON t.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.user_invitations')
    ORDER BY c.column_id;

    SELECT
        i.name AS index_name,
        i.is_unique,
        i.is_primary_key
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.user_invitations')
      AND i.name IS NOT NULL
    ORDER BY i.name;

    SELECT
        fk.name AS foreign_key_name,
        OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
        fk.delete_referential_action_desc AS delete_action
    FROM sys.foreign_keys fk
    WHERE fk.parent_object_id = OBJECT_ID(N'dbo.user_invitations')
    ORDER BY fk.name;

    SELECT
        CASE WHEN EXISTS (
            SELECT 1
            FROM sys.indexes
            WHERE object_id = OBJECT_ID(N'dbo.user_invitations')
              AND name = N'IX_user_invitations_tenant_user_active'
        ) THEN 1 ELSE 0 END AS tenant_user_index_exists,
        CASE WHEN EXISTS (
            SELECT 1
            FROM sys.indexes
            WHERE object_id = OBJECT_ID(N'dbo.user_invitations')
              AND name = N'IX_user_invitations_email_active'
        ) THEN 1 ELSE 0 END AS email_index_exists,
        CASE WHEN EXISTS (
            SELECT 1
            FROM sys.key_constraints
            WHERE parent_object_id = OBJECT_ID(N'dbo.user_invitations')
              AND name = N'UQ_user_invitations_token_hash'
              AND [type] = N'UQ'
        ) THEN 1 ELSE 0 END AS token_hash_unique_exists,
        CASE WHEN EXISTS (
            SELECT 1
            FROM sys.foreign_keys
            WHERE parent_object_id = OBJECT_ID(N'dbo.user_invitations')
              AND name = N'FK_user_invitations_tenant'
        ) THEN 1 ELSE 0 END AS tenant_fk_exists,
        CASE WHEN EXISTS (
            SELECT 1
            FROM sys.foreign_keys
            WHERE parent_object_id = OBJECT_ID(N'dbo.user_invitations')
              AND name = N'FK_user_invitations_app_user'
              AND delete_referential_action = 1
        ) THEN 1 ELSE 0 END AS app_user_cascade_fk_exists;
END;
