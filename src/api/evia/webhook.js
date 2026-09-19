import express from 'express';
import { runQuery, runSingleQuery } from '../mssql/query.js';

const COMPLETED_STATUSES = new Set(['completed', 'complete', 'signed', 'signing_complete']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'recalled']);
const REJECTED_STATUSES = new Set(['rejected', 'declined', 'failed']);

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const normalizeStatus = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

export const normalizeEviaWebhookPayload = (payload = {}) => {
  const root = asObject(payload);
  const data = asObject(root.data);
  const nestedPayload = asObject(root.payload);
  const eventData = asObject(root.eventData || root.event_data);

  const requestId = String(firstDefined(
    root.RequestId,
    root.requestId,
    root.request_id,
    data.RequestId,
    data.requestId,
    data.request_id,
    nestedPayload.RequestId,
    nestedPayload.requestId,
    nestedPayload.request_id,
    eventData.RequestId,
    eventData.requestId,
    eventData.request_id
  ) || '').trim();

  const eventType = String(firstDefined(
    root.event,
    root.Event,
    root.eventType,
    root.event_type,
    root.EventDescription,
    data.event,
    data.eventType,
    nestedPayload.event,
    nestedPayload.eventType
  ) || '').trim().toLowerCase();

  const eventId = Number(firstDefined(root.EventId, root.eventId, root.event_id, data.EventId, data.eventId));
  const status = normalizeStatus(firstDefined(
    root.Status,
    root.status,
    data.Status,
    data.status,
    nestedPayload.Status,
    nestedPayload.status,
    eventData.Status,
    eventData.status
  ));

  const eventTime = firstDefined(
    root.EventTime,
    root.eventTime,
    root.event_time,
    root.CompletedAt,
    root.completedAt,
    data.EventTime,
    data.eventTime,
    data.completedAt,
    nestedPayload.EventTime,
    nestedPayload.eventTime,
    nestedPayload.completedAt
  ) || null;

  const documents = firstDefined(root.Documents, root.documents, data.Documents, data.documents, nestedPayload.Documents, nestedPayload.documents) || [];

  return {
    requestId,
    eventType,
    eventId: Number.isFinite(eventId) ? eventId : null,
    status,
    eventTime,
    documents: Array.isArray(documents) ? documents : []
  };
};

export const markAllSignatoriesCompleted = (value, completedAt) => {
  const signatories = parseJsonArray(value);
  if (signatories.length === 0) return null;

  return signatories.map((signatory) => ({
    ...signatory,
    status: 'completed',
    signed_at: signatory?.signed_at || signatory?.signedAt || completedAt,
    signedAt: signatory?.signedAt || signatory?.signed_at || completedAt
  }));
};

const getDocumentUrlCandidate = (document) => {
  if (!document || typeof document !== 'object') return null;
  return firstDefined(
    document.SignedDocumentUrl,
    document.signedDocumentUrl,
    document.DocumentUrl,
    document.documentUrl,
    document.Url,
    document.url,
    document.DownloadUrl,
    document.downloadUrl
  ) || null;
};

