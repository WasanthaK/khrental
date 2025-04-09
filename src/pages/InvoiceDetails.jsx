import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchData, updateData, supabase } from '../services/supabaseClient';
import { formatCurrency, formatDate } from '../utils/helpers';
import { INVOICE_STATUS } from '../utils/constants';

// Components
import InvoiceComponentsTable from '../components/invoices/InvoiceComponentsTable';
import PaymentProofUpload from '../components/invoices/PaymentProofUpload';
import PaymentVerification from '../components/invoices/PaymentVerification';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // State
  const [invoice, setInvoice] = useState(null);
  const [property, setProperty] = useState(null);
  const [rentee, setRentee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPaymentUpload, setShowPaymentUpload] = useState(false);
  const [showPaymentVerification, setShowPaymentVerification] = useState(false);
  const [userRole, setUserRole] = useState('admin'); // This would come from auth context in a real app
  
  // Fetch invoice data
  useEffect(() => {
    const fetchInvoiceData = async () => {
      try {
        setLoading(true);
        
        // Debug logging
        console.log(`InvoiceDetails - Received ID param: "${id}"`);
        
        // Validate ID is a UUID before querying
        if (!id || !UUID_REGEX.test(id)) {
          throw new Error(`Invalid invoice ID format: ${id}`);
        }
        
        // Check for specific route paths that should be handled differently
        const commonRoutes = {
          'batch-generate': '/dashboard/invoices/batch-generate',
          'new': '/dashboard/invoices/new',
          'dashboard': '/dashboard/invoices/dashboard',
          'generate': '/dashboard/invoices/generate'
        };
        
        if (commonRoutes[id]) {
          navigate(commonRoutes[id]);
          return;
        }
        
        // Fetch invoice details
        const { data: invoiceData, error: invoiceError } = await fetchData('invoices', {
          filters: [{ column: 'id', operator: 'eq', value: id }],
        });
        
        if (invoiceError) {
          throw invoiceError;
        }
        
        if (invoiceData && invoiceData.length > 0) {
          setInvoice(invoiceData[0]);
          
          // Fetch property details
          if (invoiceData[0].propertyid) {
            const { data: propertyData, error: propertyError } = await fetchData('properties', {
              filters: [{ column: 'id', operator: 'eq', value: invoiceData[0].propertyid }],
            });
            
            if (propertyError) {
              throw propertyError;
            }
            
            if (propertyData && propertyData.length > 0) {
              setProperty(propertyData[0]);
            }
          }
          
          // Fetch rentee details from app_users table
          if (invoiceData[0].renteeid) {
            const { data: renteeData, error: renteeError } = await supabase
              .from('app_users')
              .select('*')
              .eq('id', invoiceData[0].renteeid)
              .eq('user_type', 'rentee')
              .single();
            
            if (renteeError) {
              throw renteeError;
            }
            
            setRentee(renteeData);
          }
        } else {
          throw new Error('Invoice not found');
        }
      } catch (error) {
        console.error('Error fetching invoice data:', error.message);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInvoiceData();
  }, [id]);
  
  // Handle payment upload success
  const handlePaymentUploadSuccess = (updatedInvoice) => {
    setInvoice(updatedInvoice);
    setShowPaymentUpload(false);
  };
  
  // Handle payment verification success
  const handleVerificationSuccess = (updatedInvoice) => {
    setInvoice(updatedInvoice);
    setShowPaymentVerification(false);
  };
  
  // Handle error
  const handleError = (errorMessage) => {
    setError(errorMessage);
  };
  
  // Mark invoice as paid
  const handleMarkAsPaid = async () => {
    try {
      setError(null);
      
      // Only update the specific fields we need
      const updateFields = {
        status: INVOICE_STATUS.PAID,
        paymentdate: new Date().toISOString(),
        updatedat: new Date().toISOString()
      };
      
      const { data, error } = await updateData('invoices', id, updateFields);
      
      if (error) {
        throw error;
      }
      
      // Update the local state with the changes
      setInvoice({
        ...invoice,
        ...updateFields
      });
      
      alert('Invoice has been marked as paid.');
    } catch (error) {
      console.error('Error marking invoice as paid:', error.message);
      setError(error.message);
    }
  };
  
  // Send reminder
  const handleSendReminder = async () => {
    try {
      setError(null);
      
      // In a real application, this would call an API to send an email/SMS
      // For now, we'll just simulate it
      
      alert(`Reminder sent to ${rentee?.name || 'rentee'} for invoice #${invoice.id}`);
      
      // Update the invoice to record that a reminder was sent
      const updatedInvoice = {
        ...invoice,
        reminderSent: true,
        reminderDate: new Date().toISOString()
      };
      
      const { data, error } = await updateData('invoices', id, updatedInvoice);
      
      if (error) {
        throw error;
      }
      
      setInvoice(updatedInvoice);
    } catch (error) {
      console.error('Error sending reminder:', error.message);
      setError(error.message);
    }
  };
  
  // Download invoice
  const handleDownloadInvoice = () => {
    try {
      // Create a simple invoice representation
      const invoiceContent = `
        INVOICE #${invoice.id}
        
        Date: ${formatDate(invoice.createdat)}
        Due Date: ${formatDate(invoice.duedate)}
        Status: ${invoice.status}
        
        Property: ${property?.name || 'N/A'}
        Rentee: ${rentee?.name || 'N/A'}
        
        INVOICE COMPONENTS:
        ${Object.entries(invoice.components || {})
          .map(([key, value]) => `${key}: ${formatCurrency(value)}`)
          .join('\n        ')}
        
        Total Amount: ${formatCurrency(invoice.totalamount)}
      `;
      
      // Create a blob and download it
      const blob = new Blob([invoiceContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${invoice.id}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading invoice:', error.message);
      setError('Failed to download invoice. Please try again.');
    }
  };
  
  // Get status badge color
  const getStatusBadgeColor = (status) => {
    switch (status) {
      case INVOICE_STATUS.PAID:
        return 'bg-green-100 text-green-800';
      case INVOICE_STATUS.PENDING:
        return 'bg-yellow-100 text-yellow-800';
      case INVOICE_STATUS.VERIFICATION_PENDING:
        return 'bg-blue-100 text-blue-800';
      case INVOICE_STATUS.OVERDUE:
        return 'bg-red-100 text-red-800';
      case INVOICE_STATUS.REJECTED:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading invoice details...</div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
        <div className="mt-4">
          <button
            onClick={() => navigate('/dashboard/invoices')}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }
  
  // Render if invoice not found
  if (!invoice) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold mb-4">Invoice Not Found</h2>
        <p className="mb-6">The invoice you are looking for does not exist or has been removed.</p>
        <button
          onClick={() => navigate('/dashboard/invoices')}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Back to Invoices
        </button>
      </div>
    );
  }
  
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-semibold">Invoice Details</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate('/dashboard/invoices')}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
          >
            Back to Invoices
          </button>
          
          {userRole === 'admin' && (
            <Link
              to={`/dashboard/invoices/edit/${id}`}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Edit Invoice
            </Link>
          )}
        </div>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}
      
      {/* Invoice Card */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
            <div>
              <h2 className="text-xl font-semibold">Invoice #{invoice.id}</h2>
              <p className="text-gray-600 text-sm">Created on {formatDate(invoice.createdat)}</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(invoice.status)} mt-2 sm:mt-0`}>
              {invoice.status}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Left column */}
            <div>
              <h3 className="text-lg font-medium mb-3">Invoice Details</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-gray-600">Property:</span>
                  <span className="ml-2 font-medium">{property?.name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Rentee:</span>
                  <span className="ml-2 font-medium">{rentee?.name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Billing Period:</span>
                  <span className="ml-2 font-medium">{invoice.billingperiod}</span>
                </div>
                <div>
                  <span className="text-gray-600">Due Date:</span>
                  <span className="ml-2 font-medium">{formatDate(invoice.duedate)}</span>
                </div>
                {invoice.paymentdate && (
                  <div>
                    <span className="text-gray-600">Payment Date:</span>
                    <span className="ml-2 font-medium">{formatDate(invoice.paymentdate)}</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right column */}
            <div>
              <h3 className="text-lg font-medium mb-3">Payment Information</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-gray-600">Total Amount:</span>
                  <span className="ml-2 font-medium">{formatCurrency(invoice.totalamount)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Payment Method:</span>
                  <span className="ml-2 font-medium">{invoice.paymentmethod || 'Not specified'}</span>
                </div>
                {invoice.paymentreference && (
                  <div>
                    <span className="text-gray-600">Payment Reference:</span>
                    <span className="ml-2 font-medium">{invoice.paymentreference}</span>
                  </div>
                )}
                {invoice.notes && (
                  <div>
                    <span className="text-gray-600">Notes:</span>
                    <span className="ml-2 font-medium break-words">{invoice.notes}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Invoice Components */}
          <div className="mb-6 overflow-x-auto">
            <h3 className="text-lg font-medium mb-3">Invoice Components</h3>
            <InvoiceComponentsTable components={invoice.components} />
          </div>
          
          {/* Payment Proof */}
          {invoice.paymentproofurl && (
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3">Payment Proof</h3>
              <div className="border rounded-md p-4">
                <a 
                  href={invoice.paymentproofurl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Payment Proof
                </a>
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mt-6">
            {/* Admin actions */}
            {userRole === 'admin' && (
              <>
                {invoice.status === INVOICE_STATUS.VERIFICATION_PENDING && (
                  <button
                    onClick={() => setShowPaymentVerification(true)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    Verify Payment
                  </button>
                )}
                
                {(invoice.status === INVOICE_STATUS.PENDING || invoice.status === INVOICE_STATUS.OVERDUE) && (
                  <button
                    onClick={handleMarkAsPaid}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                  >
                    Mark as Paid
                  </button>
                )}
                
                {invoice.status !== INVOICE_STATUS.PAID && (
                  <button
                    onClick={handleSendReminder}
                    className="px-3 py-1.5 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm"
                  >
                    Send Reminder
                  </button>
                )}
              </>
            )}
            
            {/* Rentee actions */}
            {userRole === 'rentee' && (
              <>
                {(invoice.status === INVOICE_STATUS.PENDING || invoice.status === INVOICE_STATUS.OVERDUE) && (
                  <button
                    onClick={() => setShowPaymentUpload(true)}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                  >
                    Record Payment
                  </button>
                )}
              </>
            )}
            
            {/* Common actions */}
            <button
              onClick={handleDownloadInvoice}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
            >
              Download Invoice
            </button>
          </div>
        </div>
      </div>
      
      {/* Payment Upload Form */}
      {showPaymentUpload && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6 p-6">
          <h3 className="text-lg font-medium mb-4">Upload Payment Proof</h3>
          <PaymentProofUpload
            invoiceId={id}
            onSuccess={handlePaymentUploadSuccess}
            onError={handleError}
          />
          <button
            onClick={() => setShowPaymentUpload(false)}
            className="mt-4 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      )}
      
      {/* Payment Verification Form */}
      {showPaymentVerification && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6 p-6">
          <h3 className="text-lg font-medium mb-4">Verify Payment</h3>
          <PaymentVerification
            invoiceId={id}
            paymentProofUrl={invoice.paymentproofurl}
            onSuccess={handleVerificationSuccess}
            onError={handleError}
          />
          <button
            onClick={() => setShowPaymentVerification(false)}
            className="mt-4 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetails; 