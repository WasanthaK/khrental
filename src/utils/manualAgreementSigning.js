// Manual administrator signing is distinct from Evia's authenticated webhook
// completion. Follow the canonical pending/pending_signature signable statuses.
export const MANUAL_SIGNABLE_STATUSES = Object.freeze(['pending', 'pending_signature']);

const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '';

export const isEviaManagedAgreement = (agreement = {}) => (
  [
    agreement.eviasignreference,
    agreement.evia_document_id,
    agreement.signature_request_id,
    agreement.signature_sent_at,
    agreement.signature_completed_at
  ].some(hasValue)
  || (hasValue(agreement.signature_status)
    && !['unsigned', 'manual', 'pending_manual'].includes(String(agreement.signature_status).trim().toLowerCase()))
);

export const evaluateManualSigning = (agreement) => {
  if (!agreement) {
    return { allowed: false, code: 'AGREEMENT_NOT_FOUND' };
  }
  // Evia authority always wins, even when an agreement was already signed.
  if (isEviaManagedAgreement(agreement)) {
    return { allowed: false, code: 'EVIA_SIGNING_MANAGED' };
  }
  const status = String(agreement.status || '').trim().toLowerCase();
  if (status === 'signed') {
    return { allowed: false, alreadySigned: true, code: 'ALREADY_MANUALLY_SIGNED' };
  }
  if (!MANUAL_SIGNABLE_STATUSES.includes(status)) {
    return { allowed: false, code: 'MANUAL_SIGN_STATE_INVALID' };
  }
  return { allowed: true, code: null };
};
