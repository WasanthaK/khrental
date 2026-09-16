import express from 'express';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS, isAdminRole, isTenantRole } from './permissionEngine.js';
import { calculateTenancySettlement, isClosureReady, validateNoticeResponse } from './tenancyExit.js';

const createRequestError = (status, message, code, details = null) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
};

const bindParams = (request, params = {}) => {
  Object.entries(params).forEach(([key, value]) => request.input(key, value));
  return request;
};

const queryTransaction = async (transaction, queryText, params = {}) => {
  const request = bindParams(new sql.Request(transaction), params);
  const result = await request.query(queryText);
  return result.recordset || [];
};

const singleTransaction = async (transaction, queryText, params = {}) => {
  const rows = await queryTransaction(transaction, queryText, params);
  return rows[0] || null;
};

const requireAgreementManage = (req) => {
  authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.AGREEMENTS_MANAGE);
};

const hasPropertyScope = (req, propertyId) => {
  if (isAdminRole({ user: req.user, membership: req.membership })) return true;
  return (req.membership?.assignedPropertyIds || []).some((id) => String(id) === String(propertyId));
};

const loadAgreement = async (tenantId, agreementId) => {
  const agreement = await runSingleQuery(
    `SELECT TOP 1 a.*, p.name AS property_name, p.status AS property_status,
            p.checklistitems, u.unitnumber AS unit_name, u.status AS unit_status,
            au.name AS rentee_name, au.email AS rentee_email
     FROM agreements a
     LEFT JOIN properties p ON p.id = a.propertyid AND p.tenant_id = a.tenant_id
     LEFT JOIN property_units u ON u.id = a.unitid AND u.tenant_id = a.tenant_id
     LEFT JOIN app_users au ON au.id = a.renteeid AND au.tenant_id = a.tenant_id
     WHERE a.tenant_id = @tenantId AND a.id = @agreementId`,
    { tenantId, agreementId }
  );
  if (!agreement) throw createRequestError(404, 'Agreement not found.', 'AGREEMENT_NOT_FOUND');
  return agreement;
};

const assertAgreementAccess = (req, agreement, manage = false) => {
  if (isTenantRole({ user: req.user, membership: req.membership })) {
    if (manage || String(agreement.renteeid || '') !== String(req.user?.id || '')) {
      throw createRequestError(403, 'This tenancy does not belong to the current tenant.', 'RESOURCE_ACCESS_DENIED');
    }
    return;
  }
  if (manage) requireAgreementManage(req);
  else authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.AGREEMENTS_READ);
  if (!hasPropertyScope(req, agreement.propertyid)) {
    throw createRequestError(403, 'This tenancy property is outside the current staff scope.', 'RESOURCE_ACCESS_DENIED');
  }
};

const parseChecklistItems = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const recalculateSettlement = async (transaction, tenantId, agreementId, settlementId) => {
  const depositRow = await singleTransaction(
    transaction,
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM tenancy_deposit_transactions
     WHERE tenant_id = @tenantId AND agreement_id = @agreementId
       AND transaction_type = 'security_deposit' AND status = 'received'`,
    { tenantId, agreementId }
  );
  const deductionRow = await singleTransaction(
    transaction,
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM tenancy_settlement_items
     WHERE tenant_id = @tenantId AND settlement_id = @settlementId AND status = 'approved'`,
    { tenantId, settlementId }
  );
  const invoiceRow = await singleTransaction(
    transaction,
    `SELECT COALESCE(SUM(CASE WHEN x.outstanding > 0 THEN x.outstanding ELSE 0 END), 0) AS total
     FROM (
       SELECT i.id,
              COALESCE(i.totalamount, 0) - COALESCE(SUM(CASE WHEN p.status = 'verified' THEN p.amount ELSE 0 END), 0) AS outstanding
       FROM invoices i
       LEFT JOIN payments p ON p.invoiceid = i.id AND p.tenant_id = i.tenant_id
       WHERE i.tenant_id = @tenantId AND i.agreementid = @agreementId
       GROUP BY i.id, i.totalamount
     ) x`,
    { tenantId, agreementId }
  );
  const calculation = calculateTenancySettlement({
    depositReceived: depositRow?.total,
    approvedDeductions: deductionRow?.total,
    outstandingInvoices: invoiceRow?.total
  });
  await queryTransaction(
    transaction,
    `UPDATE tenancy_settlements
     SET deposit_received = @depositReceived,
         approved_deductions = @approvedDeductions,
         outstanding_invoices = @outstandingInvoices,
         refund_amount = @refundAmount,
         amount_due = @amountDue,
         updatedat = SYSUTCDATETIME()
     WHERE tenant_id = @tenantId AND id = @settlementId`,
    { tenantId, settlementId, ...calculation }
  );
  return calculation;
};

