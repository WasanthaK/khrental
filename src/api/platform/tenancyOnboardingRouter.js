import { withManagementWrite, runManagementQuery, runSingleManagementQuery } from '../managementBilling/store.js';
import express from 'express';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS, isAdminRole, isTenantRole } from './permissionEngine.js';
import {
  evaluateTenancyActivationReadiness,
  loadRentalReservationReadiness,
  getActivationBlockingReasons,
  isAgreementSignatureComplete
} from './tenancyActivation.js';
import {
  MAX_TENANCY_BILLING_DAY,
  MIN_TENANCY_BILLING_DAY,
  normalizeTenancyBillingDay,
  resolveAgreementBillingDay
} from './billingLifecycle.js';

const createRequestError = (status, message, code, details = null) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
};

const normalizeChecklistItems = (rawItems) => {
  if (!rawItems) return [];

  let parsed = rawItems;
  if (typeof rawItems === 'string') {
    try {
      parsed = JSON.parse(rawItems);
    } catch (_error) {
      parsed = rawItems.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item, index) => {
      if (typeof item === 'string') {
        return item.trim() ? { label: item.trim(), isRequired: true, itemOrder: index + 1 } : null;
      }

      const label = String(item?.label || item?.name || item?.title || item?.description || '').trim();
      if (!label) return null;
      return {
        label,
        isRequired: item?.required !== false && item?.isRequired !== false && item?.is_required !== false,
        itemOrder: index + 1
      };
    })
    .filter(Boolean);
};

const requireManagementPermission = (req) => {
  authorizePermission(
    { user: req.user, membership: req.membership },
    PERMISSIONS.AGREEMENTS_MANAGE
  );
};

const requirePropertyScope = (req, propertyId) => {
  if (isAdminRole({ user: req.user, membership: req.membership })) return;

  const assignedPropertyIds = new Set(
    (Array.isArray(req.membership?.assignedPropertyIds) ? req.membership.assignedPropertyIds : []).map(String)
  );

  if (!propertyId || !assignedPropertyIds.has(String(propertyId))) {
    throw createRequestError(
      403,
      'The selected property is not assigned to the current staff account.',
      'RESOURCE_ACCESS_DENIED'
    );
  }
};

const loadAgreementContext = async (tenantId, agreementId) => {
  const agreement = await runSingleQuery(
    `SELECT TOP 1
       a.*,
       au.name AS rentee_name,
       au.email AS rentee_email,
       au.auth_id AS rentee_auth_id,
       au.invited AS rentee_invited,
       p.name AS property_name,
       p.address AS property_address,
       p.propertytype AS property_type,
       p.checklistitems AS property_checklistitems,
       pu.unitnumber AS unit_number,
       pu.floor AS unit_floor,
       tm.status AS rentee_membership_status,
       tm.role AS rentee_membership_role
     FROM agreements a
     LEFT JOIN app_users au
       ON au.id = a.renteeid
     LEFT JOIN properties p
       ON p.id = a.propertyid
      AND p.tenant_id = a.tenant_id
     LEFT JOIN property_units pu
       ON pu.id = a.unitid
      AND pu.tenant_id = a.tenant_id
     LEFT JOIN tenant_memberships tm
       ON tm.app_user_id = a.renteeid
      AND tm.tenant_id = a.tenant_id
      AND tm.status = 'active'
     WHERE a.tenant_id = @tenantId
       AND a.id = @agreementId`,
    { tenantId, agreementId }
  );

  if (!agreement) {
    throw createRequestError(404, 'Agreement not found in the active tenant.', 'AGREEMENT_NOT_FOUND');
  }

  if (agreement.unitid) {
    const unit = await runSingleQuery(
      `SELECT TOP 1 id, propertyid
       FROM property_units
       WHERE tenant_id = @tenantId
         AND id = @unitId`,
      { tenantId, unitId: agreement.unitid }
    );

    if (!unit || String(unit.propertyid) !== String(agreement.propertyid)) {
      throw createRequestError(
        409,
        'The agreement unit does not belong to the selected property.',
        'AGREEMENT_UNIT_PROPERTY_MISMATCH'
      );
    }
  }

  return agreement;
};

