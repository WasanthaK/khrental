SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.management_inventory_splits','U') IS NULL
BEGIN
  CREATE TABLE dbo.management_inventory_splits(
    command_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.management_billing_commands(id),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tenants(id),
    property_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.properties(id),
    state VARCHAR(12) NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','active','aborted')),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    activated_at DATETIME2 NULL,
    CONSTRAINT CK_management_split_activation CHECK((state='active' AND activated_at IS NOT NULL) OR (state<>'active' AND activated_at IS NULL))
  );
  CREATE UNIQUE INDEX UQ_management_split_parent ON dbo.management_inventory_splits(tenant_id,property_id) WHERE state<>'aborted';
  CREATE TABLE dbo.management_inventory_split_units(
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    command_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.management_inventory_splits(command_id),
    payload_json NVARCHAR(MAX) NOT NULL CHECK(ISJSON(payload_json)=1),
    payload_hash CHAR(64) NOT NULL
  );
END;
IF COL_LENGTH('dbo.property_units','split_operation_id') IS NULL
  ALTER TABLE dbo.property_units ADD split_operation_id UNIQUEIDENTIFIER NULL REFERENCES dbo.management_inventory_splits(command_id),
    parent_stock_id UNIQUEIDENTIFIER NULL,stock_type VARCHAR(30) NULL;
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_units_split_identity ON dbo.property_units AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.id=d.id WHERE d.split_operation_id IS NOT NULL AND
   (i.id IS NULL OR i.split_operation_id IS NULL OR i.split_operation_id<>d.split_operation_id OR i.parent_stock_id<>d.parent_stock_id OR i.propertyid<>d.propertyid OR i.tenant_id<>d.tenant_id))
 THROW 51076,''Retain split identity and history; use ending management instead of deletion.'',1;
 IF EXISTS(SELECT 1 FROM inserted i WHERE (i.split_operation_id IS NOT NULL OR i.parent_stock_id IS NOT NULL OR i.stock_type IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM dbo.management_inventory_splits s JOIN dbo.management_inventory_split_units r ON r.command_id=s.command_id AND r.id=i.id
     WHERE s.command_id=i.split_operation_id AND s.tenant_id=i.tenant_id AND s.property_id=i.propertyid AND i.parent_stock_id=s.property_id
       AND i.stock_type=''apartment_unit'' AND s.state=''active''))
 THROW 51077,''A live split unit requires its confirmed parent operation.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_agreements_split_inventory ON dbo.agreements AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_splits s ON s.tenant_id=i.tenant_id AND s.property_id=i.propertyid AND s.state=''active''
   WHERE LOWER(COALESCE(i.status,'''')) NOT IN(''closed'',''cancelled'') AND
   ((i.unitid IS NULL AND (NOT EXISTS(SELECT 1 FROM deleted d WHERE d.id=i.id AND LOWER(COALESCE(d.status,'''')) NOT IN(''closed'',''cancelled'')) OR EXISTS(SELECT 1 FROM dbo.agreements child WHERE child.tenant_id=i.tenant_id AND child.propertyid=i.propertyid AND child.unitid IS NOT NULL AND LOWER(COALESCE(child.status,'''')) NOT IN(''closed'',''cancelled'')))) OR
    (i.unitid IS NOT NULL AND EXISTS(SELECT 1 FROM dbo.agreements a WHERE a.tenant_id=i.tenant_id AND a.propertyid=i.propertyid AND a.unitid IS NULL AND LOWER(COALESCE(a.status,'''')) NOT IN(''closed'',''cancelled'')))))
 THROW 51078,''Split units cannot overlap the retained whole-property tenancy.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_offers_split_inventory ON dbo.property_rental_offers AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_splits s ON s.tenant_id=i.tenant_id AND s.property_id=i.property_id AND s.state=''active''
   WHERE i.status IN(''offered'',''accepted'',''agreement'') AND
   (i.unit_id IS NULL OR EXISTS(SELECT 1 FROM dbo.agreements a WHERE a.tenant_id=i.tenant_id AND a.propertyid=i.property_id AND a.unitid IS NULL AND LOWER(COALESCE(a.status,'''')) NOT IN(''closed'',''cancelled''))))
 THROW 51079,''Close the retained whole-property tenancy before offering split units.'',1;
END');
COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
