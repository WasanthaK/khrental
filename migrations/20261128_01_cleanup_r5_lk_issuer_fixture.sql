-- R5 row 32: remove the exact mutable disposable issuer-cutover workspace.
-- The initial XZ issuer assignment and issuer are retained as immutable invoice history.
-- This migration is deliberately operation-specific and fails closed on any drift.
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @operation UNIQUEIDENTIFIER='92019876-cdeb-47d3-ae8b-9a0fdd4cb22d';
  DECLARE @initial_assignment UNIQUEIDENTIFIER='4a1aa809-e3ea-4c74-9c63-c18c7494d994';
  DECLARE @initial_issuer UNIQUEIDENTIFIER='30f19aad-923c-44c5-993b-6980dbfec67a';
  DECLARE @later_assignment UNIQUEIDENTIFIER='abdc3aa1-ef6f-4fa9-bb9c-6e487bc6bc88';
  DECLARE @later_issuer UNIQUEIDENTIFIER='7744c522-545e-4373-9ba5-305c338fb227';
  DECLARE @email NVARCHAR(320)=N'r5-issuer-92019876-cdeb-47d3-ae8b-9a0fdd4cb22d@example.invalid';
  DECLARE @slug NVARCHAR(200)=N'r5-issuer-92019876-cdeb-47d3-ae8b-9a0fdd4cb22d';
  DECLARE @label NVARCHAR(255)=N'R5 synthetic deployed issuer cutover 92019876-cdeb-47d3-ae8b-9a0fdd4cb22d';
  DECLARE @actor UNIQUEIDENTIFIER;
  DECLARE @property UNIQUEIDENTIFIER;
  DECLARE @preference UNIQUEIDENTIFIER;

  IF EXISTS(SELECT 1 FROM dbo.tenants WITH (UPDLOCK,HOLDLOCK) WHERE id=@operation)
  BEGIN
    IF (SELECT COUNT(*) FROM dbo.tenants WHERE id=@operation AND name=@label AND slug=@slug
          AND status=N'active' AND [plan]=N'development-testing')<>1
      THROW 51320,'R5 issuer cleanup refused: tenant identity drift.',1;

    IF (SELECT COUNT(*) FROM dbo.app_users WHERE tenant_id=@operation OR email=@email)<>1
      THROW 51321,'R5 issuer cleanup refused: app-user count drift.',1;
    SELECT @actor=id FROM dbo.app_users WHERE tenant_id=@operation AND email=@email AND name=@label
      AND user_type=N'admin' AND status=N'active';
    IF @actor IS NULL
      THROW 51322,'R5 issuer cleanup refused: app-user identity drift.',1;

    IF (SELECT COUNT(*) FROM dbo.tenant_memberships WHERE tenant_id=@operation AND app_user_id=@actor
          AND role=N'viewer' AND status=N'active' AND is_default=1)<>1
      THROW 51323,'R5 issuer cleanup refused: membership drift.',1;

    IF (SELECT COUNT(*) FROM dbo.properties WHERE tenant_id=@operation)<>1
      THROW 51324,'R5 issuer cleanup refused: property count drift.',1;
    SELECT @property=id FROM dbo.properties WHERE tenant_id=@operation
      AND name=N'R5 synthetic LKR 100000 dwelling' AND status=N'rented'
      AND propertytype=N'house' AND country_code='LK';
    IF @property IS NULL
      THROW 51325,'R5 issuer cleanup refused: property identity drift.',1;

    IF (SELECT COUNT(*) FROM dbo.agreements WHERE tenant_id=@operation AND propertyid=@property
          AND status=N'active' AND rentamount=100000)<>1
      THROW 51326,'R5 issuer cleanup refused: agreement drift.',1;

    SELECT @preference=public_id FROM dbo.public_listing_preferences
      WHERE tenant_id=@operation AND property_id=@property AND country_code='LK'
        AND updated_by IS NULL AND location_label IS NULL AND public_headline IS NULL
        AND opted_out=0 AND opted_out_at IS NULL;
    IF @preference IS NULL OR (SELECT COUNT(*) FROM dbo.public_listing_preferences
          WHERE tenant_id=@operation OR property_id=@property)<>1
      THROW 51327,'R5 issuer cleanup refused: listing preference drift.',1;
    IF EXISTS(SELECT 1 FROM dbo.public_listing_media WHERE listing_public_id=@preference)
      OR EXISTS(SELECT 1 FROM dbo.property_enquiries WHERE listing_public_id=@preference)
      THROW 51328,'R5 issuer cleanup refused: public listing children exist.',1;

    IF (SELECT COUNT(*) FROM dbo.management_billing_accounts WHERE tenant_id=@operation
          AND stripe_account_id='acct_1UTgcdQ4sARuLNQa' AND market='LK'
          AND subscription_status='canceled' AND initial_payment_verified=1 AND quantity=1)<>1
      THROW 51329,'R5 issuer cleanup refused: billing account drift.',1;
    IF (SELECT COUNT(*) FROM dbo.management_billing_events WHERE tenant_id=@operation)<>5
      OR (SELECT COUNT(*) FROM dbo.management_billing_audit WHERE tenant_id=@operation)<>5
      THROW 51330,'R5 issuer cleanup refused: billing receipt count drift.',1;
    IF NOT EXISTS(SELECT 1 FROM dbo.management_billing_events e
        JOIN dbo.management_billing_audit a ON a.tenant_id=e.tenant_id AND a.resource_id=e.stripe_event_id
        WHERE e.tenant_id=@operation AND e.event_type='customer.subscription.deleted'
          AND a.action='stripe.event_reconciled' AND a.reason=e.event_type)
      THROW 51331,'R5 issuer cleanup refused: cancellation receipt missing.',1;

    IF (SELECT COUNT(*) FROM dbo.auth_users WHERE app_user_id=@actor OR email=@email)<>1
      OR (SELECT COUNT(*) FROM dbo.auth_sessions s JOIN dbo.auth_users u ON u.id=s.auth_user_id
          WHERE u.app_user_id=@actor AND u.email=@email)<>1
      THROW 51332,'R5 issuer cleanup refused: auth identity drift.',1;

    IF (SELECT COUNT(*) FROM dbo.management_market_issuer_assignments WHERE market='XZ')<>2
      THROW 51333,'R5 issuer cleanup refused: XZ assignment count drift.',1;
    IF NOT EXISTS(SELECT 1 FROM dbo.management_market_issuer_assignments a
        JOIN dbo.management_invoice_issuers i ON i.id=a.issuer_id
        WHERE a.id=@initial_assignment AND a.market='XZ' AND a.issuer_id=@initial_issuer
          AND a.effective_at_utc=CONVERT(DATETIME2(7),'2026-11-28T00:01:57.7000000')
          AND a.effective_at_utc<=SYSUTCDATETIME()
          AND a.approval_reference=N'R5 row 32 isolated synthetic schedule'
          AND i.legal_name=N'R5 Synthetic Initial Issuer' AND i.country_code='US')
      THROW 51334,'R5 issuer cleanup refused: retained issuer history drift.',1;
    IF NOT EXISTS(SELECT 1 FROM dbo.management_market_issuer_assignments a
        JOIN dbo.management_invoice_issuers i ON i.id=a.issuer_id
        WHERE a.id=@later_assignment AND a.market='XZ' AND a.issuer_id=@later_issuer
          AND a.effective_at_utc=CONVERT(DATETIME2(7),'2026-12-27T18:01:54')
          AND a.effective_at_utc>SYSUTCDATETIME()
          AND a.approval_reference=N'R5 row 32 isolated later synthetic assignment'
          AND i.legal_name=N'R5 Synthetic Later Issuer' AND i.country_code='LK')
      THROW 51335,'R5 issuer cleanup refused: removable issuer schedule drift.',1;
    IF EXISTS(SELECT 1 FROM dbo.management_market_issuer_assignments
        WHERE market<>'XZ' AND issuer_id IN(@initial_issuer,@later_issuer))
      THROW 51336,'R5 issuer cleanup refused: synthetic issuer has a foreign assignment.',1;

    DELETE s FROM dbo.auth_sessions s JOIN dbo.auth_users u ON u.id=s.auth_user_id
      WHERE u.app_user_id=@actor AND u.email=@email;
    IF @@ROWCOUNT<>1 THROW 51337,'R5 issuer cleanup refused: auth-session delete drift.',1;
    DELETE dbo.management_billing_events WHERE tenant_id=@operation;
    IF @@ROWCOUNT<>5 THROW 51338,'R5 issuer cleanup refused: event delete drift.',1;
    DELETE dbo.management_billing_audit WHERE tenant_id=@operation;
    IF @@ROWCOUNT<>5 THROW 51339,'R5 issuer cleanup refused: audit delete drift.',1;
    DELETE dbo.management_billing_accounts WHERE tenant_id=@operation;
    IF @@ROWCOUNT<>1 THROW 51340,'R5 issuer cleanup refused: account delete drift.',1;
    DELETE dbo.agreements WHERE tenant_id=@operation;
    IF @@ROWCOUNT<>1 THROW 51341,'R5 issuer cleanup refused: agreement delete drift.',1;
    DELETE dbo.public_listing_preferences WHERE public_id=@preference AND tenant_id=@operation AND property_id=@property;
    IF @@ROWCOUNT<>1 THROW 51342,'R5 issuer cleanup refused: preference delete drift.',1;
    DELETE dbo.properties WHERE id=@property AND tenant_id=@operation;
    IF @@ROWCOUNT<>1 THROW 51343,'R5 issuer cleanup refused: property delete drift.',1;
    DELETE dbo.auth_users WHERE app_user_id=@actor AND email=@email;
    IF @@ROWCOUNT<>1 THROW 51344,'R5 issuer cleanup refused: auth-user delete drift.',1;
    DELETE dbo.tenant_memberships WHERE tenant_id=@operation AND app_user_id=@actor;
    IF @@ROWCOUNT<>1 THROW 51345,'R5 issuer cleanup refused: membership delete drift.',1;
    DELETE dbo.app_users WHERE id=@actor AND tenant_id=@operation AND email=@email;
    IF @@ROWCOUNT<>1 THROW 51346,'R5 issuer cleanup refused: app-user delete drift.',1;
    DELETE dbo.tenants WHERE id=@operation AND slug=@slug;
    IF @@ROWCOUNT<>1 THROW 51347,'R5 issuer cleanup refused: tenant delete drift.',1;
    DELETE dbo.management_market_issuer_assignments
      WHERE id=@later_assignment AND market='XZ' AND issuer_id=@later_issuer
        AND effective_at_utc>SYSUTCDATETIME();
    IF @@ROWCOUNT<>1 THROW 51348,'R5 issuer cleanup refused: future assignment delete drift.',1;
    DELETE dbo.management_invoice_issuers WHERE id=@later_issuer
      AND legal_name=N'R5 Synthetic Later Issuer' AND country_code='LK';
    IF @@ROWCOUNT<>1 THROW 51349,'R5 issuer cleanup refused: later issuer delete drift.',1;
  END;

  IF EXISTS(SELECT 1 FROM dbo.tenants WHERE id=@operation)
    OR EXISTS(SELECT 1 FROM dbo.app_users WHERE tenant_id=@operation OR email=@email)
    OR EXISTS(SELECT 1 FROM dbo.tenant_memberships WHERE tenant_id=@operation)
    OR EXISTS(SELECT 1 FROM dbo.properties WHERE tenant_id=@operation)
    OR EXISTS(SELECT 1 FROM dbo.public_listing_preferences WHERE tenant_id=@operation)
    OR EXISTS(SELECT 1 FROM dbo.agreements WHERE tenant_id=@operation)
    OR EXISTS(SELECT 1 FROM dbo.management_billing_accounts WHERE tenant_id=@operation)
    OR EXISTS(SELECT 1 FROM dbo.management_billing_events WHERE tenant_id=@operation)
    OR EXISTS(SELECT 1 FROM dbo.management_billing_audit WHERE tenant_id=@operation)
    OR EXISTS(SELECT 1 FROM dbo.auth_users WHERE email=@email)
    OR EXISTS(SELECT 1 FROM dbo.auth_sessions s JOIN dbo.auth_users u ON u.id=s.auth_user_id WHERE u.email=@email)
    OR EXISTS(SELECT 1 FROM dbo.management_market_issuer_assignments WHERE id=@later_assignment OR issuer_id=@later_issuer)
    OR EXISTS(SELECT 1 FROM dbo.management_invoice_issuers WHERE id=@later_issuer)
    THROW 51350,'R5 issuer cleanup verification failed: mutable residue remains.',1;

  IF EXISTS(SELECT 1 FROM dbo.management_market_issuer_assignments WHERE market='XZ' AND id<>@initial_assignment)
    OR EXISTS(SELECT 1 FROM dbo.management_invoice_issuers
      WHERE legal_name IN(N'R5 Synthetic Initial Issuer',N'R5 Synthetic Later Issuer') AND id<>@initial_issuer)
    THROW 51351,'R5 issuer cleanup verification failed: unexpected synthetic history remains.',1;

  IF (CASE WHEN EXISTS(SELECT 1 FROM dbo.management_market_issuer_assignments WHERE id=@initial_assignment) THEN 1 ELSE 0 END)
      +(CASE WHEN EXISTS(SELECT 1 FROM dbo.management_invoice_issuers WHERE id=@initial_issuer) THEN 1 ELSE 0 END)=1
    THROW 51352,'R5 issuer cleanup verification failed: incomplete retained history.',1;

  IF EXISTS(SELECT 1 FROM dbo.management_market_issuer_assignments WHERE id=@initial_assignment)
    AND NOT EXISTS(SELECT 1 FROM dbo.management_market_issuer_assignments a
      JOIN dbo.management_invoice_issuers i ON i.id=a.issuer_id
      WHERE a.id=@initial_assignment AND a.market='XZ' AND a.issuer_id=@initial_issuer
        AND a.effective_at_utc=CONVERT(DATETIME2(7),'2026-11-28T00:01:57.7000000')
        AND a.approval_reference=N'R5 row 32 isolated synthetic schedule'
        AND i.legal_name=N'R5 Synthetic Initial Issuer' AND i.country_code='US'
        AND NOT EXISTS(SELECT 1 FROM dbo.management_market_issuer_assignments other
          WHERE other.issuer_id=i.id AND other.id<>a.id))
    THROW 51353,'R5 issuer cleanup verification failed: retained history drift.',1;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
