import crypto from 'node:crypto';
import express from 'express';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import { sql } from '../mssql/pool.js';
import { claimEviaWebhookDelivery } from './deliveryClaim.js';
import { evaluateEviaTerminalDelivery, isEviaTerminalAgreement } from './terminalPolicy.js';
import { withEviaAgreementArchiveLock } from './archiveLock.js';
import { withEviaArchiveCapacity } from './archiveCapacity.js';
import { isEviaFencedArchiveCanaryEligible } from './fencedCanaryPolicy.js';
import { runDormantEviaFencedArchive, stageEviaDocumentsForFencedLease } from './archiveCoordinator.js';
import { retrieveAndStoreEviaCompletedDocuments, storeEviaWebhookCompletedDocuments } from './completedDocuments.js';

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
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const shortId = (value) => String(value || '').slice(0, 8);
const summarizeStoredSignatories = (value) => parseJsonArray(value).map((entry) => ({
  type: entry?.type || null,
  status: entry?.status || null,
  hasSignedAt: Boolean(entry?.signed_at || entry?.signedAt)
}));

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

const encodeBase64UrlJson = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

export const createEviaCallbackToken = ({
  agreementId,
  tenantId,
  secret,
  expiresInSeconds = 90 * 24 * 60 * 60,
  now = Date.now()
}) => {
  if (!agreementId || !tenantId || !secret) {
    throw new Error('agreementId, tenantId and secret are required to create an Evia callback token.');
  }

  const payload = {
    agreementId: String(agreementId),
    tenantId: String(tenantId),
    exp: Math.floor(now / 1000) + Number(expiresInSeconds)
  };
  const encodedPayload = encodeBase64UrlJson(payload);
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
};

export const verifyEviaCallbackToken = ({ token, secret, now = Date.now() }) => {
  if (!token || !secret) return { ok: false };

  const [encodedPayload, signature, ...rest] = String(token).split('.');
  if (!encodedPayload || !signature || rest.length > 0) return { ok: false };

  const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (!timingSafeStringEqual(signature, expectedSignature)) return { ok: false };

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload?.agreementId || !payload?.tenantId || !Number.isFinite(Number(payload?.exp))) {
      return { ok: false };
    }
    if (Number(payload.exp) <= Math.floor(now / 1000)) return { ok: false, expired: true };
    return {
      ok: true,
      agreementId: String(payload.agreementId),
      tenantId: String(payload.tenantId),
      exp: Number(payload.exp)
    };
  } catch (_error) {
    return { ok: false };
  }
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
      error: 'Evia webhook verification is not configured.'
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
  if (signature && verifyEviaWebhookHmac({ rawBody: req.rawBody, signature, secret })) {
    return { ok: true, mode: 'hmac' };
  }

  const callbackToken = req.query?.callback_token || req.query?.callbackToken || null;
  const tokenVerification = verifyEviaCallbackToken({ token: callbackToken, secret });
  if (tokenVerification.ok) {
    return {
      ok: true,
      mode: 'agreement_callback_token',
      agreementId: tokenVerification.agreementId,
      tenantId: tokenVerification.tenantId
    };
  }

  return {
    ok: false,
    statusCode: 401,
    error: signature ? 'Evia webhook signature is invalid.' : 'Evia webhook verification is missing or invalid.'
  };
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

  const deliveryId = String(firstDefined(
    root.deliveryId,
    root.DeliveryId,
    root.delivery_id,
    data.deliveryId,
    data.DeliveryId,
    data.delivery_id,
    nestedPayload.deliveryId,
    nestedPayload.DeliveryId,
    nestedPayload.delivery_id,
    eventData.deliveryId,
    eventData.DeliveryId,
    eventData.delivery_id
  ) || '').trim();

  const eventIdValue = firstDefined(
    root.EventId,
    root.eventId,
    root.event_id,
    data.EventId,
    data.eventId,
    data.event_id,
    nestedPayload.EventId,
    nestedPayload.eventId,
    nestedPayload.event_id
  );
  const numericEventId = eventIdValue === undefined || eventIdValue === null || eventIdValue === ''
    ? null
    : Number(eventIdValue);
  const eventId = Number.isFinite(numericEventId) ? numericEventId : null;
  const eventIdText = eventId === null ? String(eventIdValue || '').trim().toLowerCase() : '';

  const eventType = String(firstDefined(
    root.event,
    root.Event,
    root.eventType,
    root.event_type,
    root.EventDescription,
    data.event,
    data.eventType,
    nestedPayload.event,
    nestedPayload.eventType,
    eventIdText
  ) || '').trim().toLowerCase();
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
    root.timestamp,
    root.Timestamp,
    data.EventTime,
    data.eventTime,
    data.completedAt,
    data.timestamp,
    data.Timestamp,
    nestedPayload.EventTime,
    nestedPayload.eventTime,
    nestedPayload.completedAt,
    nestedPayload.timestamp,
    nestedPayload.Timestamp
  ) || null;

  const recipientEmail = normalizeEmail(firstDefined(
    root.Email,
    root.email,
    root.RecipientEmail,
    root.recipientEmail,
    data.Email,
    data.email,
    data.RecipientEmail,
    data.recipientEmail,
    nestedPayload.Email,
    nestedPayload.email
  ));

  const recipientName = String(firstDefined(
    root.Name,
    root.name,
    root.UserName,
    root.userName,
    data.Name,
    data.name,
    nestedPayload.Name,
    nestedPayload.name
  ) || '').trim();

  const deliveryStatus = normalizeStatus(firstDefined(
    root.EmailDeliveryStatus,
    root.emailDeliveryStatus,
    root.email_delivery_status,
    root.DeliveryStatus,
    root.deliveryStatus,
    root.EmailStatus,
    root.emailStatus,
    data.EmailDeliveryStatus,
    data.emailDeliveryStatus,
    data.DeliveryStatus,
    data.deliveryStatus,
    data.EmailStatus,
    data.emailStatus
  ));

  const subject = String(firstDefined(
    root.Subject,
    root.subject,
    data.Subject,
    data.subject,
    nestedPayload.Subject,
    nestedPayload.subject
  ) || '').trim();

  const documents = firstDefined(root.Documents, root.documents, data.Documents, data.documents, nestedPayload.Documents, nestedPayload.documents) || [];

  return {
    requestId,
    deliveryId,
    eventType,
    eventId: Number.isFinite(eventId) ? eventId : null,
    status,
    eventTime,
    recipientEmail,
    recipientName,
    subject,
    deliveryStatus,
    documents: Array.isArray(documents) ? documents : []
  };
};

