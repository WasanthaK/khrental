export const EMAIL_PROVIDER = 'twilio-sendgrid';

const safeString = (value, maxLength = 160) => {
  if (value === undefined || value === null || value === '') return null;
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, maxLength);
};

const createDeliveryError = (message, {
  status = 502,
  code = 'EMAIL_PROVIDER_REQUEST_FAILED',
  provider = EMAIL_PROVIDER,
  providerStatus = null,
  providerMessageId = null
} = {}) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.provider = provider;
  error.providerStatus = providerStatus;
  error.providerMessageId = providerMessageId;
  return error;
};

export const normalizeEmailAttachments = (attachments = []) => {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .filter((attachment) => attachment && attachment.filename && attachment.content)
    .map((attachment) => ({
      content: String(attachment.content),
      filename: String(attachment.filename),
      ...(attachment.type ? { type: String(attachment.type) } : {}),
      ...(attachment.disposition ? { disposition: String(attachment.disposition) } : {}),
      ...(attachment.content_id ? { content_id: String(attachment.content_id) } : {}),
      ...(attachment.contentId ? { content_id: String(attachment.contentId) } : {})
    }));
};

/**
 * Build an allow-listed operational log record for email delivery.
 * Unknown fields are deliberately ignored so message bodies, recipients,
 * subjects, invitation/reset tokens and credentials cannot leak into logs.
 */
export const buildEmailDeliveryLog = (event, details = {}) => ({
  timestamp: new Date().toISOString(),
  component: 'send-email',
  event: safeString(event, 80),
  requestId: safeString(details.requestId, 128),
  provider: safeString(details.provider || EMAIL_PROVIDER, 80),
  providerStatus: Number.isFinite(Number(details.providerStatus)) ? Number(details.providerStatus) : null,
  providerMessageId: safeString(details.providerMessageId, 200),
  durationMs: Number.isFinite(Number(details.durationMs)) ? Number(details.durationMs) : null,
  errorCode: safeString(details.errorCode, 100),
  attachmentCount: Number.isFinite(Number(details.attachmentCount)) ? Number(details.attachmentCount) : 0,
  hasHtml: Boolean(details.hasHtml),
  hasText: Boolean(details.hasText)
});

export const writeEmailDeliveryLog = (level, event, details = {}) => {
  const record = buildEmailDeliveryLog(event, details);
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  console[method](JSON.stringify(record));
  return record;
};

export const sendViaSendGrid = async ({
  apiKey,
  sender,
  to,
  subject,
  html,
  text,
  attachments = [],
  fetchImpl = globalThis.fetch
}) => {
  if (!apiKey) {
    throw createDeliveryError(
      'Email delivery is not configured on the server.',
      { status: 503, code: 'EMAIL_NOT_CONFIGURED' }
    );
  }

  if (typeof fetchImpl !== 'function') {
    throw createDeliveryError('Email provider transport is unavailable.');
  }

  const normalizedAttachments = normalizeEmailAttachments(attachments);
  let response;

  try {
    response = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: sender,
        subject,
        content: [
          ...(text ? [{ type: 'text/plain', value: text }] : []),
          ...(html ? [{ type: 'text/html', value: html }] : [])
        ],
        ...(normalizedAttachments.length > 0 ? { attachments: normalizedAttachments } : {})
      })
    });
  } catch (_error) {
    throw createDeliveryError('Email provider request failed before a response was received.');
  }

  const providerMessageId = response.headers?.get?.('x-message-id') || null;

  if (!response.ok) {
    throw createDeliveryError(
      `Email provider rejected the request with status ${response.status}.`,
      {
        code: 'EMAIL_PROVIDER_REJECTED',
        providerStatus: response.status,
        providerMessageId
      }
    );
  }

  return {
    success: true,
    simulated: false,
    provider: EMAIL_PROVIDER,
    providerStatus: response.status,
    providerMessageId,
    message: 'Email accepted by SendGrid for delivery.'
  };
};
