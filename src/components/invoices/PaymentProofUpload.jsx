import { useEffect, useState } from 'react';
import { uploadPaymentProof } from '../../services/paymentService';
import FileUpload from '../ui/FileUpload';
import { formatCurrency } from '../../utils/helpers';

const getToday = () => new Date().toISOString().slice(0, 10);

const PaymentProofUpload = ({ invoiceId, outstandingBalance, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentProof, setPaymentProof] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState({
    amount: '',
    paymentMethod: '',
    transactionReference: '',
    paymentDate: getToday(),
    notes: ''
  });

  const maxAmount = Number(outstandingBalance);

  useEffect(() => {
    if (Number.isFinite(maxAmount) && maxAmount > 0) {
      setPaymentDetails((current) => ({ ...current, amount: String(maxAmount) }));
    }
  }, [maxAmount]);

  const handleFileUpload = (files) => {
    if (files && files.length > 0) {
      setPaymentProof(files[0]);
    }
  };

  const handleDetailChange = (field, value) => {
    setPaymentDetails((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!paymentProof) {
      setError('Please upload a payment proof image or PDF');
      return;
    }

    const amount = Number(paymentDetails.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount greater than zero.');
      return;
    }
    if (Number.isFinite(maxAmount) && maxAmount > 0 && amount > maxAmount) {
      setError(`Payment amount cannot exceed the outstanding balance of ${formatCurrency(maxAmount)}.`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { success, data, error: uploadError } = await uploadPaymentProof(invoiceId, paymentProof, {
        amount,
        paymentMethod: paymentDetails.paymentMethod || null,
        transactionReference: paymentDetails.transactionReference || null,
        paymentDate: paymentDetails.paymentDate
          ? new Date(`${paymentDetails.paymentDate}T00:00:00.000Z`).toISOString()
          : new Date().toISOString(),
        notes: paymentDetails.notes || null
      });

      if (!success) {
        throw new Error(uploadError || 'Failed to upload payment proof');
      }

      if (onSuccess) {
        onSuccess(data);
      }

      setPaymentProof(null);
    } catch (uploadError) {
      console.error('Error uploading payment proof:', uploadError.message);
      setError(uploadError.message);

      if (onError) {
        onError(uploadError.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-3 sm:p-6">
      <h2 className="text-lg font-medium mb-3 sm:mb-4">Upload Payment Proof</h2>

      {Number.isFinite(maxAmount) && maxAmount > 0 && (
        <div className="mb-4 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          Outstanding balance: <strong>{formatCurrency(maxAmount)}</strong>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 sm:px-4 sm:py-3 rounded relative mb-3 sm:mb-4 text-sm" role="alert">
          <span className="block">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="paymentAmount" className="mb-1 block text-sm font-medium text-gray-700">Amount paid</label>
            <input
              id="paymentAmount"
              type="number"
              min="0.01"
              step="0.01"
              max={Number.isFinite(maxAmount) && maxAmount > 0 ? maxAmount : undefined}
              required
              value={paymentDetails.amount}
              onChange={(event) => handleDetailChange('amount', event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="paymentDate" className="mb-1 block text-sm font-medium text-gray-700">Payment date</label>
            <input
              id="paymentDate"
              type="date"
              required
              value={paymentDetails.paymentDate}
              onChange={(event) => handleDetailChange('paymentDate', event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="paymentMethod" className="mb-1 block text-sm font-medium text-gray-700">Payment method</label>
            <input
              id="paymentMethod"
              type="text"
              placeholder="Bank transfer, cash, card..."
              value={paymentDetails.paymentMethod}
              onChange={(event) => handleDetailChange('paymentMethod', event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="transactionReference" className="mb-1 block text-sm font-medium text-gray-700">Reference</label>
            <input
              id="transactionReference"
              type="text"
              placeholder="Transaction/reference number"
              value={paymentDetails.transactionReference}
              onChange={(event) => handleDetailChange('transactionReference', event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="paymentNotes" className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            id="paymentNotes"
            rows={2}
            value={paymentDetails.notes}
            onChange={(event) => handleDetailChange('notes', event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <FileUpload
          label="Payment Proof"
          id="paymentProof"
          onChange={handleFileUpload}
          accept="image/*,application/pdf"
          required
          existingFiles={paymentProof ? [paymentProof] : []}
          onRemove={() => setPaymentProof(null)}
        />

        <button
          type="submit"
          disabled={loading || !paymentProof || !paymentDetails.amount}
          className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? 'Uploading...' : 'Submit Payment Proof'}
        </button>

        <p className="text-xs sm:text-sm text-gray-500">
          Upload a screenshot, photo or PDF receipt. JPG, PNG and PDF files are accepted up to the configured upload limit.
        </p>
      </form>
    </div>
  );
};

export default PaymentProofUpload;
