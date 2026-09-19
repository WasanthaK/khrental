import crypto from 'node:crypto';
import express from 'express';
import { runQuery, runSingleQuery } from '../mssql/query.js';

const COMPLETED_STATUSES = new Set(['completed', 'complete', 'signed', 'signing_complete']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'recalled']);
const REJECTED_STATUSES = new Set(['rejected', 'declined', 'failed']);
const WEBHOOK_SIGNATURE_HEADER_CANDIDATES = [
  'x-evia-signature',
  'x-eviasign-signature',
  'x-webhook-signature',
  'x-hmac-signature',
  'x-signature',
  'x-hub-signature-256',
  'signature'
];

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

const timingSafeStringEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const splitSignatureCandidates = (value) => {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  if (!raw.trim()) return [];

  const candidates = new Set();
  raw.split(',').forEach((part) => {
    const trimmed = part.trim().replace(/^['"]|['"]$/g, '');
    if (!trimmed) return;
    candidates.add(trimmed);

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex > 0) {
      const key = trimmed.slice(0, equalsIndex).trim().toLowerCase();
      const candidate = trimmed.slice(equalsIndex + 1).trim();
      if (['sha256', 'v1', 'signature', 'hmac'].includes(key) && candidate) {
        candidates.add(candidate);
      }
    }

    if (trimmed.toLowerCase().startsWith('sha256:')) {
      candidates.add(trimmed.slice('sha256:'.length).trim());
    }
  });

  return [...candidates];
};

export const getEviaWebhookSignature = (headers = {}) => {
  const normalizedHeaders = Object.entries(headers || {}).reduce((result, [key, value]) => {
    result[String(key).toLowerCase()] = value;
    return result;
  }, {});

  for (const headerName of WEBHOOK_SIGNATURE_HEADER_CANDIDATES) {
    if (normalizedHeaders[headerName]) {
      return normalizedHeaders[headerName];
    }
  }

  const genericHeader = Object.entries(normalizedHeaders).find(([key, value]) =>
    value && (key.includes('signature') || key.includes('hmac'))
  );
  return genericHeader?.[1] || null;
};

export const verifyEviaWebhookHmac = ({ rawBody, signature, secret }) => {
  if (!secret || !rawBody || !signature) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const digest = crypto.createHmac('sha256', secret).update(body).digest();
  const acceptedDigests = [
    digest.toString('hex'),
    digest.toString('base64'),
    digest.toString('base64url')
  ];

  return splitSignatureCandidates(signature).some((candidate) =>
    acceptedDigests.some((expected) => timingSafeStringEqual(candidate, expected))
  );
};

export const verifyEviaWebhookRequest = (req) => {
  const secret = process.env.EVIA_WEBHOOK_HMAC_SECRET || '';
  if (!secret) {
    return {
      ok: false,
      statusCode: 503,
      error: 'Evia webhook HMAC verification is not configured.'
    };
  }

  if (!req.rawBody) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Evia webhook raw request body is unavailable.'
    };
  }

  const signature = getEviaWebhookSignature(req.headers);
  if (!signature) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Evia webhook signature is missing.'
    };
  }

  if (!verifyEviaWebhookHmac({ rawBody: req.rawBody, signature, secret })) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Evia webhook signature is invalid.'
    };
  }

  return { ok: true };
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

  const eventIdValue = firstDefined(root.EventId, root.eventId, root.event_id, data.EventId, data.eventId);
  const eventId = eventIdValue === undefined || eventIdValue === null || eventIdValue === '' ? null : Number(eventIdValue);
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

  const candidate = direct || normalizeEviaWebhookPayload(payload).documents.map(getDocumentUrlCandidate).find(Boolean);
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

const handleWebhook = async (req, res, next) => {
  try {
    const verification = verifyEviaWebhookRequest(req);
    if (!verification.ok) {
      res.status(verification.statusCode).json({ received: false, error: verification.error });
      return;
    }

    const result = await processEviaWebhook(req.body || {});
    res.status(result.statusCode).json(result.body);
  } catch (error) {
    next(error);
  }
};

export const createEviaWebhookRouter = () => {
  const router = express.Router();
  router.post('/webhook', handleWebhook);
  router.post('/legacy-webhook', handleWebhook);
  return router;
};