export const extractSignedDocumentUrl = (payload = {}) => {
  const root = asObject(payload);
  const data = asObject(root.data);
  const direct = firstDefined(
    root.SignedDocumentUrl,
    root.signedDocumentUrl,
    root.signed_document_url,
    root.DocumentUrl,
    root.documentUrl,
    data.SignedDocumentUrl,
    data.signedDocumentUrl,
    data.signed_document_url,
    data.DocumentUrl,
    data.documentUrl
  );

  const candidate = direct || (normalizeEviaWebhookPayload(payload).documents.map(getDocumentUrlCandidate).find(Boolean));
  if (!candidate) return null;

  try {
    const parsed = new URL(String(candidate));
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch (_error) {
    return null;
  }
};

const isCompletionNotification = ({ eventType, eventId, status }) => {
  if (eventId === 3) return true;
  if (eventType === 'request.completed' || eventType.includes('requestcompleted') || eventType.includes('request completed')) return true;
  return COMPLETED_STATUSES.has(status);
};

const mapFinalAgreementState = ({ eventType, eventId, status }) => {
  if (CANCELLED_STATUSES.has(status)) {
    return { agreementStatus: 'cancelled', signatureStatus: 'failed' };
  }
  if (REJECTED_STATUSES.has(status)) {
    return { agreementStatus: 'rejected', signatureStatus: 'failed' };
  }
  if (isCompletionNotification({ eventType, eventId, status })) {
    // `request.completed` is documented as the event emitted when all required
    // signatures are complete. Some Evia payloads omit Status, so the event
    // itself is sufficient to advance the agreement to signed.
    return { agreementStatus: 'signed', signatureStatus: 'completed' };
  }
  return null;
};

export const processEviaWebhook = async (payload = {}) => {
  const normalized = normalizeEviaWebhookPayload(payload);
  if (!normalized.requestId) {
    return { statusCode: 400, body: { received: false, error: 'RequestId is required.' } };
  }

  const agreement = await runSingleQuery(`
    SELECT TOP 1
      id,
      status,
      signature_status,
      signature_completed_at,
      signatories_status,
      signed_document_url,
      signeddocumenturl,
      signature_pdf_url
    FROM dbo.agreements
    WHERE eviasignreference = @requestId
  `, { requestId: normalized.requestId });

  if (!agreement) {
    console.warn('[EviaWebhook] No agreement matches request reference', { requestId: normalized.requestId });
    // Acknowledge the delivery so Evia does not retry forever for a request that
    // belongs to another environment or an older deleted test agreement.
    return {
      statusCode: 200,
      body: { received: true, matched: false, requestId: normalized.requestId }
    };
  }

  const finalState = mapFinalAgreementState(normalized);
  if (!finalState) {
    console.log('[EviaWebhook] Event received with no terminal agreement transition', {
      requestId: normalized.requestId,
      eventType: normalized.eventType || null,
      eventId: normalized.eventId,
      status: normalized.status || null
    });
    return {
      statusCode: 200,
      body: { received: true, matched: true, updated: false, agreementId: agreement.id }
    };
  }

  const completedAt = normalized.eventTime ? new Date(normalized.eventTime) : new Date();
  const safeCompletedAt = Number.isNaN(completedAt.getTime()) ? new Date() : completedAt;
  const signedDocumentUrl = extractSignedDocumentUrl(payload);
  const completedSignatories = finalState.signatureStatus === 'completed'
    ? markAllSignatoriesCompleted(agreement.signatories_status, safeCompletedAt.toISOString())
    : null;

  await runQuery(`
    UPDATE dbo.agreements
    SET
      status = @agreementStatus,
      signature_status = @signatureStatus,
      signature_completed_at = CASE
        WHEN @signatureStatus = 'completed' THEN COALESCE(signature_completed_at, @completedAt)
        ELSE signature_completed_at
      END,
      signeddate = CASE
        WHEN @signatureStatus = 'completed' THEN COALESCE(signeddate, @completedAt)
        ELSE signeddate
      END,
      signatories_status = CASE
        WHEN @completedSignatories IS NOT NULL THEN @completedSignatories
        ELSE signatories_status
      END,
      signed_document_url = CASE
        WHEN @signedDocumentUrl IS NOT NULL THEN @signedDocumentUrl
        ELSE signed_document_url
      END,
      signeddocumenturl = CASE
        WHEN @signedDocumentUrl IS NOT NULL THEN @signedDocumentUrl
        ELSE signeddocumenturl
      END,
      signature_pdf_url = CASE
        WHEN @signedDocumentUrl IS NOT NULL THEN @signedDocumentUrl
        ELSE signature_pdf_url
      END,
      updatedat = SYSUTCDATETIME()
    WHERE id = @agreementId
      AND eviasignreference = @requestId
  `, {
    agreementId: agreement.id,
    requestId: normalized.requestId,
    agreementStatus: finalState.agreementStatus,
    signatureStatus: finalState.signatureStatus,
    completedAt: safeCompletedAt.toISOString(),
    completedSignatories: completedSignatories ? JSON.stringify(completedSignatories) : null,
    signedDocumentUrl
  });

  console.log('[EviaWebhook] Agreement updated from Evia event', {
    agreementId: agreement.id,
    requestId: normalized.requestId,
    status: finalState.agreementStatus,
    signatureStatus: finalState.signatureStatus,
    signedDocumentUrlReceived: Boolean(signedDocumentUrl)
  });

  return {
    statusCode: 200,
    body: {
      received: true,
      matched: true,
      updated: true,
      agreementId: agreement.id,
      status: finalState.agreementStatus,
      signatureStatus: finalState.signatureStatus,
      signedDocumentUrlReceived: Boolean(signedDocumentUrl)
    }
  };
};

export const createEviaWebhookRouter = () => {
  const router = express.Router();

  router.post('/webhook', async (req, res, next) => {
    try {
      const result = await processEviaWebhook(req.body || {});
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  // Keep the historical callback path working while the Evia registration is
  // moved to /api/evia/webhook.
  router.post('/legacy-webhook', async (req, res, next) => {
    try {
      const result = await processEviaWebhook(req.body || {});
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
