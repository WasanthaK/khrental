const containsClosedAgreementStatus = (payload) => {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.some((row) => String(row?.status || '').trim().toLowerCase() === 'closed');
};

/**
 * Closing a tenancy releases occupancy and therefore must not be a generic
 * agreement status edit. Force status=closed through the exit lifecycle API.
 */
export const guardTenancyClosureQuery = (req, res, next) => {
  const action = String(req.body?.action || 'select').trim().toLowerCase();
  const table = String(req.body?.table || '').trim().toLowerCase();

  if (
    table === 'agreements'
    && ['insert', 'update', 'upsert'].includes(action)
    && containsClosedAgreementStatus(req.body?.payload)
  ) {
    res.status(409).json({
      error: 'Tenancy closure must use the dedicated exit and settlement endpoint.',
      code: 'TENANCY_CLOSURE_REQUIRED'
    });
    return;
  }

  next();
};

export { containsClosedAgreementStatus };
