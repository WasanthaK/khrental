SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.property_rental_offers',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.property_rental_offers(
  enquiry_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_property_rental_offers PRIMARY KEY,
  tenant_id UNIQUEIDENTIFIER NOT NULL, property_id UNIQUEIDENTIFIER NOT NULL,
  unit_id UNIQUEIDENTIFIER NULL, unit_label NVARCHAR(100) NULL,
  application_version INT NOT NULL, status VARCHAR(20) NOT NULL, version INT NOT NULL,
  currency CHAR(3) NOT NULL, rent DECIMAL(18,2) NOT NULL,deposit DECIMAL(18,2) NOT NULL,fees DECIMAL(18,2) NOT NULL,
  start_date DATE NOT NULL,end_date DATE NOT NULL,terms NVARCHAR(MAX) NOT NULL,
  offer_until DATETIME2 NOT NULL,hold_until DATETIME2 NOT NULL,accepted_at DATETIME2 NULL,
  agreement_id UNIQUEIDENTIFIER NULL,
  updated_at DATETIME2 NOT NULL CONSTRAINT DF_property_rental_offers_updated DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_property_rental_offers_enquiry FOREIGN KEY(enquiry_id) REFERENCES dbo.property_enquiries(id),
  CONSTRAINT FK_property_rental_offers_property FOREIGN KEY(property_id) REFERENCES dbo.properties(id),
  CONSTRAINT FK_property_rental_offers_tenant FOREIGN KEY(tenant_id) REFERENCES dbo.tenants(id),
  CONSTRAINT FK_property_rental_offers_unit FOREIGN KEY(unit_id) REFERENCES dbo.property_units(id),
  CONSTRAINT FK_property_rental_offers_agreement FOREIGN KEY(agreement_id) REFERENCES dbo.agreements(id),
  CONSTRAINT CK_property_rental_offers_state CHECK(status IN('offered','accepted','agreement','declined','withdrawn','expired','invalidated')),
  CONSTRAINT CK_property_rental_offers_version CHECK(version>0 AND application_version>0),
  CONSTRAINT CK_property_rental_offers_money CHECK(rent>0 AND deposit>=0 AND fees>=0),
  CONSTRAINT CK_property_rental_offers_dates CHECK(end_date>start_date AND hold_until>offer_until),
  CONSTRAINT CK_property_rental_offers_currency CHECK(currency IN('LKR','BND')),
  CONSTRAINT CK_property_rental_offers_terms CHECK(LEN(LTRIM(RTRIM(terms)))>0 AND LEN(terms)<=8000),
  CONSTRAINT CK_property_rental_offers_acceptance CHECK(status IN('offered','declined','withdrawn','expired','invalidated') OR accepted_at IS NOT NULL),
  CONSTRAINT CK_property_rental_offers_agreement CHECK(status<>'agreement' OR agreement_id IS NOT NULL)
 );
 CREATE INDEX IX_property_rental_offers_property ON dbo.property_rental_offers(tenant_id,property_id,status,hold_until);
 CREATE UNIQUE INDEX UX_property_rental_offers_agreement ON dbo.property_rental_offers(agreement_id) WHERE agreement_id IS NOT NULL;
