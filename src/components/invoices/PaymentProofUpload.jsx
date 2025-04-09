import { useState } from 'react';
import { uploadPaymentProof } from '../../services/paymentService';
import FileUpload from '../ui/FileUpload';

const PaymentProofUpload = ({ invoiceId, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentProof, setPaymentProof] = useState(null);
  
  const handleFileUpload = (files) => {
    if (files && files.length > 0) {
      setPaymentProof(files[0]);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!paymentProof) {
      setError('Please upload a payment proof image');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const { success, url, error } = await uploadPaymentProof(invoiceId, paymentProof);
      
      if (!success) {
        throw new Error(error || 'Failed to upload payment proof');
      }
      
      if (onSuccess) {
        onSuccess(url);
      }
      
      setPaymentProof(null);
    } catch (error) {
      console.error('Error uploading payment proof:', error.message);
      setError(error.message);
      
      if (onError) {
        onError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-3 sm:p-6">
      <h2 className="text-lg font-medium mb-3 sm:mb-4">Upload Payment Proof</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 sm:px-4 sm:py-3 rounded relative mb-3 sm:mb-4 text-sm" role="alert">
          <span className="block">{error}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <FileUpload
          label="Payment Proof"
          id="paymentProof"
          onChange={handleFileUpload}
          accept="image/*"
          required
          existingFiles={paymentProof ? [paymentProof] : []}
          onRemove={() => setPaymentProof(null)}
        />
        
        <div className="mt-3 sm:mt-4">
          <button
            type="submit"
            disabled={loading || !paymentProof}
            className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Uploading...' : 'Submit Payment Proof'}
          </button>
        </div>
        
        <p className="mt-2 text-xs sm:text-sm text-gray-500">
          Upload a screenshot or photo of your payment receipt. Accepted formats: JPG, PNG, PDF.
        </p>
      </form>
    </div>
  );
};

export default PaymentProofUpload; 