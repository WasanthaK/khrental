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

// MSSQL column names are case-insensitive. Normalize only top-level column
// keys; nested terms and signatory content retain their original spelling.
export const normalizeAgreementPayload = (payload = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { throw invalid('invalid_payload'); }
  const result = {};
  for (const [key, value] of Object.entries(payload)) {
    const column = key.toLowerCase();
    if (Object.hasOwn(result, column)) {
      throw Object.assign(new Error('Duplicate agreement field.'), {status:400, code:'AGREEMENT_FIELD_COLLISION'});
    }
    Object.defineProperty(result, column, {value, enumerable:true, writable:true, configurable:true});
  }
  return result;
};

export const assertGenericAgreementRecordMutable = record => {
  if (['signed', 'completed', 'active', 'closed'].includes(normalized(record?.status))
      || SIGNED_SIGNATURE_STATES.has(normalized(record?.signature_status))) {
    throw Object.assign(new Error('Signed agreements cannot be changed through generic updates.'), {
      status:409, code:'SIGNED_AGREEMENT_IMMUTABLE'
    });
  }
};

export const assertGenericAgreementWriteSafe = (payload = {}) => {
  payload = normalizeAgreementPayload(payload);
  if (normalized(payload.status) === 'closed') {
    throw Object.assign(new Error('Tenancy closure must use the dedicated exit and settlement endpoint.'), {status:409,code:'TENANCY_CLOSURE_REQUIRED'});
  }
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
  !PROTECTED_SIGNATURE_FIELDS.has(String(key).toLowerCase());
