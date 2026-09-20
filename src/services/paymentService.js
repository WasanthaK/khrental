import { platform as platformClient } from './platformClient';
import {
  generateTenancyMonthlyInvoices,
  recordManualInvoicePayment,
  submitInvoicePaymentProof,
  verifyInvoicePayment
} from './platformClient';
import { INVOICE_STATUS } from '../utils/constants';
import { createInvoiceRecord, listInvoices, updateInvoiceRecord } from './invoiceService';

/**
 * Generate a new invoice using the legacy single-invoice form.
 * Monthly active-tenancy billing uses generateMonthlyInvoices below.
 */
export const generateInvoice = async (invoiceData) => {
  try {
    const now = new Date();
    const duedate = new Date(now);
    duedate.setDate(duedate.getDate() + 30);
    const { renteeEmail, ...cleanedData } = invoiceData;

    let totalamount = cleanedData.totalamount;
    if (!totalamount || isNaN(parseFloat(totalamount)) || totalamount <= 0) {
      totalamount = 0;
      if (cleanedData.components && typeof cleanedData.components === 'object') {
        totalamount = Object.values(cleanedData.components).reduce(
          (sum, value) => sum + (parseFloat(value) || 0),
          0
        );
      }
      if (totalamount <= 0) totalamount = 1;
    }

    const invoice = {
      ...cleanedData,
      totalamount,
      createdat: now.toISOString(),
      updatedat: now.toISOString(),
      duedate: cleanedData.duedate || duedate.toISOString(),
      status: cleanedData.status || INVOICE_STATUS.PENDING
    };

    const data = await createInvoiceRecord(invoice);
    if (renteeEmail) {
      await sendInvoiceNotification(data.id, renteeEmail);
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error generating invoice:', error.message);
    return { success: false, error: error.message };
  }
};

export const updateInvoice = async (id, invoiceData) => {
  try {
    const data = await updateInvoiceRecord(id, {
      ...invoiceData,
      updatedat: new Date().toISOString()
    });
    return { success: true, data };
  } catch (error) {
    console.error('Error updating invoice:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Upload proof to tenant-scoped storage, then create a pending payment through
 * the dedicated server lifecycle API. Uploading proof is not payment approval.
 */
export const uploadPaymentProof = async (invoiceId, file, paymentDetails = {}) => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${invoiceId}_${Date.now()}.${fileExt}`;
    const filePath = `payment_proofs/${fileName}`;

    const { data: uploadData, error: uploadError } = await platformClient.storage
      .from('invoices')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const scopedFilePath = uploadData?.scopedPath || uploadData?.path || filePath;
    const { data: urlData } = platformClient.storage
      .from('invoices')
      .getPublicUrl(scopedFilePath);
    const proofUrl = urlData.publicUrl;

    const { data, error } = await submitInvoicePaymentProof(invoiceId, {
      proofUrl,
      ...(paymentDetails.amount !== undefined ? { amount: paymentDetails.amount } : {}),
      paymentMethod: paymentDetails.paymentMethod || null,
      transactionReference: paymentDetails.transactionReference || null,
      paymentDate: paymentDetails.paymentDate || new Date().toISOString(),
      notes: paymentDetails.notes || null
    });

    if (error) throw error;
    return { success: true, data: data?.invoice || null, payment: data?.payment || null, url: proofUrl };
  } catch (error) {
    console.error('Error uploading payment proof:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Finance/admin verification. The server creates/updates the payment ledger,
 * receipt and invoice balance atomically.
 */
export const verifyPaymentProof = async (invoiceId, isApproved, notes = '') => {
  try {
    const { data, error } = await verifyInvoicePayment(invoiceId, {
      approved: Boolean(isApproved),
      notes
    });
    if (error) throw error;
    return {
      success: true,
      data: data?.invoice || null,
      payment: data?.payment || null,
      receipt: data?.receipt || null
    };
  } catch (error) {
    console.error('Error verifying payment:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Record a manually confirmed payment. This no longer bypasses the payment
 * ledger; it creates a verified payment and receipt through the server API.
 */
export const markInvoiceAsPaid = async (invoiceId, paymentDetails = {}) => {
  try {
    const { data, error } = await recordManualInvoicePayment(invoiceId, paymentDetails);
    if (error) throw error;
    return {
      success: true,
      data: data?.invoice || null,
      payment: data?.payment || null,
      receipt: data?.receipt || null
    };
  } catch (error) {
    console.error('Error recording manual payment:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Deliver a payment reminder through the dedicated server billing action.
 * The server records attempted/sent/failed lifecycle events and only advances
 * reminderdate after the email provider accepts the message.
 */
export const sendPaymentReminder = async (invoiceId) => {
  try {
    const response = await fetch(`/api/billing/invoices/${encodeURIComponent(invoiceId)}/send-reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Payment reminder failed with status ${response.status}`);
    }
    return { success: true, data: payload?.data || null };
  } catch (error) {
    console.error('Error sending payment reminder:', error.message);
    return { success: false, error: error.message };
  }
};

export const checkOverdueInvoices = async () => {
  try {
    const today = new Date();
    const { data, error } = await listInvoices({ pageSize: 1000 });
    if (error) throw error;

    const overdueInvoices = (data || []).filter((invoice) => {
      if (invoice.status === INVOICE_STATUS.PAID) return false;
      if (!invoice.duedate) return false;
      const dueDate = new Date(invoice.duedate);
      return !Number.isNaN(dueDate.getTime()) && dueDate < today;
    });

    return { success: true, data: overdueInvoices };
  } catch (error) {
    console.error('Error checking overdue invoices:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Generate one monthly invoice per active agreement, combining contractual rent
 * with approved/pending-invoice utility readings for the selected month.
 */
export const generateMonthlyInvoices = async (options = {}) => {
  try {
    const now = new Date();
    const billingPeriod = options.billingPeriod
      || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dueDate = options.dueDate || (() => {
      const value = new Date();
      value.setDate(value.getDate() + 14);
      return value.toISOString();
    })();

    const { data, error } = await generateTenancyMonthlyInvoices({
      ...options,
      billingPeriod,
      dueDate
    });
    if (error) throw error;

    return {
      success: (data?.errors || []).length === 0 || (data?.created || []).length > 0,
      count: data?.created?.length || 0,
      data,
      errors: data?.errors || []
    };
  } catch (error) {
    console.error('Error generating monthly invoices:', error.message);
    return { success: false, error: error.message, count: 0 };
  }
};

const sendInvoiceNotification = async (invoiceId, email) => {
  // Kept as a compatibility hook for the legacy single-invoice form.
  console.log(`Invoice notification requested for ${email} for invoice ${invoiceId}`);
  return true;
};
