SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.management_pricing_versions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.management_pricing_versions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_management_pricing_versions PRIMARY KEY,
    market CHAR(2) NOT NULL,
    version INT NOT NULL,
    rules_json NVARCHAR(MAX) NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT DF_management_pricing_status DEFAULT 'draft',
    stripe_price_id VARCHAR(100) NULL,
    created_by UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.app_users(id),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_management_pricing_created DEFAULT SYSUTCDATETIME(),
    published_at DATETIME2 NULL,
    CONSTRAINT UQ_management_pricing_version UNIQUE(market,version),
    CONSTRAINT CK_management_pricing_market CHECK(market IN('LK','BN')),
    CONSTRAINT CK_management_pricing_version CHECK(version > 0),
    CONSTRAINT CK_management_pricing_json CHECK(ISJSON(rules_json)=1),
    CONSTRAINT CK_management_pricing_status CHECK(status IN('draft','sandbox_published'))
  );
END;

IF OBJECT_ID(N'dbo.management_billing_accounts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.management_billing_accounts (
    tenant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_management_billing_accounts PRIMARY KEY REFERENCES dbo.tenants(id),
    stripe_account_id VARCHAR(100) NOT NULL,
    stripe_customer_id VARCHAR(100) NULL,
    stripe_subscription_id VARCHAR(100) NULL,
    stripe_item_id VARCHAR(100) NULL,
    stripe_schedule_id VARCHAR(100) NULL,
    stripe_price_id VARCHAR(100) NOT NULL,
    pricing_version_id UNIQUEIDENTIFIER NULL REFERENCES dbo.management_pricing_versions(id),
    market CHAR(2) NOT NULL,
    subscription_status VARCHAR(30) NOT NULL CONSTRAINT DF_management_billing_status DEFAULT 'pending',
    initial_payment_verified BIT NOT NULL CONSTRAINT DF_management_billing_initial DEFAULT 0,
    paid_through DATETIME2 NULL,
    grace_started_at DATETIME2 NULL,
    cancel_at_period_end BIT NOT NULL CONSTRAINT DF_management_billing_cancel DEFAULT 0,
    risk_hold BIT NOT NULL CONSTRAINT DF_management_billing_risk DEFAULT 0,
    quantity INT NOT NULL CONSTRAINT DF_management_billing_quantity DEFAULT 0,
    inventory_json NVARCHAR(MAX) NOT NULL,
    pending_quantity INT NULL,
    comp_type VARCHAR(20) NULL,
    comp_expires_at DATETIME2 NULL,
    version INT NOT NULL CONSTRAINT DF_management_billing_version DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_management_billing_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_management_billing_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_management_billing_sandbox CHECK(stripe_account_id='acct_1UTgcdQ4sARuLNQa'),
    CONSTRAINT CK_management_billing_market CHECK(market IN('LK','BN')),
    CONSTRAINT CK_management_billing_inventory CHECK(ISJSON(inventory_json)=1),
    CONSTRAINT CK_management_billing_quantities CHECK(quantity>=0 AND (pending_quantity IS NULL OR pending_quantity>=0)),
    CONSTRAINT CK_management_billing_comp CHECK(comp_type IS NULL OR comp_type IN('fixed','ongoing'))
  );
  CREATE UNIQUE INDEX UQ_management_billing_customer ON dbo.management_billing_accounts(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
  CREATE UNIQUE INDEX UQ_management_billing_subscription ON dbo.management_billing_accounts(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.management_billing_commands', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.management_billing_commands (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_management_billing_commands PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.management_billing_accounts(tenant_id),
    kind VARCHAR(30) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    payload_json NVARCHAR(MAX) NOT NULL,
    status VARCHAR(20) NOT NULL,
    result_json NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_management_billing_commands_created DEFAULT SYSUTCDATETIME(),
    completed_at DATETIME2 NULL,
    CONSTRAINT CK_management_billing_commands_status CHECK(status IN('pending','completed','failed')),
    CONSTRAINT CK_management_billing_commands_payload CHECK(ISJSON(payload_json)=1),
    CONSTRAINT CK_management_billing_commands_result CHECK(result_json IS NULL OR ISJSON(result_json)=1)
  );
  CREATE INDEX IX_management_billing_commands_tenant ON dbo.management_billing_commands(tenant_id,created_at);
END;

IF OBJECT_ID(N'dbo.management_billing_events', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.management_billing_events (
    stripe_event_id VARCHAR(100) NOT NULL CONSTRAINT PK_management_billing_events PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.management_billing_accounts(tenant_id),
    event_type VARCHAR(100) NOT NULL,
    processed_at DATETIME2 NOT NULL CONSTRAINT DF_management_billing_events_processed DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.management_billing_audit', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.management_billing_audit (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_management_billing_audit PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NULL REFERENCES dbo.tenants(id),
    actor_id UNIQUEIDENTIFIER NULL REFERENCES dbo.app_users(id),
    action VARCHAR(80) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    previous_hash CHAR(64) NULL,
    current_hash CHAR(64) NOT NULL,
    reason NVARCHAR(1000) NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_management_billing_audit_created DEFAULT SYSUTCDATETIME()
  );
END;
COMMIT;
