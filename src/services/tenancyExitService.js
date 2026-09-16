import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

const request = async (path = '', options = {}) => {
  const response = await fetch(`${getApiBaseUrl()}/api/tenancy-exit${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...buildRequestContextHeaders(options.headers || {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || `Request failed with status ${response.status}`);
    error.code = payload?.code || null;
    error.details = payload?.details || null;
    error.status = response.status;
    throw error;
  }
  return payload?.data ?? null;
};

const safe = async (operation) => {
  try {
    return { data: await operation(), error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const getTenancyExit = (agreementId) => safe(() => request(`/agreements/${encodeURIComponent(agreementId)}`));

export const createTenancyNotice = (agreementId, notice) => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/notices`,
  { method: 'POST', body: notice }
));

export const respondToTenancyNotice = (noticeId, response) => safe(() => request(
  `/notices/${encodeURIComponent(noticeId)}/respond`,
  { method: 'POST', body: response }
));

export const createRenewalDraft = (agreementId, renewal) => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/renewal-draft`,
  { method: 'POST', body: renewal }
));

export const initializeMoveOutInspection = (agreementId, input = {}) => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/move-out-inspection`,
  { method: 'POST', body: input }
));

export const updateMoveOutInspectionItem = (agreementId, itemId, input) => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/move-out-inspection/items/${encodeURIComponent(itemId)}`,
  { method: 'PATCH', body: input }
));

export const completeMoveOutInspection = (agreementId) => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/move-out-inspection/complete`,
  { method: 'POST', body: {} }
));

export const addTenancySettlementItem = (agreementId, input) => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/settlement/items`,
  { method: 'POST', body: input }
));

export const reviewTenancySettlementItem = (agreementId, itemId, status) => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/settlement/items/${encodeURIComponent(itemId)}`,
  { method: 'PATCH', body: { status } }
));

export const approveTenancySettlement = (agreementId, notes = '') => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/settlement/approve`,
  { method: 'POST', body: { notes } }
));

export const settleTenancy = (agreementId, reference = '') => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/settlement/settle`,
  { method: 'POST', body: { reference } }
));

export const closeTenancy = (agreementId, input = {}) => safe(() => request(
  `/agreements/${encodeURIComponent(agreementId)}/close`,
  { method: 'POST', body: input }
));
