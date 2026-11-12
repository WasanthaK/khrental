SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.management_billing_recovery',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.management_billing_recovery (
  command_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.management_billing_commands(id),
  actor_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.app_users(id),
  intent_json NVARCHAR(MAX) NOT NULL CHECK(ISJSON(intent_json)=1),
  state VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK(state IN('pending','running','succeeded','failed_needs_review')),
  attempts INT NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
  lease_token UNIQUEIDENTIFIER NULL,
  lease_until DATETIME2 NULL,
  next_attempt_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  last_error VARCHAR(80) NULL,
  completed_at DATETIME2 NULL
 );
 CREATE INDEX IX_management_recovery_due ON dbo.management_billing_recovery(state,next_attempt_at,lease_until);
END;
IF OBJECT_ID(N'dbo.management_billing_steps',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.management_billing_steps (
  command_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.management_billing_recovery(command_id),
  name VARCHAR(60) NOT NULL,
  input_hash CHAR(64) NOT NULL,
  input_json NVARCHAR(MAX) NOT NULL CHECK(ISJSON(input_json)=1),
  idempotency_key VARCHAR(255) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  result_json NVARCHAR(MAX) NULL CHECK(result_json IS NULL OR ISJSON(result_json)=1),
  completed_at DATETIME2 NULL,
  CONSTRAINT PK_management_billing_steps PRIMARY KEY(command_id,name)
 );
END;
COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