const recordVerifiedWebhookEvent = async ({ agreement, normalized, payload, transaction = null }) => {
  const eventTime = normalized.eventTime ? new Date(normalized.eventTime) : null;
  const safeEventTime = eventTime && !Number.isNaN(eventTime.getTime()) ? eventTime.toISOString() : null;
  const statement = `
    INSERT INTO dbo.webhook_events (
      tenant_id,
      event_type,
      request_id,
      user_name,
      user_email,
      subject,
      event_id,
      event_time,
      raw_data,
      processed,
      createdat,
      updatedat
    )
    OUTPUT INSERTED.id
    VALUES (
      @tenantId,
      @eventType,
      @requestId,
      @userName,
      @userEmail,
      @subject,
      @eventId,
      @eventTime,
      @rawData,
      0,
      SYSUTCDATETIME(),
      SYSUTCDATETIME()
    )
  `;
  const params = {
    tenantId: agreement.tenant_id,
    eventType: normalized.eventType || null,
    requestId: normalized.requestId || null,
    userName: normalized.recipientName || null,
    userEmail: normalized.recipientEmail || null,
    subject: normalized.subject || null,
    eventId: normalized.eventId,
    eventTime: safeEventTime,
    rawData: JSON.stringify({
      payloadKeys: Object.keys(asObject(payload)),
      eventType: normalized.eventType || null,
      eventId: normalized.eventId,
      status: normalized.status || null,
      requestId: normalized.requestId ? shortId(normalized.requestId) : null,
      deliveryId: normalized.deliveryId || null,
      recipientPresent: Boolean(normalized.recipientEmail || normalized.recipientName),
      deliveryStatus: normalized.deliveryStatus || null,
      documentCount: normalized.documents.length,
      documents: normalized.documents.map((document) => ({
        keys: Object.keys(asObject(document)),
        name: document?.DocumentName || document?.documentName || null,
        hasContent: Boolean(document?.DocumentContent || document?.documentContent),
        hasUrl: Boolean(getDocumentUrlCandidate(document))
      }))
    })
  };

  if (transaction) {
    const request = new sql.Request(transaction);
    Object.entries(params).forEach(([name, value]) => request.input(name, value));
    const result = await request.query(statement);
    return result.recordset?.[0]?.id || null;
  }
  const rows = await runQuery(statement, params);
  return rows?.[0]?.id || null;
};

