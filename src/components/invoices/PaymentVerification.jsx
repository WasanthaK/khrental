import { useState } from 'react';
import { verifyPaymentProof } from '../../services/paymentService';
import FormTextarea from '../ui/FormTextarea';

const PaymentVerification = ({ invoiceId, paymentProofUrl, payment, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const isPdf = /\.pdf(?:$|\?)/i.test(String(paymentProofUrl || ''));

  const handleApprove = async () => {
    await handleVerification(true);
  };

  const handleReject = async () => {
    if (!verificationNotes.trim()) {
      setError('Please provide rejection reason');
      return;
    }

    await handleVerification(false);
  };

  const handleVerification = async (isApproved) => {
    try {
      setLoading(true);
      setError(null);

      const result = await verifyPaymentProof(invoiceId, isApproved, verificationNotes);
      if (!result.success) {
        throw new Error(result.error || 'Failed to verify payment');
      }

      if (onSuccess) {
        onSuccess(result.data, {
          approved: isApproved,
          payment: result.payment || null,
          receipt: result.receipt || null
        });
      }
    } catch (verificationError) {
      console.error('Error verifying payment:', verificationError.message);
      setError(verificationError.message);

      if (onError) {
        onError(verificationError.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-3 sm:p-6">
      <h2 className="text-lg font-medium mb-3 sm:mb-4">Verify Payment</h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 sm:px-4 sm:py-3 rounded relative mb-3 sm:mb-4 text-sm" role="alert">
          <span className="block">{error}</span>
        </div>
      )}

      {payment && (
        <div className="mb-4 grid grid-cols-1 gap-2 rounded-md bg-gray-50 p-3 text-sm sm:grid-cols-2">
          <div><span className="text-gray-500">Amount:</span> <strong>{payment.amount}</strong></div>
          <div><span className="text-gray-500">Method:</span> <strong>{payment.paymentmethod || 'Not specified'}</strong></div>
          {payment.transactionreference && <div className="sm:col-span-2"><span className="text-gray-500">Reference:</span> <strong>{payment.transactionreference}</strong></div>}
        </div>
      )}

      <div className="mb-3 sm:mb-4">
        <h3 className="text-md font-medium mb-2">Payment Proof</h3>
        {paymentProofUrl ? (
          <div className="border border-gray-200 rounded-lg p-2">
            {isPdf ? (
              <a
                href={paymentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                Open PDF payment proof
              </a>
            ) : (
              <img
                src={paymentProofUrl}
                alt="Payment Proof"
                className="max-w-full h-auto rounded"
              />
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No payment proof available</p>
        )}
      </div>

      <FormTextarea
        label="Verification Notes"
        id="verificationNotes"
        value={verificationNotes}
        onChange={(e) => setVerificationNotes(e.target.value)}
        placeholder="Enter notes about the payment verification (required for rejection)"
        rows={3}
      />

      <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row sm:space-x-3 space-y-2 sm:space-y-0">
        <button
          type="button"
          onClick={handleReject}
          disabled={loading}
          className="sm:flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Reject Payment'}
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={loading}
          className="sm:flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Approve Payment'}
        </button>
      </div>

      <p className="mt-2 text-xs sm:text-sm text-gray-500">
        Approval creates a verified payment ledger entry and receipt. Rejection keeps the reason in the audit history.
      </p>
    </div>
  );
};

export default PaymentVerification;
