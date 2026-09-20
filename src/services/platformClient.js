import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';
import { platformClient as corePlatformClient } from './platformClientCore';

const readApiError = async (response) => {
  const payload = await response.json().catch(() => null);
  const error = new Error(payload?.error || payload?.message || `Request failed with status ${response.status}`);
  if (payload?.code) {
    error.code = payload.code;
  }
  if (payload?.details) {
    error.details = payload.details;
  }
  error.status = response.status;
  return error;
};

const scopedRequest = async (basePath, path = '', options = {}) => {
  const response = await fetch(`${getApiBaseUrl()}${basePath}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...buildRequestContextHeaders(options.headers || {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return response.json();
};

const propertyAssignmentRequest = (path = '', options = {}) => (
  scopedRequest('/api/property-assignments', path, options)
);

const tenancyRequest = (path = '', options = {}) => (
  scopedRequest('/api/tenancies', path, options)
);

const billingRequest = (path = '', options = {}) => (
  scopedRequest('/api/billing', path, options)
);

export const listPropertyAssignments = async ({ staffUserId, propertyId, status } = {}) => {
  try {
    const params = new URLSearchParams();
    if (staffUserId) params.set('staffUserId', staffUserId);
    if (propertyId) params.set('propertyId', propertyId);
    if (status) params.set('status', status);
    const query = params.toString();
    const payload = await propertyAssignmentRequest(query ? `?${query}` : '');
    return { data: payload?.data || [], error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const assignPropertyToStaff = async ({ staffUserId, propertyId, notes = null }) => {
  try {
    const payload = await propertyAssignmentRequest('', {
      method: 'POST',
      body: { staffUserId, propertyId, notes }
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const updatePropertyAssignment = async (assignmentId, updates = {}) => {
  try {
    const payload = await propertyAssignmentRequest(`/${encodeURIComponent(assignmentId)}`, {
      method: 'PATCH',
      body: updates
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const deletePropertyAssignment = async (assignmentId) => {
  try {
    const payload = await propertyAssignmentRequest(`/${encodeURIComponent(assignmentId)}`, {
      method: 'DELETE'
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const getTenancyOnboarding = async (agreementId) => {
  try {
    const payload = await tenancyRequest(`/${encodeURIComponent(agreementId)}/onboarding`);
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const recordManualAgreementSignature = async (agreementId) => {
  try {
    const payload = await tenancyRequest(`/${encodeURIComponent(agreementId)}/manual-signature`, {
      method: 'POST',
      body: {}
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const recordTenancyDeposit = async (agreementId, transaction) => {
  try {
    const payload = await tenancyRequest(`/${encodeURIComponent(agreementId)}/deposits`, {
      method: 'POST',
      body: transaction
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const initializeMoveInChecklist = async (agreementId) => {
  try {
    const payload = await tenancyRequest(`/${encodeURIComponent(agreementId)}/checklist`, {
      method: 'POST',
      body: {}
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const updateMoveInChecklistItem = async (agreementId, itemId, updates) => {
  try {
    const payload = await tenancyRequest(
      `/${encodeURIComponent(agreementId)}/checklist/items/${encodeURIComponent(itemId)}`,
      { method: 'PATCH', body: updates }
    );
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const activateTenancy = async (agreementId) => {
  try {
    const payload = await tenancyRequest(`/${encodeURIComponent(agreementId)}/activate`, {
      method: 'POST',
      body: {}
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const getMyTenancySummary = async () => {
  try {
    const payload = await tenancyRequest('/me/summary');
    return { data: payload?.data || { tenancies: [] }, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const getInvoiceAccount = async (invoiceId) => {
  try {
    const payload = await billingRequest(`/invoices/${encodeURIComponent(invoiceId)}/account`);
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const submitInvoicePaymentProof = async (invoiceId, payment = {}) => {
  try {
    const payload = await billingRequest(`/invoices/${encodeURIComponent(invoiceId)}/payment-proof`, {
      method: 'POST',
      body: payment
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const verifyInvoicePayment = async (invoiceId, verification = {}) => {
  try {
    const payload = await billingRequest(`/invoices/${encodeURIComponent(invoiceId)}/verify-payment`, {
      method: 'POST',
      body: verification
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const recordManualInvoicePayment = async (invoiceId, payment = {}) => {
  try {
    const payload = await billingRequest(`/invoices/${encodeURIComponent(invoiceId)}/manual-payment`, {
      method: 'POST',
      body: payment
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const recordInvoiceReminder = async (invoiceId) => {
  try {
    const payload = await billingRequest(`/invoices/${encodeURIComponent(invoiceId)}/reminder`, {
      method: 'POST',
      body: {}
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const getMonthlyBillingContext = async ({ propertyId, billingPeriod } = {}) => {
  try {
    const params = new URLSearchParams();
    if (propertyId) params.set('propertyId', propertyId);
    if (billingPeriod) params.set('billingPeriod', billingPeriod);
    const payload = await billingRequest(`/monthly-billing-context?${params.toString()}`);
    return { data: payload?.data || { tenancies: [], adjustments: [], schemaAvailable: false }, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const createBillingAdjustment = async (agreementId, adjustment = {}) => {
  try {
    const payload = await billingRequest(`/agreements/${encodeURIComponent(agreementId)}/billing-adjustments`, {
      method: 'POST',
      body: adjustment
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const voidBillingAdjustment = async (adjustmentId, reason) => {
  try {
    const payload = await billingRequest(`/billing-adjustments/${encodeURIComponent(adjustmentId)}/void`, {
      method: 'POST',
      body: { reason }
    });
    return { data: payload?.data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const generateTenancyMonthlyInvoices = async (options = {}) => {
  try {
    const payload = await billingRequest('/monthly-invoices', {
      method: 'POST',
      body: options
    });
    return { data: payload?.data || { created: [], skipped: [], errors: [] }, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export {
  platformClient,
  platform,
  getPlatformClient,
  getActiveTenantId,
  setActiveTenantId,
  clearActiveTenantId,
  getCurrentUser,
  signIn,
  signUp,
  signOut,
  resetPassword,
  updatePassword,
  fetchData,
  selectData,
  insertData,
  upsertData,
  updateData,
  deleteData,
  uploadFile,
  getFileUrl,
  getPublicUrl,
  deleteFile,
  createStorageBucket,
  listBuckets,
  getBucket,
  updateBucket,
  checkUserExists,
  query,
  execute,
  inviteUser,
  inviteTeamMember,
  toDatabaseFormat,
  storage,
  auth,
  rpc
} from './platformClientCore';

export default corePlatformClient;
