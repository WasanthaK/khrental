// Explicit, per-tenant + per-agreement release gate for the *future* fenced
// Evia archive transport. OFF by default; no browser/query/payload toggle.
// Authentication is performed by createEviaWebhookRouter before this check.
const guid = value => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const allowlist = input => String(input || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export const isEviaFencedArchiveCanaryEligible = ({
  verifiedRequest = false, agreement = null, normalized = null,
  finalState = null, hasRetainedSignedDocument = false, env = process.env
} = {}) => {
  if (env?.EVIA_FENCED_ARCHIVE_MODE !== 'canary' || verifiedRequest !== true) return false;
  if (!agreement || !normalized || finalState?.signatureStatus !== 'completed') return false;
  const tenantId = String(agreement.tenant_id || '').toLowerCase();
  const agreementId = String(agreement.id || '').toLowerCase();
  if (!guid(tenantId) || !guid(agreementId)
      || !allowlist(env.EVIA_FENCED_ARCHIVE_CANARY_TENANTS).includes(tenantId)
      || !allowlist(env.EVIA_FENCED_ARCHIVE_CANARY_AGREEMENTS).includes(agreementId)) {
    return false;
  }
  if (!normalized.requestId || !String(normalized.deliveryId || '').trim()
      || hasRetainedSignedDocument) return false;
  // A completion signatory-specific delivery belongs to the legacy metadata
  // workflow. Do not silently lose per-recipient delivery diagnostics.
  if (normalized.recipientEmail || normalized.recipientName) return false;
  const status = String(agreement.status || '').toLowerCase();
  const signature = String(agreement.signature_status || '').toLowerCase();
  if (['cancelled', 'rejected', 'terminated', 'expired'].includes(status)
    || signature === 'failed') return false;
  return true;
};