const loadDepositSummary = async (tenantId, agreementId) => {
  const transactions = await runQuery(
    `SELECT *
     FROM tenancy_deposit_transactions
     WHERE tenant_id = @tenantId
       AND agreement_id = @agreementId
     ORDER BY received_at DESC, createdat DESC`,
    { tenantId, agreementId }
  );

  const totals = transactions.reduce((summary, transaction) => {
    if (String(transaction.status).toLowerCase() !== 'received') return summary;
    const amount = Number(transaction.amount) || 0;
    if (transaction.transaction_type === 'security_deposit') summary.securityDeposit += amount;
    if (transaction.transaction_type === 'confirmation_advance') summary.confirmationAdvance += amount;
    return summary;
  }, { securityDeposit: 0, confirmationAdvance: 0 });

  return { transactions, ...totals };
};

const loadChecklist = async (tenantId, agreementId) => {
  const checklist = await runSingleQuery(
    `SELECT TOP 1 *
     FROM tenancy_move_in_checklists
     WHERE tenant_id = @tenantId
       AND agreement_id = @agreementId`,
    { tenantId, agreementId }
  );

  if (!checklist) return null;

  const items = await runQuery(
    `SELECT *
     FROM tenancy_move_in_checklist_items
     WHERE tenant_id = @tenantId
       AND checklist_id = @checklistId
     ORDER BY item_order, createdat`,
    { tenantId, checklistId: checklist.id }
  );

  return { ...checklist, items };
};

const loadInvitationState = async (tenantId, appUserId) => {
  if (!appUserId) return null;

  return runSingleQuery(
    `SELECT TOP 1
       id,
       email,
       intended_role,
       user_type,
       expires_at,
       accepted_at,
       revoked_at,
       createdat,
       CASE
         WHEN accepted_at IS NOT NULL THEN 'accepted'
         WHEN revoked_at IS NOT NULL THEN 'revoked'
         WHEN expires_at <= SYSUTCDATETIME() THEN 'expired'
         ELSE 'pending'
       END AS state
     FROM user_invitations
     WHERE tenant_id = @tenantId
       AND app_user_id = @appUserId
     ORDER BY createdat DESC`,
    { tenantId, appUserId }
  );
};

const buildOnboardingProjection = async (tenantId, agreement) => {
  const [deposit, checklist, invitation] = await Promise.all([
    loadDepositSummary(tenantId, agreement.id),
    loadChecklist(tenantId, agreement.id),
    loadInvitationState(tenantId, agreement.renteeid)
  ]);

  const rentee = {
    id: agreement.renteeid,
    name: agreement.rentee_name,
    email: agreement.rentee_email,
    auth_id: agreement.rentee_auth_id,
    invited: agreement.rentee_invited
  };
  const membership = agreement.rentee_membership_status
    ? { status: agreement.rentee_membership_status, role: agreement.rentee_membership_role }
    : null;
  const rentalReservation=await loadRentalReservationReadiness({query:runSingleQuery,tenantId,agreement,enabled:process.env.PROPERTY_RENTAL_OFFERS_SCHEMA_READY==='true'});
  const readiness = evaluateTenancyActivationReadiness({
    agreement,
    rentee,
    membership,
    checklist,
    securityDepositReceived: deposit.securityDeposit,
    rentalReservation
  });

  return {
    agreement,
    rentee,
    membership,
    property: agreement.propertyid ? {
      id: agreement.propertyid,
      name: agreement.property_name,
      address: agreement.property_address,
      propertytype: agreement.property_type
    } : null,
    unit: agreement.unitid ? {
      id: agreement.unitid,
      unitnumber: agreement.unit_number,
      floor: agreement.unit_floor
    } : null,
    invitation,
    deposit,
    checklist,
    readiness: {
      ...readiness,
      blockingReasons: getActivationBlockingReasons(readiness)
    }
  };
};