const loadExitProjection = async (req, agreementId) => {
  const agreement = await loadAgreement(req.tenantId, agreementId);
  assertAgreementAccess(req, agreement, false);
  const [notices, inspection, settlement] = await Promise.all([
    runQuery(
      `SELECT * FROM tenancy_notices WHERE tenant_id = @tenantId AND agreement_id = @agreementId ORDER BY createdat DESC`,
      { tenantId: req.tenantId, agreementId }
    ),
    runSingleQuery(
      `SELECT TOP 1 * FROM tenancy_move_out_inspections WHERE tenant_id = @tenantId AND agreement_id = @agreementId`,
      { tenantId: req.tenantId, agreementId }
    ),
    runSingleQuery(
      `SELECT TOP 1 * FROM tenancy_settlements WHERE tenant_id = @tenantId AND agreement_id = @agreementId`,
      { tenantId: req.tenantId, agreementId }
    )
  ]);
  const inspectionItems = inspection ? await runQuery(
    `SELECT * FROM tenancy_move_out_inspection_items WHERE tenant_id = @tenantId AND inspection_id = @inspectionId ORDER BY item_order`,
    { tenantId: req.tenantId, inspectionId: inspection.id }
  ) : [];
  const settlementItems = settlement ? await runQuery(
    `SELECT * FROM tenancy_settlement_items WHERE tenant_id = @tenantId AND settlement_id = @settlementId ORDER BY createdat`,
    { tenantId: req.tenantId, settlementId: settlement.id }
  ) : [];
  return { agreement, notices, inspection: inspection ? { ...inspection, items: inspectionItems } : null, settlement: settlement ? { ...settlement, items: settlementItems } : null };
};

