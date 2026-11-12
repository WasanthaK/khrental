SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.management_inventory_controls','restored_at') IS NULL
BEGIN
  ALTER TABLE dbo.management_inventory_controls ADD restored_at DATETIME2 NULL,
    restored_by UNIQUEIDENTIFIER NULL REFERENCES dbo.app_users(id),
    restoration_command_id UNIQUEIDENTIFIER NULL REFERENCES dbo.management_billing_commands(id),
    restoration_reason NVARCHAR(1000) NULL;
END;
-- Retain every historical cessation episode; only one may currently be active.
IF EXISTS(SELECT 1 FROM sys.key_constraints WHERE name='UQ_management_inventory_resource' AND parent_object_id=OBJECT_ID('dbo.management_inventory_controls'))
  ALTER TABLE dbo.management_inventory_controls DROP CONSTRAINT UQ_management_inventory_resource;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UQ_management_inventory_active_resource' AND object_id=OBJECT_ID('dbo.management_inventory_controls'))
  EXEC(N'CREATE UNIQUE INDEX UQ_management_inventory_active_resource ON dbo.management_inventory_controls(tenant_id,property_id,unit_id) WHERE restored_at IS NULL');
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_management_inventory_restoration')
  EXEC(N'ALTER TABLE dbo.management_inventory_controls ADD CONSTRAINT CK_management_inventory_restoration CHECK(
    (restored_at IS NULL AND restored_by IS NULL AND restoration_command_id IS NULL AND restoration_reason IS NULL) OR
    (restored_at IS NOT NULL AND restored_by IS NOT NULL AND restoration_command_id IS NOT NULL AND restoration_reason IS NOT NULL
      AND restored_at>=ceased_at AND LEN(LTRIM(RTRIM(restoration_reason))) BETWEEN 10 AND 1000))');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_agreements_management_cessation ON dbo.agreements AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_controls c
   ON c.tenant_id=i.tenant_id AND c.property_id=i.propertyid AND c.state=''ceased'' AND c.restored_at IS NULL
   AND (c.unit_id IS NULL OR i.unitid IS NULL OR c.unit_id=i.unitid)
   WHERE LOWER(COALESCE(i.status,'''')) NOT IN(''closed'',''cancelled''))
 THROW 51070,''Management has ceased for this property or unit.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_maintenance_management_cessation ON dbo.maintenance_requests AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_controls c
   ON c.tenant_id=i.tenant_id AND c.property_id=i.propertyid AND c.state=''ceased'' AND c.restored_at IS NULL
   AND (c.unit_id IS NULL OR i.unitid IS NULL OR c.unit_id=i.unitid)
   WHERE LOWER(COALESCE(i.status,'''')) NOT IN(''completed'',''cancelled''))
 THROW 51071,''Management has ceased for this property or unit.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_invoices_management_cessation ON dbo.invoices AFTER INSERT AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i LEFT JOIN dbo.agreements a ON a.id=i.agreementid AND a.tenant_id=i.tenant_id
   JOIN dbo.management_inventory_controls c ON c.tenant_id=i.tenant_id AND c.state=''ceased'' AND c.restored_at IS NULL
   AND (c.property_id=i.propertyid OR c.property_id=a.propertyid)
   AND (c.unit_id IS NULL OR a.unitid IS NULL OR c.unit_id=a.unitid))
 THROW 51072,''New rental invoices require a managed property or unit.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_units_management_cessation ON dbo.property_units AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_controls c
   ON c.tenant_id=i.tenant_id AND c.property_id=i.propertyid AND c.state=''ceased'' AND c.restored_at IS NULL
   AND (c.unit_id IS NULL OR c.unit_id=i.id))
 THROW 51073,''Management has ceased for this property or unit.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_properties_management_cessation ON dbo.properties AFTER UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_controls c
   ON c.tenant_id=i.tenant_id AND c.property_id=i.id AND c.unit_id IS NULL AND c.state=''ceased'' AND c.restored_at IS NULL)
 THROW 51074,''Management has ceased for this property.'',1;
END');
COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
