const containsActiveAgreementStatus = (payload) => {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.some((row) => String(row?.status || '').trim().toLowerCase() === 'active');
};

/**
 * Agreement activation is a business transition, not a generic CRUD update.
 * Keep the normal agreement draft/review/signature updates available while
 * forcing status=active through /api/tenancies/:agreementId/activate.
 */
export const guardTenancyActivationQuery = (req, res, next) => {
  const action = String(req.body?.action || 'select').trim().toLowerCase();
  const table = String(req.body?.table || '').trim().toLowerCase();

  if (
    table === 'agreements'
    && ['insert', 'update', 'upsert'].includes(action)
    && containsActiveAgreementStatus(req.body?.payload)
  ) {
    res.status(409).json({
      error: 'Tenancy activation must use the dedicated activation endpoint.',
      code: 'TENANCY_ACTIVATION_REQUIRED'
    });
    return;
  }

  next();
};

export { containsActiveAgreementStatus };
