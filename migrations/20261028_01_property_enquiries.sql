-- Governed enquiry schema. Apply only through the protected migration runner.
-- Additive metadata/audit storage; no public activation or request/startup DDL.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'dbo.public_listing_preferences',N'U') IS NULL
   THROW 51000,'Public listing prerequisites are required.',1;
 IF OBJECT_ID(N'dbo.property_enquiries',N'U') IS NULL
 BEGIN
  CREATE TABLE dbo.property_enquiries (
   id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_property_enquiries PRIMARY KEY DEFAULT NEWID(),
   listing_public_id UNIQUEIDENTIFIER NOT NULL,
   tenant_id UNIQUEIDENTIFIER NOT NULL,
   property_id UNIQUEIDENTIFIER NOT NULL,
   seeker_id UNIQUEIDENTIFIER NOT NULL,
   seeker_name NVARCHAR(200) NOT NULL,
   seeker_email NVARCHAR(320) NOT NULL,
   country_code CHAR(2) NOT NULL,
   listing_title NVARCHAR(150) NOT NULL,
   message NVARCHAR(2000) NOT NULL,
   consent_version VARCHAR(30) NOT NULL,
   consent_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
   request_id UNIQUEIDENTIFIER NOT NULL,
   payload_hash CHAR(64) NOT NULL,
   status VARCHAR(20) NOT NULL DEFAULT 'pending',
   owner_response NVARCHAR(2000) NULL,
   updated_by UNIQUEIDENTIFIER NULL,
   created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
   updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
   version INT NOT NULL DEFAULT 1,
   CONSTRAINT FK_property_enquiries_listing FOREIGN KEY(listing_public_id) REFERENCES dbo.public_listing_preferences(public_id),
   CONSTRAINT FK_property_enquiries_tenant FOREIGN KEY(tenant_id) REFERENCES dbo.tenants(id),
   CONSTRAINT FK_property_enquiries_property FOREIGN KEY(property_id) REFERENCES dbo.properties(id),
   CONSTRAINT FK_property_enquiries_seeker FOREIGN KEY(seeker_id) REFERENCES dbo.app_users(id),
   CONSTRAINT CK_property_enquiries_status CHECK(status IN('pending','responded','closed','withdrawn')),
   CONSTRAINT CK_property_enquiries_country CHECK(country_code IN('LK','BN')),
   CONSTRAINT CK_property_enquiries_message CHECK(LEN(message)>0),
   CONSTRAINT UQ_property_enquiries_request UNIQUE(seeker_id,request_id)
  );
  CREATE UNIQUE INDEX UX_property_enquiries_open ON dbo.property_enquiries(seeker_id,listing_public_id)
    WHERE status IN('pending','responded');
  CREATE INDEX IX_property_enquiries_inbox ON dbo.property_enquiries(tenant_id,created_at DESC,id);
  CREATE INDEX IX_property_enquiries_seeker ON dbo.property_enquiries(seeker_id,created_at DESC,id);
 END;
 IF OBJECT_ID(N'dbo.property_enquiry_events',N'U') IS NULL
 BEGIN
  CREATE TABLE dbo.property_enquiry_events (
   id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
   enquiry_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.property_enquiries(id),
   actor_user_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.app_users(id),
   from_status VARCHAR(20) NULL,
   to_status VARCHAR(20) NOT NULL,
   version INT NOT NULL,
   response NVARCHAR(2000) NULL,
   created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
   CONSTRAINT UQ_property_enquiry_events_version UNIQUE(enquiry_id,version)
  );
 END;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
