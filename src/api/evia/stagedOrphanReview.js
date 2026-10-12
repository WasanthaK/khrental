import { validateEviaStagedArchiveUrl } from './archiveLease.js';

// Read-only triage. No storage deletion operation is exported or invoked.
// The durable lease row is overwritten on takeover; therefore a candidate
// is NOT proof that an object can safely be purged.
export const EVIA_STAGE_REVIEW_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const reviewEviaStagedObject = ({
  tenantId, agreementId, attemptId, objectUrl,
  lastModified, agreement = null, lease = null,
  now = new Date(), minAgeMs = EVIA_STAGE_REVIEW_MIN_AGE_MS
}) => {
  const protectedResult = reason => ({ status: 'protected', reason, mayDelete: false });
  // Every unverified, malformed or incomplete input is protected.
  try {
    validateEviaStagedArchiveUrl({
      tenantId, agreementId, attemptId, url: objectUrl
    });
  } catch {
    return protectedResult('invalid_or_unscoped_path');
  }
  if (!agreement || !lease || !Number.isSafeInteger(minAgeMs)
      || minAgeMs < EVIA_STAGE_REVIEW_MIN_AGE_MS) {
    return protectedResult('missing_authoritative_snapshot');
  }
  if (String(agreement.tenant_id || '').toLowerCase() !== String(tenantId).toLowerCase()
      || String(agreement.id || '').toLowerCase() !== String(agreementId).toLowerCase()) {
    return protectedResult('agreement_scope_mismatch');
  }
  let metadata;
  try { metadata = typeof lease.raw_data === 'string'
    ? JSON.parse(lease.raw_data) : lease.raw_data; }
  catch { return protectedResult('unreadable_lease_metadata'); }
  if (!metadata || typeof metadata !== 'object'
      || String(metadata.agreementId || '').toLowerCase() !== String(agreementId).toLowerCase()
      || !metadata.attemptId) {
    return protectedResult('unreadable_lease_metadata');
  }
  const authoritativeUrls = [
    agreement.signed_document_url,
    agreement.signeddocumenturl,
    agreement.signature_pdf_url,
    metadata.signedDocumentUrl,
    metadata.auditTrailUrl
  ].filter(Boolean);
  if (authoritativeUrls.includes(objectUrl)) {
    return protectedResult('retained_or_audit_document');
  }
  if (!lease.processed && String(metadata.attemptId).toLowerCase() === String(attemptId).toLowerCase()) {
    return protectedResult('current_active_attempt');
  }
  const observed = new Date(lastModified).getTime();
  const clock = new Date(now).getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(clock)
      || observed > clock || clock - observed < minAgeMs) {
    return protectedResult('recent_or_unknown_timestamp');
  }
  return {
    status: 'manual_review_candidate',
    reason: 'old_unreferenced_staging_object',
    mayDelete: false,
    ageMs: clock - observed
  };
};
