-- Default-public Quixo.Homes candidates are derived from the authoritative app's property/availability rows.
-- This metadata table stores only owner opt-out and non-sensitive public market/location metadata.
-- Every existing and newly inserted property defaults to opted_out=0, NOT manually approved one-by-one.
-- Installation alone creates NO public endpoints and does NOT enable PUBLIC_LISTING_READ_ENABLED.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'dbo.public_listing_preferences', N'U') IS NULL
 BEGIN
  CREATE TABLE dbo.public_listing_preferences (
   public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_public_listing_preferences PRIMARY KEY DEFAULT NEWID(),
   property_id UNIQUEIDENTIFIER NOT NULL,
   tenant_id UNIQUEIDENTIFIER NOT NULL,
   country_code CHAR(2) NULL,
   location_label NVARCHAR(120) NULL,
   public_headline NVARCHAR(150) NULL,
   opted_out BIT NOT NULL CONSTRAINT DF_public_listing_preferences_opt_out DEFAULT (0),
   opted_out_at DATETIME2 NULL,
   updated_by UNIQUEIDENTIFIER NULL,
   updated_at DATETIME2 NOT NULL CONSTRAINT DF_public_listing_preferences_updated DEFAULT SYSUTCDATETIME(),
   CONSTRAINT UQ_public_listing_preferences_property UNIQUE(property_id),
   CONSTRAINT FK_public_listing_preferences_property FOREIGN KEY(property_id) REFERENCES dbo.properties(id),
   CONSTRAINT FK_public_listing_preferences_tenant FOREIGN KEY(tenant_id) REFERENCES dbo.tenants(id),
   CONSTRAINT CK_public_listing_preferences_country CHECK(country_code IS NULL OR country_code IN('LK','BN'))
  );
  CREATE INDEX IX_public_listing_preferences_market ON dbo.public_listing_preferences(country_code,opted_out);
 END;
 -- Existing rows are default public-eligible, but market classification remains NULL
 -- until reliably mapped to LK/BN. DO NOT infer market by parsing private addresses.
 INSERT INTO dbo.public_listing_preferences(property_id,tenant_id,opted_out)
 SELECT p.id,p.tenant_id,0
 FROM dbo.properties p
 WHERE NOT EXISTS(SELECT 1 FROM dbo.public_listing_preferences pl WITH (UPDLOCK,HOLDLOCK)
                  WHERE pl.property_id=p.id);
 -- Ensure future app-side property registrations also get default-public preference.
 IF OBJECT_ID(N'dbo.trg_public_listing_preferences_property_insert',N'TR') IS NULL
 EXEC(N'CREATE TRIGGER dbo.trg_public_listing_preferences_property_insert ON dbo.properties
 AFTER INSERT AS BEGIN SET NOCOUNT ON;
   INSERT INTO dbo.public_listing_preferences(property_id,tenant_id,opted_out)
   SELECT i.id,i.tenant_id,0 FROM inserted i
   WHERE NOT EXISTS(SELECT 1 FROM dbo.public_listing_preferences pref WHERE pref.property_id=i.id);
 END');
 IF OBJECT_ID(N'dbo.public_listing_read_buckets',N'U') IS NULL
 BEGIN
  CREATE TABLE dbo.public_listing_read_buckets(
   bucket VARCHAR(10) NOT NULL CONSTRAINT PK_public_listing_read_buckets PRIMARY KEY,
   window_start DATETIME2 NOT NULL,
   hits INT NOT NULL CONSTRAINT CK_public_listing_read_buckets_hits CHECK(hits>=0),
   CONSTRAINT CK_public_listing_read_buckets_bucket CHECK(bucket IN('LK','BN','DETAIL'))
  );
 END;
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