const refreshChecklistCompletion = async (tenantId, checklistId, actorUserId, transaction) => {
  const summary = await runSingleQuery(
    `SELECT
       COUNT(*) AS total_items,
       SUM(CASE WHEN is_required = 1 THEN 1 ELSE 0 END) AS required_items,
       SUM(CASE WHEN is_required = 1 AND status = 'completed' THEN 1 ELSE 0 END) AS completed_required_items
     FROM tenancy_move_in_checklist_items
     WHERE tenant_id = @tenantId
       AND checklist_id = @checklistId`,
    { tenantId, checklistId }, transaction
  );

  const requiredItems = Number(summary?.required_items) || 0;
  const completedRequiredItems = Number(summary?.completed_required_items) || 0;
  const isComplete = requiredItems > 0 && requiredItems === completedRequiredItems;

  await runQuery(
    `UPDATE tenancy_move_in_checklists
     SET status = @status,
         completed_at = CASE WHEN @status = 'completed' THEN COALESCE(completed_at, SYSUTCDATETIME()) ELSE NULL END,
         completed_by = CASE WHEN @status = 'completed' THEN COALESCE(completed_by, @actorUserId) ELSE NULL END,
         updatedat = SYSUTCDATETIME()
     WHERE tenant_id = @tenantId
       AND id = @checklistId`,
    {
      tenantId,
      checklistId,
      actorUserId,
      status: isComplete ? 'completed' : 'open'
    }, transaction
  );
};

