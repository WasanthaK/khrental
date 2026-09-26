SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
    THROW 50001, 'dbo.app_users does not exist.', 1;

IF COL_LENGTH(N'dbo.app_users', N'associated_properties') IS NULL
BEGIN
    ALTER TABLE dbo.app_users
        ADD associated_properties NVARCHAR(MAX) NULL;
END;

UPDATE dbo.app_users
SET associated_properties = N'[]'
WHERE associated_properties IS NULL
   OR LTRIM(RTRIM(associated_properties)) = N'';

IF COL_LENGTH(N'dbo.app_users', N'associated_property_ids') IS NOT NULL
BEGIN
    UPDATE dbo.app_users
    SET associated_properties = (
        SELECT
            CONVERT(NVARCHAR(36), TRY_CONVERT(UNIQUEIDENTIFIER, ids.[value])) AS propertyId,
            NULL AS unitId
        FROM OPENJSON(CASE WHEN ISJSON(associated_property_ids) = 1 THEN associated_property_ids ELSE N'[]' END) ids
        WHERE TRY_CONVERT(UNIQUEIDENTIFIER, ids.[value]) IS NOT NULL
        FOR JSON PATH
    )
    WHERE associated_properties = N'[]'
      AND ISJSON(associated_property_ids) = 1
      AND EXISTS (
          SELECT 1
          FROM OPENJSON(associated_property_ids) ids
          WHERE TRY_CONVERT(UNIQUEIDENTIFIER, ids.[value]) IS NOT NULL
      );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.app_users')
      AND name = N'CK_app_users_associated_properties_json'
)
BEGIN
    ALTER TABLE dbo.app_users
        ADD CONSTRAINT CK_app_users_associated_properties_json
        CHECK (associated_properties IS NULL OR ISJSON(associated_properties) = 1);
END;

COMMIT TRANSACTION;
