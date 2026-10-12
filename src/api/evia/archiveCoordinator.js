import {
  acquireEviaArchiveLease, renewEviaArchiveLease, finalizeEviaArchiveLease,
  acknowledgePublishedEviaArchiveDelivery, EVIA_ARCHIVE_LEASE_MS
} from './archiveLease.js';
import {
  storeEviaWebhookCompletedDocuments, retrieveAndStoreEviaCompletedDocuments
} from './completedDocuments.js';

// DORMANT: no webhook handler or route imports this module. Its inputs must
// originate from a verified, tenant-scoped Evia callback when activated.
export const EVIA_ARCHIVE_HEARTBEAT_MS = 5 * 60 * 1000;

const archiveError = (code, message, status = 503) =>
  Object.assign(new Error(message), { code, status });

export const stageEviaDocumentsForFencedLease = async ({
  tenantId, agreementId, requestId, archiveAttemptId, documents = [],
  inlineStore = storeEviaWebhookCompletedDocuments,
  retrieve = retrieveAndStoreEviaCompletedDocuments,
  retrievalOptions = {}
}) => {
  // Missing attempt ownership must never silently fall back to the live,
  // stable signed-document object path.
  if (typeof archiveAttemptId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(archiveAttemptId)) {
    throw archiveError('EVIA_ARCHIVE_ATTEMPT_ID_REQUIRED',
      'Fenced archive staging requires a valid owner attempt token.', 400);
  }
  const options = { tenantId, agreementId, archiveAttemptId };
  if (Array.isArray(documents) && documents.length > 0) {
    const result = await inlineStore({ ...options, documents });
    if (result?.signedDocumentUrl) return result;
  }
  // Preserve the existing inline-first, authenticated API-retrieval fallback.
  return retrieve({ ...retrievalOptions, ...options, requestId });
};

// Short SQL lease transactions never span stageDocuments. Heartbeats renew
// only while external staging is active; on renewal loss, do not finalize.
// An in-flight storage upload may be unabortable, but an immutable attempt
// prefix prevents it overwriting a newer winner's bytes.
export const runDormantEviaFencedArchive = async ({
  tenantId, agreementId, requestId, stageDocuments,
  verifiedDeliveryEventId = null,
  acknowledge = acknowledgePublishedEviaArchiveDelivery,
  acquire = acquireEviaArchiveLease,
  renew = renewEviaArchiveLease,
  finalize = finalizeEviaArchiveLease,
  heartbeatMs = EVIA_ARCHIVE_HEARTBEAT_MS,
  logger = console
}) => {
  if (typeof stageDocuments !== 'function'
    || typeof acquire !== 'function' || typeof renew !== 'function'
    || typeof finalize !== 'function' || typeof acknowledge !== 'function') {
    throw new TypeError('Fenced Evia archive requires staging and lease operations.');
  }
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 1
      || heartbeatMs >= EVIA_ARCHIVE_LEASE_MS) {
    throw new RangeError('Archive heartbeat must be shorter than the lease.');
  }
  const identity = { tenantId, agreementId, requestId };
  const claim = await acquire(identity);
  if (claim?.status === 'complete') {
    if (verifiedDeliveryEventId !== null) {
      const audit = await acknowledge({ ...identity, verifiedDeliveryEventId });
      return { status: 'complete', signedDocumentUrl: audit.signedDocumentUrl,
        deliveryStatus: audit.status };
    }
    return { status: 'complete', signedDocumentUrl: claim.url };
  }
  if (claim?.status === 'busy') return { status: 'busy', retryable: true };
  if (claim?.status !== 'acquired' || typeof claim.attemptId !== 'string') {
    throw archiveError('EVIA_ARCHIVE_LEASE_CLAIM_INVALID', 'Archive lease returned no owner token.');
  }

  const attemptId = claim.attemptId;
  const owner = { ...identity, attemptId };
  const abortController = new AbortController();
  let staging = true;
  let heartbeatFailure = null;
  let timer = null;
  let pendingHeartbeat = Promise.resolve();

  const schedule = () => {
    if (!staging || heartbeatFailure) return;
    timer = setTimeout(() => {
      pendingHeartbeat = Promise.resolve()
        .then(() => renew(owner))
        .catch(error => {
          heartbeatFailure = error;
          abortController.abort(error);
          logger.warn?.('[EviaArchive] lease_renewal_lost', {
            code: error?.code || 'EVIA_ARCHIVE_LEASE_RENEW_FAILED'
          });
        })
        .then(() => schedule());
    }, heartbeatMs);
  };
  schedule();

  try {
    const staged = await stageDocuments({
      ...owner, archiveAttemptId: attemptId, signal: abortController.signal
    });
    // Never publish a URL after background renewal failed, even if upload
    // continued after cancellation was requested.
    if (heartbeatFailure) throw heartbeatFailure;
    if (!staged?.signedDocumentUrl) {
      throw archiveError('EVIA_ARCHIVE_SIGNED_PDF_REQUIRED',
        'Evia staging returned no locally retained signed agreement.', 502);
    }

    // Stop heartbeat before finalization and drain any in-flight renewal so
    // the final SQL transaction is not racing a background lease mutation.
    staging = false;
    if (timer) clearTimeout(timer);
    await pendingHeartbeat;
    if (heartbeatFailure) throw heartbeatFailure;

    // Mandatory post-storage fencing check covers long uploads, worker
    // pauses, late takeover and any expiry not caught by heartbeat.
    await renew(owner);
    const published = await finalize({
      ...owner,
      signedDocumentUrl: staged.signedDocumentUrl,
      auditTrailUrl: staged.auditTrailUrl || null,
      ...(verifiedDeliveryEventId !== null ? { verifiedDeliveryEventId } : {})
    });
    if (published?.status !== 'published') {
      throw archiveError('EVIA_ARCHIVE_PUBLICATION_NOT_CONFIRMED',
        'Archive lease did not confirm fenced publication.');
    }
    return published;
  } finally {
    staging = false;
    if (timer) clearTimeout(timer);
    await pendingHeartbeat;
  }
};
