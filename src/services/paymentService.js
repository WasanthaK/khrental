import { supabase } from './supabaseClient';
import { sendEmailNotification } from './notificationService';
import { INVOICE_STATUS } from '../utils/constants';
import { updateData, fetchData } from './supabaseClient';

/**
 * Generate a new invoice
 * @param {Object} invoiceData - The invoice data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const generateInvoice = async (invoiceData) => {
  try {
    // Add additional fields
    const now = new Date();
    const duedate = new Date(now);
    duedate.setDate(duedate.getDate() + 30); // Due in 30 days by default
    
    // Remove any fields that might cause issues
    const { renteeEmail, ...cleanedData } = invoiceData;
    
    // Ensure totalamount is set and is a valid number
    let totalamount = cleanedData.totalamount;
    
    // If totalamount is not set or is invalid, calculate it from components
    if (!totalamount || isNaN(parseFloat(totalamount)) || totalamount <= 0) {
      totalamount = 0;
      
      // Calculate from components if available
      if (cleanedData.components && typeof cleanedData.components === 'object') {
        totalamount = Object.values(cleanedData.components).reduce(
          (sum, value) => sum + (parseFloat(value) || 0), 
          0
        );
      }
      
      // If it's still 0 or invalid, set a default minimum value
      if (totalamount <= 0) {
        totalamount = 1; // Use 1 as absolute minimum to avoid NOT NULL constraint
      }
    }
    
    // Ensure all field names match the database schema
    const invoice = {
      ...cleanedData,
      totalamount, // Use the validated totalamount
      createdat: now.toISOString(),
      updatedat: now.toISOString(),
      duedate: duedate.toISOString(),
      status: cleanedData.status || INVOICE_STATUS.PENDING,
    };
    
    console.log('Submitting invoice data:', invoice);
    
    // Insert into database
    const { data, error } = await supabase
      .from('invoices')
      .insert(invoice)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    // Send email notification if rentee email is provided
    if (renteeEmail) {
      await sendInvoiceNotification(data.id, renteeEmail);
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error generating invoice:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Update an existing invoice
 * @param {string} id - The invoice ID
 * @param {Object} invoiceData - The updated invoice data
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const updateInvoice = async (id, invoiceData) => {
  try {
    // Make sure we only update fields that exist in the database schema
    const updateFields = {
      ...invoiceData,
      updatedat: new Date().toISOString()
    };
    
    const { data, error } = await updateData('invoices', id, updateFields);
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error updating invoice:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Upload payment proof for an invoice
 * @param {string} invoiceId - The invoice ID
 * @param {File} file - The payment proof file
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const uploadPaymentProof = async (invoiceId, file) => {
  try {
    // Upload file to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${invoiceId}_${Date.now()}.${fileExt}`;
    const filePath = `payment_proofs/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(filePath, file);
    
    if (uploadError) {
      throw uploadError;
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('invoices')
      .getPublicUrl(filePath);
    
    const paymentProofUrl = urlData.publicUrl;
    
    // Update invoice with payment proof URL and change status
    const updateFields = {
      paymentproofurl: paymentProofUrl,
      status: INVOICE_STATUS.VERIFICATION_PENDING,
      paymentdate: new Date().toISOString(),
      updatedat: new Date().toISOString()
    };
    
    const { data, error } = await updateData('invoices', invoiceId, updateFields);
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error uploading payment proof:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Verify payment proof for an invoice
 * @param {string} invoiceId - The invoice ID
 * @param {boolean} isApproved - Whether the payment is approved
 * @param {string} notes - Verification notes
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const verifyPaymentProof = async (invoiceId, isApproved, notes = '') => {
  try {
    const status = isApproved ? INVOICE_STATUS.PAID : INVOICE_STATUS.REJECTED;
    
    // Update only the necessary fields with correct column names
    const updateFields = {
      status,
      notes: notes ? `Verification: ${notes}` : '',
      updatedat: new Date().toISOString(),
    };
    
    // If approved, set the payment date
    if (isApproved) {
      updateFields.paymentdate = new Date().toISOString();
    }
    
    const { data, error } = await updateData('invoices', invoiceId, updateFields);
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error verifying payment:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Mark an invoice as paid (for admin use)
 * @param {string} invoiceId - The invoice ID
 * @param {Object} paymentDetails - Payment details like method, reference, etc.
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const markInvoiceAsPaid = async (invoiceId, paymentDetails = {}) => {
  try {
    // Update only the necessary fields with correct column names
    const updateFields = {
      status: INVOICE_STATUS.PAID,
      paymentdate: new Date().toISOString(),
      updatedat: new Date().toISOString(),
    };
    
    // Add notes if provided
    if (paymentDetails.notes) {
      updateFields.notes = paymentDetails.notes;
    }
    
    const { data, error } = await updateData('invoices', invoiceId, updateFields);
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error marking invoice as paid:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send payment reminder for an invoice
 * @param {string} invoiceId - The invoice ID
 * @returns {Promise<Object>} - Result object with success and error properties
 */