const markWebhookEventProcessed = async (eventRecordId) => {
  if (!eventRecordId) return;
  await runQuery(`
    UPDATE dbo.webhook_events
    SET processed = 1,
        processed_at = SYSUTCDATETIME(),
        updatedat = SYSUTCDATETIME()
    WHERE id = @eventRecordId
  `, { eventRecordId });
};


const hasProcessedWebhookDelivery = async ({ tenantId, requestId, deliveryId }) => {
  if (!tenantId || !requestId || !deliveryId) return false;

  // Match only previously completed deliveries within the resolved tenant.
  // In-flight or failed deliveries remain retryable; no second event is
  // inserted for a fully processed duplicate.
  const existing = await runSingleQuery(`
    SELECT TOP 1 id
    FROM dbo.webhook_events
    WHERE tenant_id = @tenantId
      AND request_id = @requestId
      AND processed = 1
      AND ISJSON(raw_data) = 1
      AND JSON_VALUE(raw_data, '$.deliveryId') = @deliveryId
    ORDER BY createdat DESC
  `, {
    tenantId,
    requestId,
    deliveryId
  });

  return Boolean(existing?.id);
};

const getStoredSignedDocumentUrl = (agreement = {}) => {
  const candidates = [
    agreement.signed_document_url,
    agreement.signeddocumenturl,
    agreement.signature_pdf_url
  ].filter(Boolean);

  return candidates.find((value) => String(value).startsWith('/storage/documents/tenants/')) || null;
};
// A processed completion without an archived signed document is still
// recoverable: re-delivery may be the only chance to retain the signed PDF.
export const shouldIgnoreProcessedEviaDelivery = ({ alreadyProcessed, normalized = {}, agreement = {} }) => {
  if (!alreadyProcessed) return false;
  if (!isCompletionNotification(normalized)) return true;
  return String(agreement.status || '').toLowerCase() === 'signed'
    && String(agreement.signature_status || '').toLowerCase() === 'completed'
    && Boolean(getStoredSignedDocumentUrl(agreement));
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

export const updateSignatoryCompletion = (value, { email, name, eventTime }) => {
  const normalizedRecipientEmail = normalizeEmail(email);
  const signatories = parseJsonArray(value);
  const timestamp = eventTime || new Date().toISOString();

  if (!normalizedRecipientEmail && !name) return null;

  const existingIndex = signatories.findIndex((signatory) => {
    if (normalizedRecipientEmail && normalizeEmail(signatory?.email) === normalizedRecipientEmail) return true;
    return name && String(signatory?.name || '').trim().toLowerCase() === String(name).trim().toLowerCase();
  });

  const completionPatch = {
    status: 'completed',
    signed_at: timestamp,
    signedAt: timestamp
  };

  if (existingIndex >= 0) {
    return signatories.map((signatory, index) => index === existingIndex
      ? { ...signatory, ...completionPatch }
      : signatory);
  }

  return [
    ...signatories,
    {
      name: name || normalizedRecipientEmail || 'Unknown signatory',
      email: normalizedRecipientEmail || null,
      ...completionPatch
    }
  ];
};

const isSignatoryCompletionNotification = ({ eventType, eventId }) => {
  if (eventId === 2) return true;
  return eventType === 'signatory.completed'
    || eventType.includes('signatorycompleted')
    || eventType.includes('signatory completed');
};

export const updateSignatoryEmailDelivery = (value, { email, name, deliveryStatus, eventTime, eventType }) => {
  const normalizedRecipientEmail = normalizeEmail(email);
  if (!normalizedRecipientEmail) return null;

  const signatories = parseJsonArray(value);
  const delivery = deliveryStatus || (eventType === 'request.sent' ? 'sent' : 'unknown');
  const timestamp = eventTime || new Date().toISOString();
  const existingIndex = signatories.findIndex((signatory) => normalizeEmail(signatory?.email) === normalizedRecipientEmail);
  const deliveryPatch = {
    email_delivery_status: delivery,
    email_status_updated_at: timestamp,
    ...(delivery === 'sent' ? { email_sent_at: timestamp } : {}),
    ...(delivery === 'delivered' ? { email_delivered_at: timestamp } : {}),
    ...(['failed', 'bounced', 'bounce'].includes(delivery) ? { email_failed_at: timestamp } : {})
  };

  if (existingIndex >= 0) {
    return signatories.map((signatory, index) => index === existingIndex
      ? { ...signatory, ...deliveryPatch }
      : signatory);
  }

  return [
    ...signatories,
    {
      name: name || normalizedRecipientEmail,
      email: normalizedRecipientEmail,
      status: 'pending',
      ...deliveryPatch
    }
  ];
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
  if (
    eventType === 'request.completed'
    || eventType === 'signing_completed'
    || eventType.includes('requestcompleted')
    || eventType.includes('request completed')
    || eventType.includes('signing completed')
  ) return true;
  return COMPLETED_STATUSES.has(status);
};

export const shouldAcknowledgeUnmappedWebhook = ({ eventType, eventId, status }) => {
  if (isCompletionNotification({ eventType, eventId, status })) return false;
  if (CANCELLED_STATUSES.has(status)) return false;
  if (REJECTED_STATUSES.has(status)) return false;
  return true;
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

export const processEviaWebhook = async (payload = {}, {
  expectedAgreementId = null, expectedTenantId = null, verifiedRequest = false,
  fencedCanaryRunner = runDormantEviaFencedArchive,
  fencedCanaryStage = stageEviaDocumentsForFencedLease,
  fencedCanaryEnv = process.env
} = {}) => {
  const normalized = normalizeEviaWebhookPayload(payload);

  console.info('[EviaDiag] webhook_normalized', {
    requestId: shortId(normalized.requestId),
    eventType: normalized.eventType || null,
    eventId: normalized.eventId,
    status: normalized.status || null,
    recipientPresent: Boolean(normalized.recipientEmail || normalized.recipientName),
    deliveryStatus: normalized.deliveryStatus || null,
    documentCount: normalized.documents.length,
    expectedAgreementId: shortId(expectedAgreementId),
    expectedTenantBound: Boolean(expectedTenantId)
  });

  // Evia's connection test and request.sent payloads can arrive without a
  // RequestId. Once HMAC verification has succeeded, acknowledge non-terminal
  // unmappable payloads without touching agreement data. Terminal events still
  // require a RequestId so Evia can retry a malformed delivery safely.
  if (!normalized.requestId) {
    if (shouldAcknowledgeUnmappedWebhook(normalized)) {
      console.warn('[EviaWebhook] Authenticated webhook received without RequestId; acknowledged without mutation', {
        eventType: normalized.eventType || null,
        eventId: normalized.eventId,
        status: normalized.status || null,
        recipientEmail: normalized.recipientEmail || null
      });
      return {
        statusCode: 200,
        body: {
          received: true,
          matched: false,
          updated: false,
          reason: 'request_id_missing'
        }
      };
    }

    return { statusCode: 400, body: { received: false, error: 'RequestId is required for terminal Evia events.' } };
  }

  const agreement = await runSingleQuery(`
    SELECT TOP 1
      id,
      tenant_id,
      status,
      signature_status,
      signature_completed_at,
      signatories_status,
      signed_document_url,
      signeddocumenturl,
      signature_pdf_url
    FROM dbo.agreements
    WHERE eviasignreference = @requestId
      AND (@expectedAgreementId IS NULL OR id = @expectedAgreementId)
      AND (@expectedTenantId IS NULL OR tenant_id = @expectedTenantId)
  `, {
    requestId: normalized.requestId,
    expectedAgreementId,
    expectedTenantId
  });

  if (!agreement) {
    console.warn('[EviaDiag] webhook_agreement_not_matched', {
      requestId: shortId(normalized.requestId),
      expectedAgreementId: shortId(expectedAgreementId),
      expectedTenantBound: Boolean(expectedTenantId)
    });
    console.warn('[EviaWebhook] No agreement matches request reference', { requestId: normalized.requestId });
    return {
      statusCode: 200,
      body: { received: true, matched: false, requestId: normalized.requestId }
    };
  }

  console.info('[EviaDiag] webhook_agreement_matched', {
    agreementId: shortId(agreement.id),
    requestId: shortId(normalized.requestId),
    canonicalStatus: agreement.status || null,
    canonicalSignatureStatus: agreement.signature_status || null,
    storedSignatories: summarizeStoredSignatories(agreement.signatories_status)
  });

  const alreadyProcessed = await hasProcessedWebhookDelivery({
    tenantId: agreement.tenant_id,
    requestId: normalized.requestId,
    deliveryId: normalized.deliveryId
  });

  if (shouldIgnoreProcessedEviaDelivery({ alreadyProcessed, normalized, agreement })) {
    return {
      statusCode: 200,
      body: {
        received: true,
        matched: true,
        updated: false,
        duplicate: true,
        agreementId: agreement.id,
        status: agreement.status,
        signatureStatus: agreement.signature_status
      }
    };
  }

  const claim = await claimEviaWebhookDelivery({
    tenantId: agreement.tenant_id,
    requestId: normalized.requestId,
    deliveryId: normalized.deliveryId,
    allowProcessedRecovery: alreadyProcessed,
    insertEvent: transaction => recordVerifiedWebhookEvent({
      agreement, normalized, payload, transaction
    })
  });

  if (claim.duplicate) {
    return {
      statusCode: 200,
      body: { received: true, matched: true, updated: false, duplicate: true, agreementId: agreement.id }
    };
  }
  if (claim.inFlight) {
    // Do not acknowledge in-flight work as successfully processed: Evia must
    // retry after a short delay, or after the abandoned claim lease expires.
    return {
      statusCode: 503,
      body: { received: false, matched: true, updated: false, retryable: true,
        code: 'EVIA_DELIVERY_IN_PROGRESS' }
    };
  }
  const webhookEventId = claim.eventId;
  const finalState = mapFinalAgreementState(normalized);
  if (isEviaFencedArchiveCanaryEligible({
    verifiedRequest,
    verifiedAgreementBound: Boolean(expectedAgreementId && expectedTenantId),
    agreement, normalized, finalState,
    hasRetainedSignedDocument: Boolean(getStoredSignedDocumentUrl(agreement)),
    env: fencedCanaryEnv
  })) {
    // This branch can only be selected after the authenticated router has
    // verified the request and a delivery event was claimed in SQL.
    // Never mix this transport with the long-held legacy agreement lock.
    try {
      const archived = await withEviaArchiveCapacity({
        execute: () => fencedCanaryRunner({
          tenantId: agreement.tenant_id,
          agreementId: agreement.id,
          requestId: normalized.requestId,
          verifiedDeliveryEventId: webhookEventId,
          stageDocuments: async attempt => {
            const staged = await fencedCanaryStage({
              ...attempt, documents: normalized.documents
            });
            // Do not enable staged publishing unless the audit trail is
            // retained alongside the signed document for this attempt.
            if (!staged?.signedDocumentUrl || !staged?.auditTrailUrl) {
              const error = new Error('Both signed agreement and audit trail are required.');
              error.code = 'EVIA_FENCED_ARCHIVE_DOCUMENT_PAIR_REQUIRED';
              error.status = 503;
              throw error;
            }
            return staged;
          }
        })
      });
      if (archived?.status === 'published' || archived?.status === 'complete') {
        return { statusCode: 200, body: {
          received: true, matched: true, updated: archived.status === 'published',
          agreementId: agreement.id, status: 'signed', signatureStatus: 'completed',
          archiveTransport: 'fenced_canary'
        }};
      }
      if (archived?.status !== 'busy') {
        throw Object.assign(new Error('Fenced archival not confirmed.'), {
          code: 'EVIA_FENCED_ARCHIVE_UNCONFIRMED', status: 503
        });
      }
    } catch (error) {
      console.warn('[EviaArchive] canary_retry_required', {
        code: error?.code || 'EVIA_FENCED_ARCHIVE_FAILED',
        agreementId: shortId(agreement.id)
      });
    }
    // This event was not completed. Evia must retry it; make this delivery
    // claim immediately reclaimable rather than requiring a 15-minute wait.
    if (webhookEventId) {
      await runQuery(`
        UPDATE dbo.webhook_events
        SET updatedat = DATEADD(MINUTE, -16, SYSUTCDATETIME())
        WHERE id = @eventId AND tenant_id = @tenantId AND processed = 0
      `, { eventId: webhookEventId, tenantId: agreement.tenant_id });
    }
    return { statusCode: 503, body: {
      received: false, matched: true, updated: false, retryable: true,
      code: 'EVIA_FENCED_ARCHIVE_RETRY', agreementId: agreement.id
    }};
  }
  const terminalDecision = evaluateEviaTerminalDelivery({
    agreement, nextState: finalState,
    hasRetainedSignedDocument: Boolean(getStoredSignedDocumentUrl(agreement))
  });
  if (terminalDecision.action === 'ignore') {
    // Record the authenticated delivery as processed for audit/replay tracking
    // without mutating a completed, rejected or cancelled agreement.
    await markWebhookEventProcessed(webhookEventId);
    return { statusCode: 200, body: {
      received: true, matched: true, updated: false,
      agreementId: agreement.id, reason: terminalDecision.reason
    }};
  }
  const terminalAtRead = isEviaTerminalAgreement(agreement);

  const emailStatuses = !terminalAtRead && updateSignatoryEmailDelivery(agreement.signatories_status, {
    email: normalized.recipientEmail,
    name: normalized.recipientName,
    deliveryStatus: normalized.deliveryStatus,
    eventTime: normalized.eventTime,
    eventType: normalized.eventType
  });

  if (emailStatuses) {
    const savedEmailStatus = await runQuery(`
      UPDATE dbo.agreements
      SET signatories_status = @signatoriesStatus,
          updatedat = SYSUTCDATETIME()
      OUTPUT INSERTED.id
      WHERE id = @agreementId
        AND eviasignreference = @requestId
        AND LOWER(COALESCE(status, '')) NOT IN ('signed', 'cancelled', 'rejected', 'completed', 'terminated', 'expired')
        AND LOWER(COALESCE(signature_status, '')) NOT IN ('completed', 'failed')
    `, {
      agreementId: agreement.id,
      requestId: normalized.requestId,
      signatoriesStatus: JSON.stringify(emailStatuses)
    });
    if (savedEmailStatus.length) agreement.signatories_status = JSON.stringify(emailStatuses);
  }

  if (!finalState && isSignatoryCompletionNotification(normalized) && !terminalAtRead) {
    const completedSignatories = updateSignatoryCompletion(agreement.signatories_status, {
      email: normalized.recipientEmail,
      name: normalized.recipientName,
      eventTime: normalized.eventTime
    });

    if (completedSignatories) {
      const savedSignatory = await runQuery(`
        UPDATE dbo.agreements
        SET
          signature_status = @signatureStatus,
          signatories_status = @signatoriesStatus,
          updatedat = SYSUTCDATETIME()
        OUTPUT INSERTED.id
        WHERE id = @agreementId
          AND eviasignreference = @requestId
          AND LOWER(COALESCE(status, '')) NOT IN ('signed', 'cancelled', 'rejected', 'completed', 'terminated', 'expired')
          AND LOWER(COALESCE(signature_status, '')) NOT IN ('completed', 'failed')
      `, {
        agreementId: agreement.id,
        requestId: normalized.requestId,
        signatureStatus: 'in_progress',
        signatoriesStatus: JSON.stringify(completedSignatories)
      });

      if (!savedSignatory.length) {
        await markWebhookEventProcessed(webhookEventId);
        return { statusCode: 200, body: {
          received: true, matched: true, updated: false,
          agreementId: agreement.id, reason: 'evia_terminal_state_immutable'
        }};
      }
      console.info('[EviaDiag] webhook_partial_update_ok', {
        agreementId: shortId(agreement.id),
        requestId: shortId(normalized.requestId),
        signatureStatus: 'in_progress',
        storedSignatories: summarizeStoredSignatories(JSON.stringify(completedSignatories))
      });
      await markWebhookEventProcessed(webhookEventId);
      return {
        statusCode: 200,
        body: {
          received: true,
          matched: true,
          updated: true,
          agreementId: agreement.id,
          signatureStatus: 'in_progress'
        }
      };
    }
  }

  if (!finalState) {
    console.log('[EviaWebhook] Non-terminal Evia event processed', {
      requestId: normalized.requestId,
      eventType: normalized.eventType || null,
      eventId: normalized.eventId,
      status: normalized.status || null,
      recipientEmail: normalized.recipientEmail || null,
      emailDeliveryStatus: normalized.deliveryStatus || (normalized.eventType === 'request.sent' ? 'sent' : null)
    });
    await markWebhookEventProcessed(webhookEventId);
    return {
      statusCode: 200,
      body: {
        received: true,
        matched: true,
        updated: Boolean(emailStatuses && agreement.signatories_status === JSON.stringify(emailStatuses)),
        agreementId: agreement.id
      }
    };
  }

  // Only completed deliveries with no retained local PDF need cross-delivery
  // archival serialization. Keep the transaction-owned SQL application lock
  // until the final state/URL update has completed.
  const completeTerminal = async (liveArchiveAgreement = null) => {
  const completedAt = normalized.eventTime ? new Date(normalized.eventTime) : new Date();
  const safeCompletedAt = Number.isNaN(completedAt.getTime()) ? new Date() : completedAt;
  let signedDocumentUrl = getStoredSignedDocumentUrl(liveArchiveAgreement || agreement);
  let auditTrailStored = false;
  const duplicateDelivery = claim.alreadyProcessed;

  if (finalState.signatureStatus === 'completed') {

    if (!signedDocumentUrl && normalized.documents.length > 0) {
      const retainedDocuments = await storeEviaWebhookCompletedDocuments({
        documents: normalized.documents,
        tenantId: agreement.tenant_id,
        agreementId: agreement.id
      });

      signedDocumentUrl = retainedDocuments.signedDocumentUrl;
      auditTrailStored = Boolean(retainedDocuments.auditTrailUrl);

      console.info('[EviaDiag] completed_documents_retained_from_webhook', {
        agreementId: shortId(agreement.id),
        requestId: shortId(normalized.requestId),
        deliveryIdPresent: Boolean(normalized.deliveryId),
        duplicateDelivery,
        signedDocumentStored: Boolean(signedDocumentUrl),
        auditTrailStored,
        documentCount: retainedDocuments.storedDocuments.length
      });
    }

    if (!signedDocumentUrl) {
      try {
        const retainedDocuments = await retrieveAndStoreEviaCompletedDocuments({
          requestId: normalized.requestId,
          tenantId: agreement.tenant_id,
          agreementId: agreement.id
        });

        signedDocumentUrl = retainedDocuments.signedDocumentUrl;
        auditTrailStored = Boolean(retainedDocuments.auditTrailUrl);

        console.info('[EviaDiag] completed_documents_retained_by_retrieval', {
          agreementId: shortId(agreement.id),
          requestId: shortId(normalized.requestId),
          deliveryIdPresent: Boolean(normalized.deliveryId),
          duplicateDelivery,
          signedDocumentStored: Boolean(signedDocumentUrl),
          auditTrailStored
        });
      } catch (error) {
        console.warn('[EviaDiag] completed_document_retrieval_deferred', {
          agreementId: shortId(agreement.id),
          requestId: shortId(normalized.requestId),
          code: error?.code || null,
          status: Number(error?.status) || null
        });
      }
    }
  }

  if (!signedDocumentUrl) {
    signedDocumentUrl = extractSignedDocumentUrl(payload);
  }

  const completedSignatories = finalState.signatureStatus === 'completed'
    ? markAllSignatoriesCompleted(agreement.signatories_status, safeCompletedAt.toISOString())
    : null;

  const terminalUpdated = await runQuery(`
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
    OUTPUT INSERTED.id
    WHERE id = @agreementId
      AND eviasignreference = @requestId
      AND (
        (
          @signatureStatus = 'completed'
          AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected', 'completed', 'terminated', 'expired')
          AND LOWER(COALESCE(signature_status, '')) <> 'failed'
        )
        OR
        (
          @signatureStatus = 'failed'
          AND LOWER(COALESCE(status, '')) NOT IN ('signed', 'cancelled', 'rejected', 'completed', 'terminated', 'expired')
          AND LOWER(COALESCE(signature_status, '')) NOT IN ('completed', 'failed')
        )
      )
  `, {
    agreementId: agreement.id,
    requestId: normalized.requestId,
    agreementStatus: finalState.agreementStatus,
    signatureStatus: finalState.signatureStatus,
    completedAt: safeCompletedAt.toISOString(),
    completedSignatories: completedSignatories ? JSON.stringify(completedSignatories) : null,
    signedDocumentUrl
  });

  if (!terminalUpdated.length) {
    await markWebhookEventProcessed(webhookEventId);
    return { statusCode: 200, body: {
      received: true, matched: true, updated: false,
      agreementId: agreement.id, reason: 'evia_terminal_state_immutable'
    }};
  }

  console.info('[EviaDiag] webhook_terminal_update_ok', {
    agreementId: shortId(agreement.id),
    requestId: shortId(normalized.requestId),
    agreementStatus: finalState.agreementStatus,
    signatureStatus: finalState.signatureStatus,
    signedDocumentUrlReceived: Boolean(signedDocumentUrl),
    signedDocumentStoredLocally: Boolean(getStoredSignedDocumentUrl({ signed_document_url: signedDocumentUrl })),
    auditTrailStored,
    duplicateDelivery,
    completedSignatoryCount: completedSignatories?.length || 0
  });

  await markWebhookEventProcessed(webhookEventId);

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

  if (finalState.signatureStatus === 'completed' && !getStoredSignedDocumentUrl(agreement)) {
    try {
      return await withEviaArchiveCapacity({ execute: () => withEviaAgreementArchiveLock({
        tenantId: agreement.tenant_id,
        agreementId: agreement.id,
        requestId: normalized.requestId,
        execute: async (latest) => {
          // Recheck while holding the agreement lock. Another delivery may
          // already have finished and retained the signed PDF.
          const currentState = evaluateEviaTerminalDelivery({
            agreement: latest,
            nextState: finalState,
            hasRetainedSignedDocument: Boolean(getStoredSignedDocumentUrl(latest))
          });
          if (currentState.action === 'ignore'
              || (String(latest.status || '').toLowerCase() === 'signed'
                  && String(latest.signature_status || '').toLowerCase() === 'completed'
                  && getStoredSignedDocumentUrl(latest))) {
            await markWebhookEventProcessed(webhookEventId);
            return { statusCode: 200, body: {
              received: true, matched: true, updated: false,
              agreementId: agreement.id, reason: 'evia_archive_already_resolved'
            }};
          }
          return completeTerminal(latest);
        }
      }) });
    } catch (error) {
      if (['EVIA_ARCHIVE_IN_PROGRESS', 'EVIA_ARCHIVE_CAPACITY_EXCEEDED'].includes(error?.code)) {
        // Leave the delivery retryable without forcing the next attempt to
        // wait for the 15-minute abandoned-delivery claim lease.
        if (webhookEventId) {
          await runQuery(`
            UPDATE dbo.webhook_events
            SET updatedat = DATEADD(MINUTE, -16, SYSUTCDATETIME())
            WHERE id = @eventId AND tenant_id = @tenantId AND processed = 0
          `, { eventId: webhookEventId, tenantId: agreement.tenant_id });
        }
        return { statusCode: 503, body: {
          received: false, matched: true, updated: false, retryable: true,
          code: error.code
        }};
      }
      throw error;
    }
  }

  return completeTerminal();
};

const handleWebhook = async (req, res, next) => {
  try {
    const verification = verifyEviaWebhookRequest(req);
    if (!verification.ok) {
      console.warn('[EviaDiag] webhook_verification_failed', {
        statusCode: verification.statusCode,
        hasSignatureHeader: Boolean(getEviaWebhookSignature(req.headers)),
        hasCallbackToken: Boolean(req.query?.callback_token || req.query?.callbackToken)
      });
      res.status(verification.statusCode).json({ received: false, error: verification.error });
      return;
    }

    console.info('[EviaDiag] webhook_verification_ok', {
      mode: verification.mode || 'unknown',
      agreementId: shortId(verification.agreementId),
      tenantBound: Boolean(verification.tenantId)
    });

    const result = await processEviaWebhook(req.body || {}, {
      expectedAgreementId: verification.agreementId || null,
      expectedTenantId: verification.tenantId || null,
      verifiedRequest: true
    });
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