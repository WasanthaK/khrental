// Terminal Evia decisions are monotonic: late events must not reverse an
// already finalized agreement. A signed agreement lacking a retained local
// PDF may still accept a completed-document recovery delivery.
const TERMINAL_AGREEMENT_STATUSES = new Set([
  'signed', 'cancelled', 'rejected', 'completed', 'terminated', 'expired'
]);
const TERMINAL_SIGNATURE_STATUSES = new Set(['completed', 'failed']);
const normalized = value => String(value || '').trim().toLowerCase();

export const isEviaTerminalAgreement = agreement =>
  TERMINAL_AGREEMENT_STATUSES.has(normalized(agreement?.status))
  || TERMINAL_SIGNATURE_STATUSES.has(normalized(agreement?.signature_status));

export const evaluateEviaTerminalDelivery = ({
  agreement = {}, nextState = null, hasRetainedSignedDocument = false
} = {}) => {
  if (!isEviaTerminalAgreement(agreement)) return { action: 'process' };
  // Repair a completed signature's missing locally archived PDF. Preserve
  // immutable signed timestamps; the SQL update still validates live state.
  if (normalized(agreement.status) === 'signed'
      && normalized(agreement.signature_status) !== 'failed'
      && normalized(nextState?.agreementStatus) === 'signed'
      && normalized(nextState?.signatureStatus) === 'completed'
      && !hasRetainedSignedDocument) {
    return { action: 'recover_document' };
  }
  return { action: 'ignore', reason: 'evia_terminal_state_immutable' };
};