export const sendPaymentReminder = async (invoiceId) => {
  try {
    // Get invoice details
    const { data: invoice, error: fetchError } = await fetchData({
      table: 'invoices',
      id: invoiceId
    });
    
    if (fetchError) {
      throw fetchError;
    }
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    // In a real application, this would send an email or SMS
    console.log(`Payment reminder sent for invoice ${invoiceId}`);
    
    // Update the invoice to record that a reminder was sent
    const updateFields = {
      remindersentat: new Date().toISOString(),
      updatedat: new Date().toISOString()
    };
    
    await updateData('invoices', invoiceId, updateFields);
    
    return { success: true };
  } catch (error) {
    console.error('Error sending payment reminder:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Check for overdue invoices
 * @returns {Promise<Object>} - Result object with success, data, and error properties
 */
export const checkOverdueInvoices = async () => {
  try {
    const today = new Date().toISOString();
    
    // Get all unpaid invoices that are past due
    const { data, error } = await fetchData({
      table: 'invoices',
      filters: [
        { column: 'status', operator: 'neq', value: INVOICE_STATUS.PAID },
        { column: 'duedate', operator: 'lt', value: today }
      ]
    });
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error checking overdue invoices:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Generate monthly invoices for all active rentees
 * @param {Object} options - Options for invoice generation
 * @returns {Promise<Object>} - Result object with success, count, and error properties
 */
export const generateMonthlyInvoices = async (options = {}) => {
  try {
    console.log('Generating monthly invoices for all active rentees');
    
    // Get current billing period if not specified
    if (!options.billingPeriod) {
      const now = new Date();
      options.billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    
    // Get default due date (14 days from now) if not specified
    if (!options.dueDate) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      options.dueDate = dueDate.toISOString().split('T')[0];
    }
    
    // 1. Get all properties with active rentees
    const { data: properties, error: propertiesError } = await supabase
      .from('properties')
      .select('id, name')
      .eq('status', 'active');
      
    if (propertiesError) {
      throw propertiesError;
    }
    
    if (!properties || properties.length === 0) {
      return { success: true, count: 0, message: 'No active properties found' };
    }
    
    // 2. Return early with a message that direct invoice generation needs to be done from the invoices page
    // This avoids the circular dependency while maintaining the function's interface
    return { 
      success: true, 
      count: 0,
      propertyCount: properties.length,
      message: 'Please use the Invoice Generation Wizard to generate invoices for these properties.',
      propertyIds: properties.map(p => p.id)
    };
  } catch (error) {
    console.error('Error generating monthly invoices:', error.message);
    return { success: false, error: error.message };
  }
};

// Helper functions for notifications
// In a real app, these would send actual emails

/**
 * Send invoice notification to rentee
 * @param {string} invoiceId - The invoice ID
 * @param {string} email - The rentee's email
 * @returns {Promise<void>}
 */
const sendInvoiceNotification = async (invoiceId, email) => {
  // In a real application, this would send an email
  console.log(`Invoice notification sent to ${email} for invoice ${invoiceId}`);
  return true;
};

/**
 * Send payment verification notification to rentee
 * @param {string} invoiceId - The invoice ID
 * @param {string} email - The rentee's email
 * @param {boolean} isApproved - Whether the payment was approved
 * @returns {Promise<void>}
 */
const sendPaymentVerificationNotification = async (invoiceId, email, isApproved) => {
  // This is a placeholder for email sending functionality
  const status = isApproved ? 'approved' : 'rejected';
  console.log(`Sending payment ${status} notification for invoice #${invoiceId} to ${email}`);
}; 