-- Additive viewing coordination only; no reservations, membership or public activation.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'dbo.property_viewings',N'U') IS NULL
 BEGIN
  CREATE TABLE dbo.property_viewings (
   enquiry_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_property_viewings PRIMARY KEY
     CONSTRAINT FK_property_viewings_enquiry REFERENCES dbo.property_enquiries(id),
   status VARCHAR(20) NOT NULL,
   starts_at DATETIME2 NOT NULL,
   ends_at DATETIME2 NOT NULL,
   timezone VARCHAR(40) NOT NULL,
   instructions NVARCHAR(500) NULL,
   version INT NOT NULL,
   updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
   CONSTRAINT CK_property_viewings_status CHECK(status IN('requested','proposed','confirmed','cancelled','completed','no_show')),
   CONSTRAINT CK_property_viewings_time CHECK(DATEDIFF_BIG(second,starts_at,ends_at) BETWEEN 900 AND 10800),
   CONSTRAINT CK_property_viewings_zone CHECK(timezone IN('Asia/Colombo','Asia/Brunei')),
   CONSTRAINT CK_property_viewings_version CHECK(version>0)
  );
  CREATE TABLE dbo.property_viewing_events (
   id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_property_viewing_events PRIMARY KEY DEFAULT NEWID(),
   enquiry_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_property_viewing_events_viewing REFERENCES dbo.property_viewings(enquiry_id),
   actor_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_property_viewing_events_actor REFERENCES dbo.app_users(id),
   request_id UNIQUEIDENTIFIER NOT NULL,
   payload_hash CHAR(64) NOT NULL,
   status VARCHAR(20) NOT NULL,
   starts_at DATETIME2 NOT NULL,
   ends_at DATETIME2 NOT NULL,
   timezone VARCHAR(40) NOT NULL,
   instructions NVARCHAR(500) NULL,
   version INT NOT NULL,
   created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
   CONSTRAINT UQ_property_viewing_events_request UNIQUE(actor_id,request_id),
   CONSTRAINT UQ_property_viewing_events_version UNIQUE(enquiry_id,version)
  );
 END;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
