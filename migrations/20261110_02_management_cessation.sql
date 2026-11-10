SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.management_inventory_controls',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.management_inventory_controls(
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_management_inventory_controls PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tenants(id),
    property_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.properties(id),
    unit_id UNIQUEIDENTIFIER NULL REFERENCES dbo.property_units(id),
    state VARCHAR(12) NOT NULL CONSTRAINT DF_management_inventory_control_state DEFAULT 'ceased',
    ceased_by UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.app_users(id),
    ceased_at DATETIME2 NOT NULL CONSTRAINT DF_management_inventory_ceased_at DEFAULT SYSUTCDATETIME(),
    reason NVARCHAR(1000) NOT NULL,
    CONSTRAINT UQ_management_inventory_resource UNIQUE(tenant_id,property_id,unit_id),
    CONSTRAINT CK_management_inventory_control_state CHECK(state='ceased'),
    CONSTRAINT CK_management_inventory_control_reason CHECK(LEN(LTRIM(RTRIM(reason))) BETWEEN 10 AND 1000)
  );
END;

-- Cessation is durable independently of application flags. New operational
-- obligations cannot race in after the checked transaction commits. Historical
-- reads, closed signing outcomes and existing financial result updates remain.
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_agreements_management_cessation ON dbo.agreements AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_controls c
   ON c.tenant_id=i.tenant_id AND c.property_id=i.propertyid AND c.state=''ceased''
   AND (c.unit_id IS NULL OR i.unitid IS NULL OR c.unit_id=i.unitid)
   WHERE LOWER(COALESCE(i.status,'''')) NOT IN(''closed'',''cancelled''))
 THROW 51070,''Management has ceased for this property or unit.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_maintenance_management_cessation ON dbo.maintenance_requests AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_controls c
   ON c.tenant_id=i.tenant_id AND c.property_id=i.propertyid AND c.state=''ceased''
   AND (c.unit_id IS NULL OR i.unitid IS NULL OR c.unit_id=i.unitid)
   WHERE LOWER(COALESCE(i.status,'''')) NOT IN(''completed'',''cancelled''))
 THROW 51071,''Management has ceased for this property or unit.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_invoices_management_cessation ON dbo.invoices AFTER INSERT AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i LEFT JOIN dbo.agreements a ON a.id=i.agreementid AND a.tenant_id=i.tenant_id
   JOIN dbo.management_inventory_controls c ON c.tenant_id=i.tenant_id AND c.state=''ceased''
   AND (c.property_id=i.propertyid OR c.property_id=a.propertyid)
   AND (c.unit_id IS NULL OR a.unitid IS NULL OR c.unit_id=a.unitid))
 THROW 51072,''New rental invoices require a managed property or unit.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_units_management_cessation ON dbo.property_units AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_controls c
   ON c.tenant_id=i.tenant_id AND c.property_id=i.propertyid AND c.state=''ceased''
   AND (c.unit_id IS NULL OR c.unit_id=i.id))
 THROW 51073,''Management has ceased for this property or unit.'',1;
END');
EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_properties_management_cessation ON dbo.properties AFTER UPDATE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.management_inventory_controls c
   ON c.tenant_id=i.tenant_id AND c.property_id=i.id AND c.unit_id IS NULL AND c.state=''ceased'')
 THROW 51074,''Management has ceased for this property.'',1;
END');
COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
