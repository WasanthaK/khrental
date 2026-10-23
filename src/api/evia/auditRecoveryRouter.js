import express from 'express';
import { recoverHistoricEviaAudit } from './auditRecovery.js';

export const createEviaAuditRecoveryRouter = ({ requireApiSession, resolveTenantContext, loadAgreement, recoverAudit = recoverHistoricEviaAudit }) => {
  const router = express.Router();
  router.post('/agreements/:agreementId/audit-trail', requireApiSession, resolveTenantContext, async (req, res, next) => {
    try {
      const agreementId = String(req.params.agreementId || '');
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(agreementId)) {
        return res.status(400).json({ error: 'A valid agreement ID is required.', code: 'AGREEMENT_ID_REQUIRED' });
      }
      const result = await recoverAudit({
        agreementId, tenantId: req.tenantId, user: req.user, membership: req.membership,
        loadAgreement, accessToken: String(req.body?.accessToken || '').trim()
      });
      console.info('[EviaDiag] audit_recovery_completed', {
        agreementId, tenantId: req.tenantId, actorId: req.user?.id,
        recovered: result.recovered
      });
      res.set('Cache-Control', 'no-store').json(result);
    } catch (error) { next(error); }
  });
  return router;
};
