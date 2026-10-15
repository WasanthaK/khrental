// The generic agreement CRUD API may edit draft and review records, but it
// must not become a second signing authority. Only the verified Evia callback
// and the dedicated transactional manual-sign service may finalize signing.
const PROTECTED_SIGNATURE_FIELDS = new Set([
  'signed_document_url', 'signeddocumenturl', 'signature_pdf_url',
  'signatureurl', 'signature_completed_at', 'signeddate'
]);
const SIGNED_STATES = new Set(['signed', 'completed', 'active']);
const SIGNED_SIGNATURE_STATES = new Set(['signed', 'completed', 'signing_complete']);

const invalid = (detail) => Object.assign(
  new Error('Signing evidence must be recorded by the verified signing workflow.'),
  { status: 409, code: 'AGREEMENT_SIGNING_AUTHORITY_REQUIRED', detail }
);
const normalized = value => String(value || '').trim().toLowerCase();

export const assertGenericAgreementWriteSafe = (payload = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw invalid('invalid_payload');
  }
  if (SIGNED_STATES.has(normalized(payload.status))
      || SIGNED_SIGNATURE_STATES.has(normalized(payload.signature_status))) {
    throw invalid('terminal_signing_state');
  }
  for (const key of PROTECTED_SIGNATURE_FIELDS) {
    if (payload[key] !== undefined && payload[key] !== null
        && String(payload[key]).trim() !== '') {
      throw invalid('signature_provenance_field');
    }
  }
  let signatories = payload.signatories_status;
  if (typeof signatories === 'string' && signatories.trim()) {
    try { signatories = JSON.parse(signatories); }
    catch { throw invalid('signatory_json_invalid'); }
  }
  if (Array.isArray(signatories) && signatories.some(person =>
    SIGNED_SIGNATURE_STATES.has(normalized(person?.status))
      || person?.signed_at || person?.signedAt)) {
    throw invalid('completed_signatory_unverified');
  }
  return true;
};

export const shouldApplyGenericAgreementChange = key =>
  !PROTECTED_SIGNATURE_FIELDS.has(key);
