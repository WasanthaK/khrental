SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.management_inventory_staging',N'U') IS NULL
BEGIN
  -- Pending records are deliberately outside operational/public property tables.
  -- Stable IDs become the domain IDs only after confirmed billing promotion.
  CREATE TABLE dbo.management_inventory_staging (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_management_inventory_staging PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tenants(id),
    kind VARCHAR(12) NOT NULL,
    payload_json NVARCHAR(MAX) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    status VARCHAR(12) NOT NULL CONSTRAINT DF_management_inventory_status DEFAULT 'pending',
    created_by UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.app_users(id),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_management_inventory_created DEFAULT SYSUTCDATETIME(),
    promoted_at DATETIME2 NULL,
    withdrawn_at DATETIME2 NULL,
    promotion_command_id UNIQUEIDENTIFIER NULL REFERENCES dbo.management_billing_commands(id),
    CONSTRAINT CK_management_inventory_kind CHECK(kind IN('property','unit')),
    CONSTRAINT CK_management_inventory_payload CHECK(ISJSON(payload_json)=1),
    CONSTRAINT CK_management_inventory_status CHECK(status IN('pending','promoted','withdrawn')),
    CONSTRAINT CK_management_inventory_promotion CHECK(
      (status='pending' AND promoted_at IS NULL AND promotion_command_id IS NULL AND withdrawn_at IS NULL) OR
      (status='promoted' AND promoted_at IS NOT NULL AND promotion_command_id IS NOT NULL AND withdrawn_at IS NULL) OR
      (status='withdrawn' AND promoted_at IS NULL AND promotion_command_id IS NULL AND withdrawn_at IS NOT NULL))
  );
  CREATE INDEX IX_management_inventory_pending ON dbo.management_inventory_staging(tenant_id,status,id);
END;
COMMIT;