export const createTenancyOnboardingRouter = () => {
  const router = express.Router();

  router.use(createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'tenancy-onboarding'
  }));

  router.get('/me/summary', async (req, res, next) => {
    try {
      if (!isTenantRole({ user: req.user, membership: req.membership })) {
        throw createRequestError(403, 'Tenant portal access is required.', 'TENANT_PORTAL_REQUIRED');
      }

      const rows = await runQuery(
        `SELECT
           a.id AS agreement_id,
           a.status AS agreement_status,
           a.startdate,
           a.enddate,
           a.rentamount,
           a.depositamount,
           a.terms,
           a.activated_at,
           p.id AS property_id,
           p.name AS property_name,
           p.address AS property_address,
           p.propertytype AS property_type,
           pu.id AS unit_id,
           pu.unitnumber AS unit_number,
           pu.floor AS unit_floor,
           pu.bedrooms AS unit_bedrooms,
           pu.bathrooms AS unit_bathrooms
         FROM agreements a
         INNER JOIN properties p
           ON p.id = a.propertyid
          AND p.tenant_id = a.tenant_id
         LEFT JOIN property_units pu
           ON pu.id = a.unitid
          AND pu.tenant_id = a.tenant_id
         WHERE a.tenant_id = @tenantId
           AND a.renteeid = @renteeId
           AND a.status = 'active'
         ORDER BY a.activated_at DESC, a.startdate DESC, a.createdat DESC`,
        { tenantId: req.tenantId, renteeId: req.user.id }
      );

      res.json({ data: { tenancies: rows }, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:agreementId/billing-day', async (req, res, next) => {
    try {
      if (!isTenantRole({ user: req.user, membership: req.membership })) {
        throw createRequestError(403, 'Tenant portal access is required.', 'TENANT_PORTAL_REQUIRED');
      }

      const agreement = await loadAgreementContext(req.tenantId, req.params.agreementId);
      if (
        String(agreement.renteeid || '') !== String(req.user.id || '')
        || String(agreement.status || '').toLowerCase() !== 'active'
      ) {
        throw createRequestError(404, 'Active tenancy agreement not found.', 'ACTIVE_AGREEMENT_NOT_FOUND');
      }

      const requestedBillingDay = Number.parseInt(String(req.body?.billingDay ?? ''), 10);
      if (
        !Number.isInteger(requestedBillingDay)
        || requestedBillingDay < MIN_TENANCY_BILLING_DAY
        || requestedBillingDay > MAX_TENANCY_BILLING_DAY
      ) {
        throw createRequestError(
          400,
          `billingDay must be between ${MIN_TENANCY_BILLING_DAY} and ${MAX_TENANCY_BILLING_DAY}.`,
          'INVALID_BILLING_DAY'
        );
      }

      const previousBillingDay = resolveAgreementBillingDay(agreement);
      const billingDay = normalizeTenancyBillingDay(requestedBillingDay);

      await withManagementWrite({tenantId: req.tenantId, action: async transaction => {
        const updated = await runSingleQuery(
          `DECLARE @rental_changed TABLE(id UNIQUEIDENTIFIER);
  UPDATE agreements
           SET terms = JSON_MODIFY(
                 CASE WHEN ISJSON(terms) = 1 THEN terms ELSE N'{}' END,
                 '$.billingDay',
                 @billingDay
               ),
               updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.id INTO @rental_changed
           WHERE tenant_id = @tenantId
             AND id = @agreementId
             AND renteeid = @renteeId
             AND status = 'active';
  SELECT a.* FROM dbo.agreements a JOIN @rental_changed c ON c.id=a.id;`,
          {
            tenantId: req.tenantId,
            agreementId: agreement.id,
            renteeId: req.user.id,
            billingDay
          }, transaction
        );

        if (!updated) {
          throw createRequestError(409, 'The tenancy changed before the billing day could be updated.', 'TENANCY_STATE_CHANGED');
        }

        await runQuery(
          `INSERT INTO tenancy_lifecycle_events (
             tenant_id, agreement_id, event_type, from_status, to_status, actor_user_id, metadata
           ) VALUES (
             @tenantId, @agreementId, 'billing_day_changed', 'active', 'active', @actorUserId, @metadata
           )`,
          {
            tenantId: req.tenantId,
            agreementId: agreement.id,
            actorUserId: req.user.id,
            metadata: JSON.stringify({
              propertyId: agreement.propertyid,
              previousBillingDay,
              billingDay,
              source: 'tenant_portal'
            })
          }, transaction
        );
      }});

      res.json({
        data: {
          agreementId: agreement.id,
          propertyId: agreement.propertyid,
          billingDay
        },
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:agreementId/onboarding', async (req, res, next) => {
    try {
      requireManagementPermission(req);
      const agreement = await loadAgreementContext(req.tenantId, req.params.agreementId);
      requirePropertyScope(req, agreement.propertyid);
      const projection = await buildOnboardingProjection(req.tenantId, agreement);
      res.json({ data: projection, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:agreementId/deposits', async (req, res, next) => {
    try {
      requireManagementPermission(req);
      const agreement = await loadAgreementContext(req.tenantId, req.params.agreementId);
      requirePropertyScope(req, agreement.propertyid);

      const transactionType = String(req.body?.transactionType || req.body?.transaction_type || '').trim().toLowerCase();
      const amount = Number(req.body?.amount);
      if (!['confirmation_advance', 'security_deposit'].includes(transactionType)) {
        throw createRequestError(400, 'transactionType must be confirmation_advance or security_deposit.', 'INVALID_DEPOSIT_TYPE');
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw createRequestError(400, 'amount must be greater than zero.', 'INVALID_DEPOSIT_AMOUNT');
      }

      const paymentReference = String(req.body?.paymentReference || req.body?.payment_reference || '').trim();
      const paymentMethod = String(req.body?.paymentMethod || req.body?.payment_method || '').trim() || null;
      const receivedAt = req.body?.receivedAt || req.body?.received_at || null;
      if (!paymentReference || paymentReference.length > 255 || (paymentMethod?.length || 0) > 100) {
        throw createRequestError(400, 'Enter a payment reference (up to 255 characters). Reuse the same reference when retrying the same payment.', 'DEPOSIT_REFERENCE_REQUIRED');
      }
      if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001 || amount > 999999999999.99) {
        throw createRequestError(400, 'Enter an amount with no more than two decimal places.', 'INVALID_DEPOSIT_AMOUNT');
      }
      if (receivedAt && !Number.isFinite(Date.parse(receivedAt))) {
        throw createRequestError(400, 'Enter a valid received date.', 'INVALID_DEPOSIT_DATE');
      }
      // Serialize retries on the existing agreement row. The ledger and audit
      // event commit together; an ambiguous response can be retried safely.
      const transaction = await runSingleManagementQuery(
        `SET NOCOUNT ON; SET XACT_ABORT ON;
         BEGIN TRY
           BEGIN TRANSACTION;
           DECLARE @currentStatus NVARCHAR(50), @transactionId UNIQUEIDENTIFIER, @replayed BIT = 0;
           SELECT @currentStatus=status FROM agreements WITH (UPDLOCK,HOLDLOCK)
             WHERE tenant_id=@tenantId AND id=@agreementId;
           IF @currentStatus IS NULL OR @currentStatus IN ('closed','cancelled')
             THROW 51105, 'DEPOSIT_AGREEMENT_UNAVAILABLE', 1;
           SELECT @transactionId=id FROM tenancy_deposit_transactions
             WHERE tenant_id=@tenantId AND agreement_id=@agreementId
               AND payment_reference=@paymentReference;
           IF @transactionId IS NOT NULL
           BEGIN
             IF EXISTS(SELECT 1 FROM tenancy_deposit_transactions WHERE id=@transactionId
               AND (amount<>@amount OR transaction_type<>@transactionType OR status<>'received'
                 OR ISNULL(payment_method,'')<>ISNULL(@paymentMethod,'')
                 OR (@receivedAt IS NOT NULL AND received_at<>CONVERT(DATETIMEOFFSET,@receivedAt))))
               THROW 51106, 'DEPOSIT_REFERENCE_CONFLICT', 1;
             SET @replayed=1;
           END
           ELSE
           BEGIN
             SET @transactionId=NEWID();
             INSERT INTO tenancy_deposit_transactions (
               id,tenant_id,agreement_id,renteeid,propertyid,unitid,transaction_type,
               amount,status,payment_method,payment_reference,received_at,notes,recorded_by)
             VALUES (@transactionId,@tenantId,@agreementId,@renteeId,@propertyId,@unitId,@transactionType,
               @amount,'received',@paymentMethod,@paymentReference,
               COALESCE(CONVERT(DATETIMEOFFSET,@receivedAt),SYSUTCDATETIME()),@notes,@recordedBy);
             INSERT INTO tenancy_lifecycle_events(tenant_id,agreement_id,event_type,actor_user_id,metadata)
             VALUES(@tenantId,@agreementId,'deposit_recorded',@recordedBy,
               (SELECT @transactionId AS transactionId,@amount AS amount,@transactionType AS transactionType FOR JSON PATH,WITHOUT_ARRAY_WRAPPER));
           END;
           COMMIT TRANSACTION;
           SELECT *,@replayed AS replayed FROM tenancy_deposit_transactions WHERE id=@transactionId;
         END TRY
         BEGIN CATCH
           IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
           THROW;
         END CATCH;`,
        { tenantId: req.tenantId, agreementId: agreement.id, renteeId: agreement.renteeid,
          propertyId: agreement.propertyid, unitId: agreement.unitid || null,
          transactionType, amount, paymentMethod, paymentReference, receivedAt,
          notes: req.body?.notes || null, recordedBy: req.user.id }
      );
      res.status(transaction.replayed ? 200 : 201).json({ data: transaction, error: null });
    } catch (error) {
      if (error?.number === 51106) return next(createRequestError(409, 'This reference already records a different payment. Check the ledger before continuing.', 'DEPOSIT_REFERENCE_CONFLICT'));
      if (error?.number === 51105) return next(createRequestError(409, 'This agreement is no longer open for deposit recording.', 'DEPOSIT_AGREEMENT_UNAVAILABLE'));
      next(error);
    }
  });

  router.post('/:agreementId/checklist', async (req, res, next) => {
    try {
      requireManagementPermission(req);
      const agreement = await loadAgreementContext(req.tenantId, req.params.agreementId);
      requirePropertyScope(req, agreement.propertyid);

      const existing = await loadChecklist(req.tenantId, agreement.id);
      if (existing?.items?.length) {
        res.json({ data: existing, error: null });
        return;
      }

      if (['active', 'closed', 'cancelled'].includes(String(agreement.status).toLowerCase())) {
        throw createRequestError(409, 'The move-in record is retained after activation or closure.', 'MOVE_IN_RECORD_LOCKED');
      }
      const sourceItems = normalizeChecklistItems(agreement.property_checklistitems);
      if (!sourceItems.some(item => item.isRequired) || sourceItems.some(item => item.label.length > 500)) {
        throw createRequestError(409, 'Add at least one required inspection item to the property checklist, then create the move-in checklist. An empty checklist is not inspection evidence.', 'MOVE_IN_ITEMS_REQUIRED');
      }

      // Lock the agreement while creating or filling a legacy empty snapshot.
      // Never replace an existing nonempty inspection or partially commit items.
      await runManagementQuery(
        `SET NOCOUNT ON; SET XACT_ABORT ON;
         BEGIN TRY
           BEGIN TRANSACTION;
           DECLARE @currentStatus NVARCHAR(50), @checklistId UNIQUEIDENTIFIER;
           SELECT @currentStatus=status FROM agreements WITH(UPDLOCK,HOLDLOCK)
             WHERE tenant_id=@tenantId AND id=@agreementId;
           IF @currentStatus IS NULL OR @currentStatus IN ('active','closed','cancelled')
             THROW 51107,'MOVE_IN_RECORD_LOCKED',1;
           SELECT @checklistId=id FROM tenancy_move_in_checklists
             WHERE tenant_id=@tenantId AND agreement_id=@agreementId;
           IF @checklistId IS NULL
           BEGIN
             SET @checklistId=NEWID();
             INSERT INTO tenancy_move_in_checklists(id,tenant_id,agreement_id,propertyid,unitid,status,created_by)
             VALUES(@checklistId,@tenantId,@agreementId,@propertyId,@unitId,'open',@actorUserId);
           END;
           IF NOT EXISTS(SELECT 1 FROM tenancy_move_in_checklist_items WHERE tenant_id=@tenantId AND checklist_id=@checklistId)
           BEGIN
             INSERT INTO tenancy_move_in_checklist_items(tenant_id,checklist_id,item_order,label,is_required,status)
             SELECT @tenantId,@checklistId,itemOrder,label,isRequired,'pending'
             FROM OPENJSON(@items) WITH(itemOrder INT,label NVARCHAR(500),isRequired BIT);
             UPDATE tenancy_move_in_checklists SET status='open',completed_at=NULL,completed_by=NULL,updatedat=SYSUTCDATETIME()
               WHERE id=@checklistId AND tenant_id=@tenantId;
             INSERT INTO tenancy_lifecycle_events(tenant_id,agreement_id,event_type,actor_user_id,metadata)
             VALUES(@tenantId,@agreementId,'move_in_checklist_created',@actorUserId,@metadata);
           END;
           COMMIT TRANSACTION;
         END TRY
         BEGIN CATCH
           IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
           THROW;
         END CATCH;`,
        { tenantId: req.tenantId, agreementId: agreement.id, propertyId: agreement.propertyid,
          unitId: agreement.unitid || null, actorUserId: req.user.id,
          items: JSON.stringify(sourceItems), metadata: JSON.stringify({ itemCount: sourceItems.length }) }
      );
      const created = await loadChecklist(req.tenantId, agreement.id);
      res.status(201).json({ data: created, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:agreementId/checklist/items/:itemId', async (req, res, next) => {
    try {
      requireManagementPermission(req);
      const agreement = await loadAgreementContext(req.tenantId, req.params.agreementId);
      requirePropertyScope(req, agreement.propertyid);
      const checklist = await loadChecklist(req.tenantId, agreement.id);
      if (!checklist) {
        throw createRequestError(404, 'Move-in checklist has not been created.', 'MOVE_IN_CHECKLIST_NOT_FOUND');
      }

      const status = String(req.body?.status || '').trim().toLowerCase();
      if (!['pending', 'completed'].includes(status)) {
        throw createRequestError(400, 'status must be pending or completed.', 'INVALID_CHECKLIST_ITEM_STATUS');
      }

      await withManagementWrite({tenantId: req.tenantId, action: async transaction => {
        const item = await runSingleQuery(
          `UPDATE tenancy_move_in_checklist_items
           SET status = @status,
               notes = CASE WHEN @notesProvided = 1 THEN @notes ELSE notes END,
               completed_by = CASE WHEN @status = 'completed' THEN @actorUserId ELSE NULL END,
               completed_at = CASE WHEN @status = 'completed' THEN SYSUTCDATETIME() ELSE NULL END,
               updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.*
           WHERE tenant_id = @tenantId
             AND checklist_id = @checklistId
             AND id = @itemId
             AND EXISTS (SELECT 1 FROM agreements WITH (UPDLOCK,HOLDLOCK) WHERE id=@agreementId AND tenant_id=@tenantId AND status NOT IN ('active','closed','cancelled'))`,
          {
            tenantId: req.tenantId,
            checklistId: checklist.id,
            itemId: req.params.itemId,
            agreementId: agreement.id,
            status,
            actorUserId: req.user.id,
            notesProvided: Object.prototype.hasOwnProperty.call(req.body || {}, 'notes') ? 1 : 0,
            notes: req.body?.notes == null ? null : String(req.body.notes)
          }, transaction
        );

        if (!item) {
          throw createRequestError(404, 'Checklist item not found.', 'MOVE_IN_CHECKLIST_ITEM_NOT_FOUND');
        }

        await refreshChecklistCompletion(req.tenantId, checklist.id, req.user.id, transaction);
      }});
      res.json({ data: await loadChecklist(req.tenantId, agreement.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:agreementId/manual-signature', async (req, res, next) => {
    try {
      requireManagementPermission(req);
      const agreement = await loadAgreementContext(req.tenantId, req.params.agreementId);
      requirePropertyScope(req, agreement.propertyid);

      if (String(agreement.status).toLowerCase() === 'active' || isAgreementSignatureComplete(agreement)) {
        res.json({ data: await buildOnboardingProjection(req.tenantId, agreement), error: null });
        return;
      }

      const previousSignatureStatus = agreement.signature_status || null;
      await runManagementQuery(
        `SET XACT_ABORT ON;
         BEGIN TRY
           BEGIN TRANSACTION;

           UPDATE agreements
           SET signature_status = 'manual_signed',
               signature_completed_at = SYSUTCDATETIME(),
               signeddate = SYSUTCDATETIME(),
               updatedat = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId
             AND id = @agreementId
             AND status <> 'active';

           INSERT INTO tenancy_lifecycle_events (
             tenant_id, agreement_id, event_type, from_status, to_status, actor_user_id, metadata
           ) VALUES (
             @tenantId, @agreementId, 'manual_signature_recorded', @agreementStatus, @agreementStatus, @actorUserId, @metadata
           );

           COMMIT TRANSACTION;
         END TRY
         BEGIN CATCH
           IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
           THROW;
         END CATCH;`,
        {
          tenantId: req.tenantId,
          agreementId: agreement.id,
          agreementStatus: agreement.status,
          actorUserId: req.user.id,
          metadata: JSON.stringify({
            source: 'manual',
            previousSignatureStatus,
            confirmation: 'landlord_and_tenant_signed_outside_evia'
          })
        }
      );

      const updatedAgreement = await loadAgreementContext(req.tenantId, agreement.id);
      res.json({ data: await buildOnboardingProjection(req.tenantId, updatedAgreement), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:agreementId/activate', async (req, res, next) => {
    try {
      requireManagementPermission(req);
      const agreement = await loadAgreementContext(req.tenantId, req.params.agreementId);
      requirePropertyScope(req, agreement.propertyid);

      if (String(agreement.status).toLowerCase() === 'active') {
        res.json({ data: await buildOnboardingProjection(req.tenantId, agreement), error: null });
        return;
      }

      const projection = await buildOnboardingProjection(req.tenantId, agreement);
      if (!projection.readiness.canActivate) {
        throw createRequestError(
          409,
          'Tenancy activation requirements are not complete.',
          'TENANCY_NOT_READY',
          projection.readiness
        );
      }

      const occupancyConflict = await runSingleQuery(
        agreement.unitid
          ? `SELECT TOP 1 id FROM agreements
             WHERE tenant_id = @tenantId AND unitid = @unitId AND status = 'active' AND id <> @agreementId`
          : `SELECT TOP 1 id FROM agreements
             WHERE tenant_id = @tenantId AND propertyid = @propertyId AND unitid IS NULL AND status = 'active' AND id <> @agreementId`,
        agreement.unitid
          ? { tenantId: req.tenantId, unitId: agreement.unitid, agreementId: agreement.id }
          : { tenantId: req.tenantId, propertyId: agreement.propertyid, agreementId: agreement.id }
      );

      if (occupancyConflict) {
        throw createRequestError(409, 'The selected property or unit already has an active tenancy.', 'OCCUPANCY_CONFLICT');
      }

      await runManagementQuery(
        `SET XACT_ABORT ON;
         BEGIN TRY
           BEGIN TRANSACTION;

           DECLARE @currentStatus NVARCHAR(50);
           SELECT @currentStatus=status FROM agreements WITH(UPDLOCK,HOLDLOCK)
             WHERE tenant_id=@tenantId AND id=@agreementId;
           IF @currentStatus IS NULL OR @currentStatus IN ('closed','cancelled')
             THROW 51104,'TENANCY_STATE_CHANGED',1;
           IF @currentStatus <> 'active'
           BEGIN
           IF NOT EXISTS(SELECT 1 FROM tenancy_move_in_checklists c WITH(HOLDLOCK)
             WHERE c.tenant_id=@tenantId AND c.agreement_id=@agreementId AND c.status='completed'
               AND EXISTS(SELECT 1 FROM tenancy_move_in_checklist_items i WITH(HOLDLOCK)
                 WHERE i.tenant_id=@tenantId AND i.checklist_id=c.id AND i.is_required=1)
               AND NOT EXISTS(SELECT 1 FROM tenancy_move_in_checklist_items i WITH(HOLDLOCK)
                 WHERE i.tenant_id=@tenantId AND i.checklist_id=c.id
                   AND ((i.is_required=1 AND i.status<>'completed') OR LTRIM(RTRIM(i.label))='')))
             THROW 51104,'MOVE_IN_EVIDENCE_REQUIRED',1;

           UPDATE agreements
           SET status = 'active',
               activated_at = SYSUTCDATETIME(),
               activated_by = @actorUserId,
               updatedat = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId
             AND id = @agreementId
             AND status <> 'active';

           UPDATE properties
           SET status = 'rented', updatedat = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId
             AND id = @propertyId;

           IF @unitId IS NOT NULL
           BEGIN
             UPDATE property_units
             SET status = 'occupied', updatedat = SYSUTCDATETIME()
             WHERE tenant_id = @tenantId
               AND id = @unitId
               AND propertyid = @propertyId;
           END;

           INSERT INTO tenancy_lifecycle_events (
             tenant_id, agreement_id, event_type, from_status, to_status, actor_user_id, metadata
           ) VALUES (
             @tenantId, @agreementId, 'tenancy_activated', @fromStatus, 'active', @actorUserId, @metadata
           );
           END;

           COMMIT TRANSACTION;
         END TRY
         BEGIN CATCH
           IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
           THROW;
         END CATCH;`,
        {
          tenantId: req.tenantId,
          agreementId: agreement.id,
          propertyId: agreement.propertyid,
          unitId: agreement.unitid || null,
          actorUserId: req.user.id,
          fromStatus: agreement.status,
          metadata: JSON.stringify({ checklistId: projection.checklist?.id || null })
        }
      );

      const activatedAgreement = await loadAgreementContext(req.tenantId, agreement.id);
      res.json({ data: await buildOnboardingProjection(req.tenantId, activatedAgreement), error: null });
    } catch (error) {
      if (error?.number === 2601 || error?.number === 2627 || error?.number === 51101) {
        next(createRequestError(409, 'The selected property or unit already has an active tenancy.', 'OCCUPANCY_CONFLICT'));
        return;
      }
      if (error?.number === 51103 || error?.number === 51104) {
        next(createRequestError(409, 'The reservation or activation requirements changed. Refresh and review the current offer and move-in checks.', 'TENANCY_NOT_READY'));
        return;
      }
      next(error);
    }
  });

  return router;
};