END;
IF OBJECT_ID(N'dbo.property_rental_offer_events',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.property_rental_offer_events(
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_property_rental_offer_events PRIMARY KEY DEFAULT NEWID(),
  enquiry_id UNIQUEIDENTIFIER NOT NULL,actor_id UNIQUEIDENTIFIER NULL,request_id UNIQUEIDENTIFIER NULL,payload_hash CHAR(64) NULL,
  version INT NOT NULL,event_type VARCHAR(30) NOT NULL,snapshot NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_property_rental_offer_events_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_property_rental_offer_events_offer FOREIGN KEY(enquiry_id) REFERENCES dbo.property_rental_offers(enquiry_id),
  CONSTRAINT FK_property_rental_offer_events_actor FOREIGN KEY(actor_id) REFERENCES dbo.app_users(id),
  CONSTRAINT UQ_property_rental_offer_events_version UNIQUE(enquiry_id,version),
  CONSTRAINT CK_property_rental_offer_events_json CHECK(ISJSON(snapshot)=1),
  CONSTRAINT CK_property_rental_offer_events_version CHECK(version>0),
  CONSTRAINT CK_property_rental_offer_events_request CHECK((actor_id IS NULL AND request_id IS NULL AND payload_hash IS NULL) OR (actor_id IS NOT NULL AND request_id IS NOT NULL AND payload_hash IS NOT NULL))
 );
 CREATE UNIQUE INDEX UX_property_rental_offer_events_request ON dbo.property_rental_offer_events(actor_id,request_id) WHERE request_id IS NOT NULL;
END;
IF OBJECT_ID(N'dbo.rental_offer_agreement_links',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.rental_offer_agreement_links(
  agreement_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_rental_offer_agreement_links PRIMARY KEY,
  enquiry_id UNIQUEIDENTIFIER NOT NULL,accepted_version INT NOT NULL,application_version INT NOT NULL,
  unit_id UNIQUEIDENTIFIER NULL,rent DECIMAL(18,2) NOT NULL,deposit DECIMAL(18,2) NOT NULL,
  start_date DATE NOT NULL,end_date DATE NOT NULL,
  CONSTRAINT FK_rental_offer_agreement_links_agreement FOREIGN KEY(agreement_id) REFERENCES dbo.agreements(id),
  CONSTRAINT FK_rental_offer_agreement_links_offer FOREIGN KEY(enquiry_id) REFERENCES dbo.property_rental_offers(enquiry_id),
  CONSTRAINT FK_rental_offer_agreement_links_unit FOREIGN KEY(unit_id) REFERENCES dbo.property_units(id),
  CONSTRAINT CK_rental_offer_agreement_links_terms CHECK(accepted_version>0 AND application_version>0 AND rent>0 AND deposit>=0 AND end_date>start_date)
 );
 CREATE INDEX IX_rental_offer_agreement_links_enquiry ON dbo.rental_offer_agreement_links(enquiry_id);
END;
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_agreements_rental_occupancy ON dbo.agreements AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 DECLARE @locked UNIQUEIDENTIFIER;
 SELECT @locked=p.id FROM dbo.properties p WITH(UPDLOCK,HOLDLOCK)
 WHERE EXISTS(SELECT 1 FROM inserted i WHERE i.propertyid=p.id AND i.tenant_id=p.tenant_id);
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.agreements a WITH(UPDLOCK,HOLDLOCK)
  ON a.tenant_id=i.tenant_id AND a.propertyid=i.propertyid AND a.id<>i.id
  WHERE i.status=''active'' AND a.status=''active'' AND (i.unitid IS NULL OR a.unitid IS NULL OR i.unitid=a.unitid))
  THROW 51101,''RENTAL_OCCUPANCY_CONFLICT'',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.property_rental_offers o WITH(UPDLOCK,HOLDLOCK)
  ON o.tenant_id=i.tenant_id AND o.property_id=i.propertyid
  WHERE i.status=''active'' AND o.status IN(''accepted'',''agreement'') AND o.hold_until>SYSUTCDATETIME()
   AND (o.agreement_id IS NULL OR o.agreement_id<>i.id)
   AND (i.unitid IS NULL OR o.unit_id IS NULL OR i.unitid=o.unit_id))
  THROW 51101,''RENTAL_OCCUPANCY_CONFLICT'',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.rental_offer_agreement_links l ON l.agreement_id=i.id JOIN dbo.property_rental_offers o ON o.enquiry_id=l.enquiry_id
  JOIN dbo.property_enquiries e ON e.id=o.enquiry_id
  WHERE i.tenant_id<>o.tenant_id OR i.propertyid<>o.property_id OR i.renteeid<>e.seeker_id
   OR ISNULL(CONVERT(VARCHAR(36),i.unitid),'''')<>ISNULL(CONVERT(VARCHAR(36),l.unit_id),'''')
   OR i.rentamount<>l.rent OR i.depositamount<>l.deposit OR CONVERT(DATE,i.startdate)<>l.start_date OR (CONVERT(DATE,i.enddate)<>l.end_date AND i.status<>''closed'')
   OR i.renteeid IS NULL OR i.propertyid IS NULL OR i.rentamount IS NULL OR i.depositamount IS NULL OR i.startdate IS NULL OR i.enddate IS NULL)
  THROW 51102,''ACCEPTED_RENTAL_TERMS_IMMUTABLE'',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.rental_offer_agreement_links l ON l.agreement_id=i.id JOIN dbo.property_rental_offers o ON o.enquiry_id=l.enquiry_id
  JOIN deleted d ON d.id=i.id
  WHERE (ISNULL(i.content,'''')<>ISNULL(d.content,'''')) OR (ISNULL(i.terms,'''')<>ISNULL(d.terms,'''') AND d.status<>''active'') OR ISNULL(CONVERT(VARCHAR(36),i.templateid),'''')<>ISNULL(CONVERT(VARCHAR(36),d.templateid),''''))
  THROW 51102,''ACCEPTED_RENTAL_TERMS_IMMUTABLE'',1;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.rental_offer_agreement_links l ON l.agreement_id=i.id JOIN dbo.property_rental_offers o ON o.enquiry_id=l.enquiry_id
  JOIN dbo.property_enquiries e ON e.id=o.enquiry_id JOIN dbo.property_applications ap ON ap.enquiry_id=e.id
  WHERE i.status=''active'' AND NOT EXISTS(SELECT 1 FROM deleted d WHERE d.id=i.id AND d.status=''active'') AND (o.agreement_id IS NULL OR o.agreement_id<>i.id OR o.status<>''agreement'' OR o.hold_until<=SYSUTCDATETIME()
   OR ap.status<>''accepted'' OR ap.version<>o.application_version OR e.status NOT IN(''pending'',''responded'')
   OR NOT EXISTS(SELECT 1 FROM dbo.public_listing_preferences pref JOIN dbo.properties p ON p.id=pref.property_id AND p.tenant_id=pref.tenant_id
      WHERE pref.public_id=e.listing_public_id AND pref.property_id=o.property_id AND pref.tenant_id=o.tenant_id
      AND pref.opted_out=0 AND p.country_code=e.country_code AND pref.country_code=e.country_code AND p.status IN(''active'',''available'',''rented''))))
  THROW 51103,''RENTAL_ACCEPTANCE_NO_LONGER_VALID'',1;

 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.rental_offer_agreement_links l ON l.agreement_id=i.id JOIN dbo.property_rental_offers o ON o.enquiry_id=l.enquiry_id
  WHERE i.status=''active'' AND NOT EXISTS(SELECT 1 FROM deleted d WHERE d.id=i.id AND d.status=''active'') AND (
   NOT (i.signeddate IS NOT NULL OR i.signature_completed_at IS NOT NULL OR COALESCE(i.signature_status,'''') IN(''signed'',''completed'',''complete'',''signing_complete'',''fully_signed'',''manual_signed''))
   OR NOT EXISTS(SELECT 1 FROM dbo.tenant_memberships tm JOIN dbo.app_users au ON au.id=tm.app_user_id
     JOIN dbo.auth_users auth ON auth.auth_id=au.auth_id AND auth.app_user_id=au.id
     WHERE tm.tenant_id=i.tenant_id AND tm.app_user_id=i.renteeid AND tm.status=''active'' AND tm.role IN(''tenant'',''rentee'')
       AND (au.status IS NULL OR au.status=''active'') AND LOWER(LTRIM(RTRIM(auth.email)))=LOWER(LTRIM(RTRIM(au.email))))
   OR COALESCE((SELECT SUM(d.amount) FROM dbo.tenancy_deposit_transactions d WHERE d.agreement_id=i.id AND d.tenant_id=i.tenant_id AND d.status=''received'' AND d.transaction_type=''security_deposit''),0)<COALESCE(i.depositamount,0)
   OR NOT EXISTS(SELECT 1 FROM dbo.tenancy_move_in_checklists c WHERE c.agreement_id=i.id AND c.tenant_id=i.tenant_id AND c.status=''completed''
      AND NOT EXISTS(SELECT 1 FROM dbo.tenancy_move_in_checklist_items ci WHERE ci.checklist_id=c.id AND ci.tenant_id=i.tenant_id AND ci.is_required=1 AND ci.status<>''completed''))
  )) THROW 51104,''RENTAL_ACTIVATION_NOT_READY'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_property_applications_invalidate_rental_offer ON dbo.property_applications AFTER UPDATE AS
BEGIN
 SET NOCOUNT ON;
 UPDATE o SET status=''invalidated'',version=o.version+1,updated_at=SYSUTCDATETIME()
 FROM dbo.property_rental_offers o JOIN inserted i ON i.enquiry_id=o.enquiry_id
 WHERE o.status IN(''offered'',''accepted'',''agreement'') AND (i.status<>''accepted'' OR i.version<>o.application_version)
 AND NOT EXISTS(SELECT 1 FROM dbo.agreements a WHERE a.id=o.agreement_id AND a.status=''active'');
 INSERT INTO dbo.property_rental_offer_events(enquiry_id,version,event_type,snapshot)
 SELECT o.enquiry_id,o.version,''invalidated'',(SELECT o.* FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)
 FROM dbo.property_rental_offers o JOIN inserted i ON i.enquiry_id=o.enquiry_id
 WHERE o.status=''invalidated'' AND NOT EXISTS(SELECT 1 FROM dbo.property_rental_offer_events ev WHERE ev.enquiry_id=o.enquiry_id AND ev.version=o.version);
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_property_enquiries_invalidate_rental_offer ON dbo.property_enquiries AFTER UPDATE AS
BEGIN
 SET NOCOUNT ON;
 UPDATE o SET status=''invalidated'',version=o.version+1,updated_at=SYSUTCDATETIME()
 FROM dbo.property_rental_offers o JOIN inserted i ON i.id=o.enquiry_id
 WHERE o.status IN(''offered'',''accepted'',''agreement'') AND (i.status NOT IN(''pending'',''responded''))
 AND NOT EXISTS(SELECT 1 FROM dbo.agreements a WHERE a.id=o.agreement_id AND a.status=''active'');
 INSERT INTO dbo.property_rental_offer_events(enquiry_id,version,event_type,snapshot)
 SELECT o.enquiry_id,o.version,''invalidated'',(SELECT o.* FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)
 FROM dbo.property_rental_offers o JOIN inserted i ON i.id=o.enquiry_id
 WHERE o.status=''invalidated'' AND NOT EXISTS(SELECT 1 FROM dbo.property_rental_offer_events ev WHERE ev.enquiry_id=o.enquiry_id AND ev.version=o.version);
END');
COMMIT TRANSACTION;
END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK TRANSACTION; THROW; END CATCH;
