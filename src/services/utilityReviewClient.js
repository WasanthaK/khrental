import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

/**
 * The server is the only authority for changing a pending reading to approved
 * or rejected. This client never calculates a bill or changes an invoice.
 */
export const transitionUtilityReading = async (readingId, transition, { reason } = {}) => {
  if (!readingId || !['approve', 'reject'].includes(transition)) {
    throw new Error('A reading and supported review action are required.');
  }
  if (transition === 'reject' && (!String(reason || '').trim() || String(reason).trim().length > 1000)) {
    throw new Error('Please provide a rejection reason (up to 1000 characters).');
  }
  const response = await fetch(
    `${getApiBaseUrl()}/api/utility-reviews/readings/${encodeURIComponent(readingId)}/${transition}`,
    {
      method: 'POST',
      headers: buildRequestContextHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(transition === 'reject' ? { reason: String(reason).trim() } : {})
    }
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.error || !result?.data?.id) {
    const message = typeof result?.error === 'string'
      ? result.error
      : result?.error?.message || 'Utility review failed. The reading was not confirmed updated.';
    const error = new Error(message);
    error.status = response.status;
    error.code = result?.code || null;
    throw error;
  }
  return result.data;
};

/** Compare-and-swap pending meter correction. No billing/status fields are accepted. */
export const editPendingUtilityReading = async (readingId, {
  previousReading, currentReading, expectedPreviousReading, expectedCurrentReading
}) => {
  if (!readingId) throw new Error('Reading ID is required.');
  const response = await fetch(
    `${getApiBaseUrl()}/api/utility-reviews/readings/${encodeURIComponent(readingId)}/value`,
    {
      method: 'PUT',
      headers: buildRequestContextHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        previousReading, currentReading, expectedPreviousReading, expectedCurrentReading
      })
    }
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.error || !result?.data?.id) {
    const error = new Error(typeof result?.error === 'string'
      ? result.error : result?.error?.message || 'Meter correction was not saved.');
    error.code = result?.code || null;
    error.status = response.status;
    throw error;
  }
  return result.data;
};
