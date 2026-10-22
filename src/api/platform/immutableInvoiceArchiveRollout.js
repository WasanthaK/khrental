// An application-wide rollout flag alone must never place existing tenants
// into a new financial-document publication pipeline.
// During controlled acceptance, opt in only explicitly named tenant UUIDs.
// An absent, wildcard, malformed or partially invalid allowlist FAILS CLOSED.
// Broad availability requires a separate approved rollout design.
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export const isImmutableInvoiceArchiveEnabledForTenant = (tenantId, env = process.env) => {
  if (env?.INVOICE_IMMUTABLE_ARCHIVE_ENABLED !== 'true'
      || typeof tenantId !== 'string' || !UUID.test(tenantId)) return false;
  const raw = String(env?.INVOICE_IMMUTABLE_ARCHIVE_CANARY_TENANTS || '');
  if (!raw.trim()) return false;
  const allowedTenants = raw.split(',').map(value => value.trim());
  if (allowedTenants.some(value => !UUID.test(value))) return false;
  return allowedTenants.some(value => value.toLowerCase() === tenantId.toLowerCase());
};
