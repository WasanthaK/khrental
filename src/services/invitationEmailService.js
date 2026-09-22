import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

const parseResponsePayload = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  return {};
};

const createTextFallback = (html) => String(html || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const sendInvitationEmail = async ({ to, subject, html, text }) => {
  const requestId = `invite_email_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  if (!to || !subject || (!html && !text)) {
    return {
      success: false,
      requestId,
      message: 'Invitation email is missing required delivery fields.'
    };
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/send-email`, {
      method: 'POST',
      headers: buildRequestContextHeaders({
        'Content-Type': 'application/json',
        'x-request-id': requestId
      }),
      body: JSON.stringify({
        to,
        subject,
        text: text || createTextFallback(html),
        ...(html ? { html } : {})
      })
    });

    const result = await parseResponsePayload(response);

    if (!response.ok) {
      return {
        success: false,
        requestId: result.requestId || requestId,
        statusCode: response.status,
        message: result.error || result.message || 'Invitation email delivery failed.'
      };
    }

    return {
      success: true,
      requestId: result.requestId || requestId,
      provider: result.provider || null,
      providerStatus: result.providerStatus || response.status,
      providerMessageId: result.providerMessageId || null,
      message: result.message || 'Invitation email accepted for delivery.'
    };
  } catch (error) {
    return {
      success: false,
      requestId,
      message: error.message || 'Invitation email delivery failed before a response was received.'
    };
  }
};