export const createTenancyExitRouter = () => {
  const router = express.Router();
  router.use(createTenantContextMiddleware({ requireUser: true, requireTenant: true, auditLabel: 'tenancy-exit' }));

  router.get('/agreements/:agreementId', async (req, res, next) => {
    try {
      res.json({ data: await loadExitProjection(req, req.params.agreementId), error: null });
    } catch (error) { next(error); }
  });

  router.post('/agreements/:agreementId/notices', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      if (String(agreement.status).toLowerCase() !== 'active') {
        throw createRequestError(409, 'Notices can only be issued for an active tenancy.', 'ACTIVE_TENANCY_REQUIRED');
      }
      const noticeType = String(req.body?.noticeType || '').toLowerCase();
      if (!['renewal_offer', 'termination_notice'].includes(noticeType)) {
        throw createRequestError(400, 'noticeType must be renewal_offer or termination_notice.', 'INVALID_NOTICE_TYPE');
      }
      const effectiveDate = req.body?.effectiveDate || null;
      const noticeDate = req.body?.noticeDate || new Date().toISOString().slice(0, 10);
      const created = await runSingleQuery(
        `INSERT INTO tenancy_notices (
           tenant_id, agreement_id, notice_type, status, notice_date, effective_date, content, created_by, sent_at
         ) OUTPUT INSERTED.*
         VALUES (@tenantId, @agreementId, @noticeType, 'sent', @noticeDate, @effectiveDate, @content, @createdBy, SYSUTCDATETIME())`,
        {
          tenantId: req.tenantId,
          agreementId: agreement.id,
          noticeType,
          noticeDate,
          effectiveDate,
          content: req.body?.content || null,
          createdBy: req.user.id
        }
      );
      res.status(201).json({ data: created, error: null });
    } catch (error) { next(error); }
  });

  router.post('/notices/:noticeId/respond', async (req, res, next) => {
    try {
      if (!isTenantRole({ user: req.user, membership: req.membership })) {
        throw createRequestError(403, 'Tenant portal access is required to respond to a tenancy notice.', 'TENANT_PORTAL_REQUIRED');
      }
      const notice = await runSingleQuery(
        `SELECT TOP 1 n.*, a.renteeid
         FROM tenancy_notices n
         INNER JOIN agreements a ON a.id = n.agreement_id AND a.tenant_id = n.tenant_id
         WHERE n.tenant_id = @tenantId AND n.id = @noticeId`,
        { tenantId: req.tenantId, noticeId: req.params.noticeId }
      );
      if (!notice) throw createRequestError(404, 'Notice not found.', 'NOTICE_NOT_FOUND');
      if (String(notice.renteeid) !== String(req.user.id)) throw createRequestError(403, 'This notice does not belong to the current tenant.', 'RESOURCE_ACCESS_DENIED');
      if (String(notice.status).toLowerCase() !== 'sent') throw createRequestError(409, 'This notice has already been processed.', 'NOTICE_ALREADY_PROCESSED');
      const response = String(req.body?.response || '').toLowerCase();
      if (!validateNoticeResponse(notice.notice_type, response)) throw createRequestError(400, 'Invalid response for this notice type.', 'INVALID_NOTICE_RESPONSE');
      const updated = await runSingleQuery(
        `UPDATE tenancy_notices
         SET status = @status, responded_by = @respondedBy, responded_at = SYSUTCDATETIME(), response_notes = @notes, updatedat = SYSUTCDATETIME()
         OUTPUT INSERTED.*
         WHERE tenant_id = @tenantId AND id = @noticeId AND status = 'sent'`,
        { tenantId: req.tenantId, noticeId: notice.id, status: response, respondedBy: req.user.id, notes: req.body?.notes || null }
      );
      res.json({ data: updated, error: null });
    } catch (error) { next(error); }
  });

  router.post('/agreements/:agreementId/renewal-draft', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      const accepted = await runSingleQuery(
        `SELECT TOP 1 id FROM tenancy_notices
         WHERE tenant_id = @tenantId AND agreement_id = @agreementId
           AND notice_type = 'renewal_offer' AND status = 'accepted'
         ORDER BY responded_at DESC`,
        { tenantId: req.tenantId, agreementId: agreement.id }
      );
      if (!accepted) throw createRequestError(409, 'An accepted renewal offer is required before creating the renewal agreement.', 'RENEWAL_NOT_ACCEPTED');
      const startDate = req.body?.startDate || req.body?.startdate;
      const endDate = req.body?.endDate || req.body?.enddate;
      if (!startDate || !endDate) throw createRequestError(400, 'startDate and endDate are required.', 'RENEWAL_DATES_REQUIRED');
      const created = await runSingleQuery(
        `INSERT INTO agreements (
           tenant_id, templateid, renteeid, propertyid, unitid, status,
           startdate, enddate, rentamount, depositamount, title, content, processedcontent, terms, notes,
           needs_document_generation, renewed_from_agreement_id
         ) OUTPUT INSERTED.*
         VALUES (
           @tenantId, @templateId, @renteeId, @propertyId, @unitId, 'draft',
           @startDate, @endDate, @rentAmount, @depositAmount, @title, @content, @processedContent, @terms, @notes,
           1, @renewedFrom
         )`,
        {
          tenantId: req.tenantId,
          templateId: agreement.templateid,
          renteeId: agreement.renteeid,
          propertyId: agreement.propertyid,
          unitId: agreement.unitid,
          startDate,
          endDate,
          rentAmount: req.body?.rentAmount ?? agreement.rentamount,
          depositAmount: req.body?.depositAmount ?? agreement.depositamount,
          title: req.body?.title || agreement.title || 'Tenancy Renewal',
          content: agreement.content,
          processedContent: agreement.processedcontent,
          terms: agreement.terms,
          notes: req.body?.notes || null,
          renewedFrom: agreement.id
        }
      );
      res.status(201).json({ data: created, error: null });
    } catch (error) { next(error); }
  });

  router.post('/agreements/:agreementId/move-out-inspection', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      const existing = await runSingleQuery(
        `SELECT TOP 1 * FROM tenancy_move_out_inspections WHERE tenant_id = @tenantId AND agreement_id = @agreementId`,
        { tenantId: req.tenantId, agreementId: agreement.id }
      );
      if (existing) {
        res.json({ data: await loadExitProjection(req, agreement.id), error: null });
        return;
      }

      let labels = (await runQuery(
        `SELECT mi.label
         FROM tenancy_move_in_checklists mc
         INNER JOIN tenancy_move_in_checklist_items mi ON mi.checklist_id = mc.id AND mi.tenant_id = mc.tenant_id
         WHERE mc.tenant_id = @tenantId AND mc.agreement_id = @agreementId
         ORDER BY mi.item_order`,
        { tenantId: req.tenantId, agreementId: agreement.id }
      )).map((row) => row.label);
      if (!labels.length) labels = parseChecklistItems(agreement.checklistitems).map((item) => typeof item === 'string' ? item : item?.label || item?.name).filter(Boolean);

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const inspection = await singleTransaction(
          transaction,
          `INSERT INTO tenancy_move_out_inspections (
             tenant_id, agreement_id, propertyid, unitid, inspection_date, notes, created_by
           ) OUTPUT INSERTED.*
           VALUES (@tenantId, @agreementId, @propertyId, @unitId, @inspectionDate, @notes, @createdBy)`,
          {
            tenantId: req.tenantId,
            agreementId: agreement.id,
            propertyId: agreement.propertyid,
            unitId: agreement.unitid,
            inspectionDate: req.body?.inspectionDate || null,
            notes: req.body?.notes || null,
            createdBy: req.user.id
          }
        );
        for (let index = 0; index < labels.length; index += 1) {
          await queryTransaction(
            transaction,
            `INSERT INTO tenancy_move_out_inspection_items (tenant_id, inspection_id, item_order, label)
             VALUES (@tenantId, @inspectionId, @itemOrder, @label)`,
            { tenantId: req.tenantId, inspectionId: inspection.id, itemOrder: index + 1, label: labels[index] }
          );
        }
        await transaction.commit();
        res.status(201).json({ data: await loadExitProjection(req, agreement.id), error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) { next(error); }
  });

  router.patch('/agreements/:agreementId/move-out-inspection/items/:itemId', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      const conditionStatus = String(req.body?.conditionStatus || '').toLowerCase();
      if (!['good', 'damaged', 'missing', 'not_applicable'].includes(conditionStatus)) {
        throw createRequestError(400, 'Invalid inspection condition.', 'INVALID_INSPECTION_CONDITION');
      }
      const deduction = req.body?.proposedDeduction === undefined || req.body?.proposedDeduction === null || req.body?.proposedDeduction === ''
        ? null : Number(req.body.proposedDeduction);
      if (deduction !== null && (!Number.isFinite(deduction) || deduction < 0)) throw createRequestError(400, 'proposedDeduction must be zero or greater.', 'INVALID_DEDUCTION');
      const updated = await runSingleQuery(
        `UPDATE tenancy_move_out_inspection_items
         SET condition_status = @conditionStatus, notes = @notes, proposed_deduction = @deduction,
             completed_by = @completedBy, completed_at = SYSUTCDATETIME(), updatedat = SYSUTCDATETIME()
         OUTPUT INSERTED.*
         WHERE tenant_id = @tenantId AND id = @itemId
           AND inspection_id IN (SELECT id FROM tenancy_move_out_inspections WHERE tenant_id = @tenantId AND agreement_id = @agreementId AND status = 'open')`,
        {
          tenantId: req.tenantId,
          agreementId: agreement.id,
          itemId: req.params.itemId,
          conditionStatus,
          notes: req.body?.notes || null,
          deduction,
          completedBy: req.user.id
        }
      );
      if (!updated) throw createRequestError(404, 'Open inspection item not found.', 'INSPECTION_ITEM_NOT_FOUND');
      res.json({ data: updated, error: null });
    } catch (error) { next(error); }
  });

  router.post('/agreements/:agreementId/move-out-inspection/complete', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      const inspection = await runSingleQuery(
        `SELECT TOP 1 * FROM tenancy_move_out_inspections WHERE tenant_id = @tenantId AND agreement_id = @agreementId`,
        { tenantId: req.tenantId, agreementId: agreement.id }
      );
      if (!inspection) throw createRequestError(409, 'Move-out inspection has not been initialized.', 'MOVE_OUT_INSPECTION_REQUIRED');
      const pending = await runSingleQuery(
        `SELECT TOP 1 id FROM tenancy_move_out_inspection_items WHERE tenant_id = @tenantId AND inspection_id = @inspectionId AND condition_status = 'pending'`,
        { tenantId: req.tenantId, inspectionId: inspection.id }
      );
      if (pending) throw createRequestError(409, 'All move-out inspection items must be reviewed.', 'MOVE_OUT_INSPECTION_INCOMPLETE');

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        await queryTransaction(
          transaction,
          `UPDATE tenancy_move_out_inspections
           SET status = 'completed', completed_by = @completedBy, completed_at = SYSUTCDATETIME(), updatedat = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId AND id = @inspectionId`,
          { tenantId: req.tenantId, inspectionId: inspection.id, completedBy: req.user.id }
        );
        let settlement = await singleTransaction(
          transaction,
          `SELECT TOP 1 * FROM tenancy_settlements WHERE tenant_id = @tenantId AND agreement_id = @agreementId`,
          { tenantId: req.tenantId, agreementId: agreement.id }
        );
        if (!settlement) {
          settlement = await singleTransaction(
            transaction,
            `INSERT INTO tenancy_settlements (tenant_id, agreement_id, created_by)
             OUTPUT INSERTED.* VALUES (@tenantId, @agreementId, @createdBy)`,
            { tenantId: req.tenantId, agreementId: agreement.id, createdBy: req.user.id }
          );
        }
        const damaged = await queryTransaction(
          transaction,
          `SELECT * FROM tenancy_move_out_inspection_items
           WHERE tenant_id = @tenantId AND inspection_id = @inspectionId
             AND condition_status IN ('damaged', 'missing') AND COALESCE(proposed_deduction, 0) > 0`,
          { tenantId: req.tenantId, inspectionId: inspection.id }
        );
        for (const item of damaged) {
          const exists = await singleTransaction(
            transaction,
            `SELECT TOP 1 id FROM tenancy_settlement_items
             WHERE tenant_id = @tenantId AND settlement_id = @settlementId
               AND source_type = 'move_out_item' AND source_id = @sourceId`,
            { tenantId: req.tenantId, settlementId: settlement.id, sourceId: item.id }
          );
          if (!exists) {
            await queryTransaction(
              transaction,
              `INSERT INTO tenancy_settlement_items (
                 tenant_id, settlement_id, item_type, description, amount, source_type, source_id, notes
               ) VALUES (@tenantId, @settlementId, 'damage', @description, @amount, 'move_out_item', @sourceId, @notes)`,
              {
                tenantId: req.tenantId,
                settlementId: settlement.id,
                description: item.label,
                amount: item.proposed_deduction,
                sourceId: item.id,
                notes: item.notes || null
              }
            );
          }
        }
        await recalculateSettlement(transaction, req.tenantId, agreement.id, settlement.id);
        await transaction.commit();
        res.json({ data: await loadExitProjection(req, agreement.id), error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) { next(error); }
  });

  router.post('/agreements/:agreementId/settlement/items', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount < 0) throw createRequestError(400, 'amount must be zero or greater.', 'INVALID_SETTLEMENT_AMOUNT');
      const description = String(req.body?.description || '').trim();
      if (!description) throw createRequestError(400, 'description is required.', 'SETTLEMENT_DESCRIPTION_REQUIRED');
      let settlement = await runSingleQuery(
        `SELECT TOP 1 * FROM tenancy_settlements WHERE tenant_id = @tenantId AND agreement_id = @agreementId`,
        { tenantId: req.tenantId, agreementId: agreement.id }
      );
      if (!settlement) {
        settlement = await runSingleQuery(
          `INSERT INTO tenancy_settlements (tenant_id, agreement_id, created_by)
           OUTPUT INSERTED.* VALUES (@tenantId, @agreementId, @createdBy)`,
          { tenantId: req.tenantId, agreementId: agreement.id, createdBy: req.user.id }
        );
      }
      if (String(settlement.status).toLowerCase() !== 'draft') throw createRequestError(409, 'Settlement items cannot change after approval.', 'SETTLEMENT_LOCKED');
      const item = await runSingleQuery(
        `INSERT INTO tenancy_settlement_items (
           tenant_id, settlement_id, item_type, description, amount, source_type, source_id, notes
         ) OUTPUT INSERTED.*
         VALUES (@tenantId, @settlementId, @itemType, @description, @amount, @sourceType, @sourceId, @notes)`,
        {
          tenantId: req.tenantId,
          settlementId: settlement.id,
          itemType: req.body?.itemType || 'other',
          description,
          amount,
          sourceType: req.body?.sourceType || null,
          sourceId: req.body?.sourceId || null,
          notes: req.body?.notes || null
        }
      );
      res.status(201).json({ data: item, error: null });
    } catch (error) { next(error); }
  });

  router.patch('/agreements/:agreementId/settlement/items/:itemId', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      const status = String(req.body?.status || '').toLowerCase();
      if (!['approved', 'rejected'].includes(status)) throw createRequestError(400, 'status must be approved or rejected.', 'INVALID_SETTLEMENT_ITEM_STATUS');
      const item = await runSingleQuery(
        `UPDATE tenancy_settlement_items
         SET status = @status, reviewed_by = @reviewedBy, reviewed_at = SYSUTCDATETIME(), updatedat = SYSUTCDATETIME()
         OUTPUT INSERTED.*
         WHERE tenant_id = @tenantId AND id = @itemId
           AND settlement_id IN (SELECT id FROM tenancy_settlements WHERE tenant_id = @tenantId AND agreement_id = @agreementId AND status = 'draft')`,
        { tenantId: req.tenantId, agreementId: agreement.id, itemId: req.params.itemId, status, reviewedBy: req.user.id }
      );
      if (!item) throw createRequestError(404, 'Draft settlement item not found.', 'SETTLEMENT_ITEM_NOT_FOUND');
      res.json({ data: item, error: null });
    } catch (error) { next(error); }
  });

  router.post('/agreements/:agreementId/settlement/approve', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      const inspection = await runSingleQuery(
        `SELECT TOP 1 status FROM tenancy_move_out_inspections WHERE tenant_id = @tenantId AND agreement_id = @agreementId`,
        { tenantId: req.tenantId, agreementId: agreement.id }
      );
      if (String(inspection?.status || '').toLowerCase() !== 'completed') throw createRequestError(409, 'Complete the move-out inspection before approving settlement.', 'MOVE_OUT_INSPECTION_INCOMPLETE');
      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const settlement = await singleTransaction(
          transaction,
          `SELECT TOP 1 * FROM tenancy_settlements WITH (UPDLOCK, HOLDLOCK)
           WHERE tenant_id = @tenantId AND agreement_id = @agreementId`,
          { tenantId: req.tenantId, agreementId: agreement.id }
        );
        if (!settlement) throw createRequestError(409, 'Settlement has not been initialized.', 'SETTLEMENT_REQUIRED');
        if (String(settlement.status).toLowerCase() !== 'draft') throw createRequestError(409, 'Settlement is no longer a draft.', 'SETTLEMENT_LOCKED');
        const proposed = await singleTransaction(
          transaction,
          `SELECT TOP 1 id FROM tenancy_settlement_items WHERE tenant_id = @tenantId AND settlement_id = @settlementId AND status = 'proposed'`,
          { tenantId: req.tenantId, settlementId: settlement.id }
        );
        if (proposed) throw createRequestError(409, 'Review every proposed settlement item before approval.', 'SETTLEMENT_ITEMS_PENDING');
        const calculation = await recalculateSettlement(transaction, req.tenantId, agreement.id, settlement.id);
        const updated = await singleTransaction(
          transaction,
          `UPDATE tenancy_settlements
           SET status = 'approved', approved_by = @approvedBy, approved_at = SYSUTCDATETIME(), notes = @notes, updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.*
           WHERE tenant_id = @tenantId AND id = @settlementId AND status = 'draft'`,
          { tenantId: req.tenantId, settlementId: settlement.id, approvedBy: req.user.id, notes: req.body?.notes || settlement.notes || null }
        );
        await transaction.commit();
        res.json({ data: { settlement: updated, calculation }, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) { next(error); }
  });

  router.post('/agreements/:agreementId/settlement/settle', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      const settlement = await runSingleQuery(
        `SELECT TOP 1 * FROM tenancy_settlements WHERE tenant_id = @tenantId AND agreement_id = @agreementId`,
        { tenantId: req.tenantId, agreementId: agreement.id }
      );
      if (!settlement || String(settlement.status).toLowerCase() !== 'approved') throw createRequestError(409, 'An approved settlement is required.', 'SETTLEMENT_NOT_APPROVED');
      const reference = String(req.body?.reference || '').trim();
      if ((Number(settlement.refund_amount) > 0 || Number(settlement.amount_due) > 0) && !reference) {
        throw createRequestError(400, 'A payment/refund reference is required when settlement money changes hands.', 'SETTLEMENT_REFERENCE_REQUIRED');
      }
      const updated = await runSingleQuery(
        `UPDATE tenancy_settlements
         SET status = 'settled', settled_by = @settledBy, settled_at = SYSUTCDATETIME(), settlement_reference = @reference, updatedat = SYSUTCDATETIME()
         OUTPUT INSERTED.*
         WHERE tenant_id = @tenantId AND id = @settlementId AND status = 'approved'`,
        { tenantId: req.tenantId, settlementId: settlement.id, settledBy: req.user.id, reference: reference || null }
      );
      res.json({ data: updated, error: null });
    } catch (error) { next(error); }
  });

  router.post('/agreements/:agreementId/close', async (req, res, next) => {
    try {
      const agreement = await loadAgreement(req.tenantId, req.params.agreementId);
      assertAgreementAccess(req, agreement, true);
      if (String(agreement.status).toLowerCase() !== 'active') throw createRequestError(409, 'Only an active tenancy can be closed.', 'ACTIVE_TENANCY_REQUIRED');
      const [inspection, settlement] = await Promise.all([
        runSingleQuery(`SELECT TOP 1 status FROM tenancy_move_out_inspections WHERE tenant_id = @tenantId AND agreement_id = @agreementId`, { tenantId: req.tenantId, agreementId: agreement.id }),
        runSingleQuery(`SELECT TOP 1 status FROM tenancy_settlements WHERE tenant_id = @tenantId AND agreement_id = @agreementId`, { tenantId: req.tenantId, agreementId: agreement.id })
      ]);
      if (!isClosureReady({ inspectionStatus: inspection?.status, settlementStatus: settlement?.status })) {
        throw createRequestError(409, 'Move-out inspection and financial settlement must be completed before tenancy closure.', 'TENANCY_CLOSURE_NOT_READY');
      }
      const effectiveEndDate = req.body?.effectiveEndDate || req.body?.endDate || agreement.enddate || new Date().toISOString();
      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const closed = await singleTransaction(
          transaction,
          `UPDATE agreements
           SET status = 'closed', enddate = @endDate, closed_at = SYSUTCDATETIME(), closed_by = @closedBy,
               closure_reason = @reason, updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.*
           WHERE tenant_id = @tenantId AND id = @agreementId AND status = 'active'`,
          { tenantId: req.tenantId, agreementId: agreement.id, endDate: effectiveEndDate, closedBy: req.user.id, reason: req.body?.reason || 'tenancy_closed' }
        );
        if (!closed) throw createRequestError(409, 'Tenancy status changed before closure.', 'TENANCY_STATE_CONFLICT');
        if (agreement.unitid) {
          await queryTransaction(
            transaction,
            `UPDATE property_units SET status = 'available', updatedat = SYSUTCDATETIME()
             WHERE tenant_id = @tenantId AND id = @unitId`,
            { tenantId: req.tenantId, unitId: agreement.unitid }
          );
        }
        const otherActive = await singleTransaction(
          transaction,
          `SELECT TOP 1 id FROM agreements WITH (HOLDLOCK)
           WHERE tenant_id = @tenantId AND propertyid = @propertyId AND status = 'active' AND id <> @agreementId`,
          { tenantId: req.tenantId, propertyId: agreement.propertyid, agreementId: agreement.id }
        );
        if (!otherActive) {
          await queryTransaction(
            transaction,
            `UPDATE properties SET status = 'available', updatedat = SYSUTCDATETIME()
             WHERE tenant_id = @tenantId AND id = @propertyId`,
            { tenantId: req.tenantId, propertyId: agreement.propertyid }
          );
        }
        await queryTransaction(
          transaction,
          `INSERT INTO tenancy_lifecycle_events (
             tenant_id, agreement_id, event_type, from_status, to_status, actor_user_id, metadata
           ) VALUES (
             @tenantId, @agreementId, 'tenancy_closed', 'active', 'closed', @actorUserId, @metadata
           )`,
          {
            tenantId: req.tenantId,
            agreementId: agreement.id,
            actorUserId: req.user.id,
            metadata: JSON.stringify({ effectiveEndDate, unitReleased: Boolean(agreement.unitid), propertyAvailable: !otherActive })
          }
        );
        await transaction.commit();
        res.json({ data: closed, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) { next(error); }
  });

  return router;
};