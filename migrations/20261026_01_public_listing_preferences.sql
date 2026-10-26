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
 -- Separate opaque, approved, processed PUBLIC-image manifest.
 -- No private source path, source tenant UUID or original SAS URL is made public.
 -- Existing properties/photos are NOT automatically copied or published by migration.
 IF OBJECT_ID(N'dbo.public_listing_media',N'U') IS NULL
 BEGIN
  CREATE TABLE dbo.public_listing_media (
   media_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_public_listing_media PRIMARY KEY DEFAULT NEWID(),
   listing_public_id UNIQUEIDENTIFIER NOT NULL,
   display_order INT NOT NULL,
   alt_text NVARCHAR(180) NOT NULL,
   source_sha256 CHAR(64) NOT NULL,
   derivative_sha256 CHAR(64) NOT NULL,
   processor_version NVARCHAR(50) NOT NULL,
   image_bytes INT NOT NULL,
   rights_confirmed BIT NOT NULL CONSTRAINT DF_public_listing_media_rights DEFAULT 0,
   privacy_reviewed BIT NOT NULL CONSTRAINT DF_public_listing_media_privacy DEFAULT 0,
   media_status NVARCHAR(20) NOT NULL CONSTRAINT DF_public_listing_media_status DEFAULT N'withheld',
   created_at DATETIME2 NOT NULL CONSTRAINT DF_public_listing_media_created DEFAULT SYSUTCDATETIME(),
   withdrawn_at DATETIME2 NULL,
   CONSTRAINT FK_public_listing_media_listing FOREIGN KEY(listing_public_id)
     REFERENCES dbo.public_listing_preferences(public_id),
   prepared_by UNIQUEIDENTIFIER NULL,
   CONSTRAINT CK_public_listing_media_status CHECK(media_status IN(N'withheld',N'ready',N'withdrawn')),
   CONSTRAINT CK_public_listing_media_bytes CHECK(image_bytes BETWEEN 1 AND 2097152),
   CONSTRAINT CK_public_listing_media_order CHECK(display_order BETWEEN 0 AND 49)
  );
  CREATE INDEX IX_public_listing_media_ready
    ON dbo.public_listing_media(listing_public_id,media_status,display_order)
    INCLUDE (rights_confirmed,privacy_reviewed);
  -- Historical withdrawn derivatives do not block a new prepared version at the same slot.
  CREATE UNIQUE INDEX UX_public_listing_media_current_slot
    ON dbo.public_listing_media(listing_public_id,display_order)
    WHERE media_status IN(N'withheld',N'ready');
 END;
 -- When an owner removes/replaces a registered property image, old public derivatives
 -- become ineligible at the DB boundary even if a bucket object still exists.
 IF OBJECT_ID(N'dbo.trg_public_listing_media_source_changed',N'TR') IS NULL
 EXEC(N'CREATE TRIGGER dbo.trg_public_listing_media_source_changed ON dbo.properties
 AFTER UPDATE AS
 BEGIN
   SET NOCOUNT ON;
   IF NOT UPDATE(images) RETURN;
   UPDATE m SET media_status=N''withdrawn'',withdrawn_at=SYSUTCDATETIME()
   FROM dbo.public_listing_media m
   INNER JOIN dbo.public_listing_preferences pref ON pref.public_id=m.listing_public_id
   INNER JOIN inserted i ON i.id=pref.property_id AND i.tenant_id=pref.tenant_id
   INNER JOIN deleted d ON d.id=i.id AND d.tenant_id=i.tenant_id
   WHERE m.media_status <> N''withdrawn''
     AND (i.images <> d.images OR (i.images IS NULL AND d.images IS NOT NULL)
         OR (i.images IS NOT NULL AND d.images IS NULL));
 END');
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
