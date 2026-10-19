// Immutable, tenant-scoped human payment reference YYMMDDNN.
// The daily date comes from the issuer's persisted billing timezone, not
// the user's browser. 00 is never issued. Database uniqueness is authoritative.
const ymd = (now, timeZone) => {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, year:'2-digit',month:'2-digit',day:'2-digit'
    }).formatToParts(now);
  } catch {
    const err = new Error('Tenant billing timezone is not supported.');
    err.code = 'BILLING_TIMEZONE_INVALID';
    throw err;
  }
  const part = type => parts.find(p => p.type === type)?.value;
  const value = part('year') + part('month') + part('day');
  if (!/^\d{6}$/.test(value)) throw new Error('Invalid billing date');
  return value;
};

export const invoiceReferenceDay = (date, timeZone) => ymd(date, timeZone);

export const displayInvoicePaymentReference = (reference) =>
  /^\d{8}$/.test(String(reference || '')) ? String(reference) : null;

// Tenants may be created after an additive schema migration, so the
// billing timezone can be unset. UTC is the documented safe default;
// an explicitly configured business timezone always takes precedence.
export const resolveBillingTimezone = value => String(value || '').trim() || 'UTC';

/** Must run inside caller's SERIALIZABLE transaction, after locking invoice.
 * Scoped tenant app lock serializes generation between different invoice rows.
 * SQL unique index and PK enforce identity and tenant collision safety.
 */
export const allocateInvoicePaymentReference = async ({
  transaction, sql, tenantId, invoiceId, actorUserId, source, now = new Date()
}) => {
  if (!['invoice_issue', 'manual_supplement'].includes(source)) throw new Error('Invalid reference source');
  const request = (query, params = {}) => {
    const r = new sql.Request(transaction);
    Object.entries(params).forEach(([key,value]) => r.input(key,value));
    return r.query(query);
  };
  const lock = await request(`
    DECLARE @result INT;
    EXEC @result = sp_getapplock
      @Resource = @resource, @LockMode = 'Exclusive',
      @LockOwner = 'Transaction', @LockTimeout = 10000;
    SELECT @result AS result;
  `,{resource:'invoice-reference:'+String(tenantId)});
  if ((lock.recordset?.[0]?.result ?? -999) < 0) {
    const err = new Error('Unable to acquire invoice reference allocation lock.');
    err.code = 'INVOICE_REFERENCE_LOCK_FAILED';
    throw err;
  }
  const existing = await request(
    'SELECT payment_reference FROM dbo.invoice_payment_references WHERE tenant_id=@tenantId AND invoice_id=@invoiceId',
    {tenantId,invoiceId}
  );
  if (existing.recordset?.[0]) {
    const err = new Error('Invoice already has a bank payment reference.');
    err.code = 'INVOICE_REFERENCE_ALREADY_ASSIGNED';
    throw err;
  }
  const setting = await request(`
    SELECT billing_timezone FROM dbo.tenant_settings
    WHERE tenant_id=@tenantId
  `,{tenantId});
  const zone = resolveBillingTimezone(setting.recordset?.[0]?.billing_timezone);
  const day = invoiceReferenceDay(now,zone);
  const max = await request(`
    SELECT MAX(payment_reference) AS last_reference
    FROM dbo.invoice_payment_references WITH (UPDLOCK, HOLDLOCK)
    WHERE tenant_id=@tenantId
      AND payment_reference LIKE @dayPrefix
  `,{tenantId,dayPrefix:day+'%'});
  const last = max.recordset?.[0]?.last_reference;
  const next = last ? Number(String(last).slice(6)) + 1 : 1;
  if (!Number.isInteger(next) || next < 1 || next > 99) {
    const err = new Error('Daily limit of 99 invoice references reached. Do not issue this invoice.');
    err.code = 'INVOICE_REFERENCE_DAILY_LIMIT';
    throw err;
  }
  const reference = day + String(next).padStart(2,'0');
  await request(`
    INSERT INTO dbo.invoice_payment_references
      (tenant_id,invoice_id,payment_reference,reference_timezone,source,assigned_by)
    VALUES (@tenantId,@invoiceId,@reference,@zone,@source,@actorUserId)
  `,{tenantId,invoiceId,reference,zone,source,actorUserId});
  return reference;
};
