import { getStorageDriver } from '../storage/index.js';
import { authorizeHistoricEviaAuditTrailRead } from './auditTrailAccess.js';
import { listEviaCompletedDocuments, downloadEviaCompletedDocument, exchangeEviaIntegrationApiKey } from './completedDocuments.js';

const failure = (message, status, code) => Object.assign(new Error(message), { status, code });
const missing = error => error?.status === 404 || error?.code === 'ENOENT' || error?.code === 'STORAGE_OBJECT_NOT_FOUND';
const validPdf = body => Buffer.isBuffer(body) && body.length >= 5
  && body.length <= 50 * 1024 * 1024 && body.subarray(0, 5).toString() === '%PDF-';

// Recover only the existing provider audit. Never rewrite the signed PDF,
// agreement status, signature rows or fenced archive publication records.
export const recoverHistoricEviaAudit = async ({
  agreementId, tenantId, user, membership, loadAgreement, accessToken = '',
  storageDriver = getStorageDriver(), fetchImpl = fetch,
  apiKey = process.env.EVIA_SIGN_API_KEY || ''
}) => {
  const path = `tenants/${tenantId}/agreements/${agreementId}/signed/audit_trail.pdf`;
  let agreement;
  const permission = await authorizeHistoricEviaAuditTrailRead({
    bucket: 'documents', path, tenantId, user, membership,
    loadHistoricAgreement: async () => { agreement = await loadAgreement(agreementId, tenantId); return agreement; }
  });
  if (!permission.applies || !permission.allowed) {
    throw failure('Audit recovery requires an active tenant administrator and a retained completed agreement.', 403, 'EVIA_AUDIT_RECOVERY_DENIED');
  }
  // Preserve exact object-key casing of the retained signed document. Do not
  // write beside a fenced/staged document without its publication protocol.
  const prefix = `/storage/documents/tenants/${tenantId}/agreements/${agreementId}/signed/`;
  const signedUrl = [agreement.signed_document_url, agreement.signeddocumenturl, agreement.signature_pdf_url]
    .find(value => typeof value === 'string' && value.toLowerCase().startsWith(prefix.toLowerCase())
      && /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.pdf$/i.test(value.slice(prefix.length)));
  if (!signedUrl) throw failure('Only retained historic agreement audits can be recovered here.', 409, 'EVIA_AUDIT_RECOVERY_SCOPE');
  const objectPath = signedUrl.slice('/storage/documents/'.length, signedUrl.lastIndexOf('/') + 1) + 'audit_trail.pdf';
  const auditTrailUrl = '/storage/documents/' + objectPath;
  try {
    const existing = await storageDriver.getObject('documents', objectPath);
    if (!validPdf(existing.body)) throw failure('The retained audit is invalid; recovery will not overwrite it.', 409, 'EVIA_AUDIT_RETAINED_INVALID');
    return { auditTrailUrl, recovered: false };
  } catch (error) { if (!missing(error)) throw error; }

  const requestId = String(agreement.eviasignreference || '').trim();
  if (!requestId) throw failure('Agreement has no Evia request reference.', 409, 'EVIA_REQUEST_REFERENCE_MISSING');
  let token = String(accessToken || '').trim();
  const supplied = Boolean(token);
  if (!token) token = (await exchangeEviaIntegrationApiKey({ apiKey, fetchImpl })).accessToken;
  const withRefresh = async operation => {
    try { return await operation(token); }
    catch (error) {
      if (error.status !== 401 || supplied) throw error;
      token = (await exchangeEviaIntegrationApiKey({ apiKey, fetchImpl })).accessToken;
      return operation(token);
    }
  };
  const documents = await withRefresh(accessToken => listEviaCompletedDocuments({ requestId, accessToken, fetchImpl }));
  const audits = documents.filter(document => document.documentName.toLowerCase() === 'audit_trail.pdf');
  if (audits.length !== 1) throw failure('Evia must return exactly one audit_trail.pdf for this agreement request.', 502, 'EVIA_AUDIT_DOCUMENT_MISSING_OR_AMBIGUOUS');
  const downloaded = await withRefresh(accessToken => downloadEviaCompletedDocument({ downloadUrl: audits[0].downloadUrl, accessToken, fetchImpl }));
  if (!validPdf(downloaded.body)) throw failure('Evia did not return a valid audit PDF.', 502, 'EVIA_AUDIT_PDF_INVALID');
  await storageDriver.createEviaAuditIfAbsent('documents', objectPath, downloaded.body);
  const retained = await storageDriver.getObject('documents', objectPath);
  if (!Buffer.isBuffer(retained.body) || !retained.body.equals(downloaded.body)) {
    throw failure('Retained audit bytes differ from the provider document; nothing was overwritten.', 409, 'EVIA_AUDIT_READBACK_CONFLICT');
  }
  return { auditTrailUrl, recovered: true };
};
