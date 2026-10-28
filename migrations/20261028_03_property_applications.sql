-- Private application state only. No membership, contract, reservation or activation.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'dbo.property_applications',N'U') IS NULL
 BEGIN
  CREATE TABLE dbo.property_applications (
   enquiry_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_property_applications PRIMARY KEY
     CONSTRAINT FK_property_applications_enquiry REFERENCES dbo.property_enquiries(id),
   status VARCHAR(20) NOT NULL,
   move_in_date DATE NOT NULL,
   occupants INT NOT NULL,
   term_months INT NOT NULL,
   statement NVARCHAR(2000) NOT NULL,
   owner_note NVARCHAR(2000) NULL,
   consent_version VARCHAR(30) NOT NULL,
   consent_at DATETIME2 NOT NULL,
   version INT NOT NULL,
   updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
   CONSTRAINT CK_property_applications_status CHECK(status IN('submitted','needs_information','accepted','declined','withdrawn')),
   CONSTRAINT CK_property_applications_occupants CHECK(occupants BETWEEN 1 AND 50),
   CONSTRAINT CK_property_applications_term CHECK(term_months BETWEEN 1 AND 120),
   CONSTRAINT CK_property_applications_statement CHECK(LEN(statement)>0),
   CONSTRAINT CK_property_applications_consent CHECK(consent_version='rental-application-v1'),
   CONSTRAINT CK_property_applications_version CHECK(version>0)
  );
  CREATE TABLE dbo.property_application_events (
   id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_property_application_events PRIMARY KEY DEFAULT NEWID(),
   enquiry_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_property_application_events_application REFERENCES dbo.property_applications(enquiry_id),
   actor_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_property_application_events_actor REFERENCES dbo.app_users(id),
   request_id UNIQUEIDENTIFIER NOT NULL,
   payload_hash CHAR(64) NOT NULL,
   status VARCHAR(20) NOT NULL,
   move_in_date DATE NOT NULL,
   occupants INT NOT NULL,
   term_months INT NOT NULL,
   statement NVARCHAR(2000) NOT NULL,
   owner_note NVARCHAR(2000) NULL,
   consent_version VARCHAR(30) NOT NULL,
   consent_at DATETIME2 NOT NULL,
   version INT NOT NULL,
   created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
   CONSTRAINT UQ_property_application_events_request UNIQUE(actor_id,request_id),
   CONSTRAINT UQ_property_application_events_version UNIQUE(enquiry_id,version)
  );
 END;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
