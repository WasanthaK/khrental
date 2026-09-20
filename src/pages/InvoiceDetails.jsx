import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { formatCurrency, formatDate } from '../utils/helpers';
import { PERMISSIONS, hasPermission } from '../utils/accessPolicy.js';
import { getInvoiceAccount } from '../services/platformClient';
import { markInvoiceAsPaid, sendPaymentReminder } from '../services/paymentService';
import PaymentVerification from '../components/invoices/PaymentVerification';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const todayValue = () => new Date().toISOString().slice(0, 10);

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, membership } = useAuth();
  const subject = useMemo(() => ({ user, membership: membership || user?.membership || null }), [user, membership]);
  const canManageInvoices = hasPermission(subject, PERMISSIONS.INVOICES_MANAGE);
  const canManagePayments = hasPermission(subject, PERMISSIONS.PAYMENTS_MANAGE);

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showPaymentVerification, setShowPaymentVerification] = useState(false);
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [working, setWorking] = useState(false);
  const [manualPayment, setManualPayment] = useState({
    amount: '',
    paymentMethod: '',
    transactionReference: '',
    paymentDate: todayValue(),
    notes: ''
  });

  const loadAccount = useCallback(async () => {
    if (!id || !UUID_REGEX.test(id)) {
      setError(`Invalid invoice ID format: ${id || ''}`);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: accountError } = await getInvoiceAccount(id);
      if (accountError) throw accountError;
      if (!data?.invoice) throw new Error('Invoice not found');
      setAccount(data);
    } catch (accountError) {
      setError(accountError.message || 'Failed to load invoice account.');
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const invoice = account?.invoice || null;
  const payments = account?.payments || [];
  const receipts = account?.receipts || [];
  const components = account?.components || [];
  const outstandingBalance = Number(account?.outstandingBalance) || 0;
  const pendingPayment = payments.find((payment) => String(payment.status).toLowerCase() === 'pending') || null;
  const paymentProofUrl = pendingPayment?.proofurl || invoice?.paymentproofurl || null;

  useEffect(() => {
    if (showManualPayment && outstandingBalance > 0) {
      setManualPayment((current) => ({ ...current, amount: String(outstandingBalance) }));
    }
  }, [showManualPayment, outstandingBalance]);

  const handleVerificationSuccess = async () => {
    setShowPaymentVerification(false);
    setNotice('Payment verification recorded.');
    await loadAccount();
  };

  const handleManualPayment = async (event) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const amount = Number(manualPayment.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstandingBalance) {
      setError(`Payment amount must be greater than zero and cannot exceed ${formatCurrency(outstandingBalance)}.`);
      return;
    }

    try {
      setWorking(true);
      const result = await markInvoiceAsPaid(id, {
        amount,
        paymentMethod: manualPayment.paymentMethod || 'manual',
        transactionReference: manualPayment.transactionReference || null,
        paymentDate: manualPayment.paymentDate
          ? new Date(`${manualPayment.paymentDate}T00:00:00.000Z`).toISOString()
          : new Date().toISOString(),
        notes: manualPayment.notes || null
      });
      if (!result.success) throw new Error(result.error || 'Failed to record payment');
      setShowManualPayment(false);
      setNotice(`Payment of ${formatCurrency(amount)} recorded and receipt created.`);
      await loadAccount();
    } catch (paymentError) {
      setError(paymentError.message || 'Failed to record payment.');
    } finally {
      setWorking(false);
    }
  };

  const handleRecordReminder = async () => {
    try {
      setWorking(true);
      setError(null);
      setNotice(null);
      const result = await sendPaymentReminder(id);
      if (!result.success) throw new Error(result.error || 'Failed to record reminder follow-up');
      setNotice('Reminder follow-up recorded. No email or SMS was sent by this action.');
      await loadAccount();
    } catch (reminderError) {
      setError(reminderError.message || 'Failed to record reminder follow-up.');
    } finally {
      setWorking(false);
    }
  };

  const handleDownloadInvoice = () => {
    if (!invoice) return;

    try {
      const componentLines = components.length > 0
        ? components.map((component) => `${component.description || component.component_type}: ${formatCurrency(component.amount)}`)
        : Object.entries(invoice.components || {}).map(([key, value]) => `${key}: ${formatCurrency(value)}`);
      const invoiceContent = [
        `INVOICE #${invoice.id}`,
        `Billing Period: ${invoice.billingperiod || 'N/A'}`,
        `Issued: ${formatDate(invoice.issued_at || invoice.createdat)}`,
        `Due Date: ${formatDate(invoice.duedate)}`,
        `Status: ${invoice.status}`,
        `Property: ${invoice.property_name || 'N/A'}`,
        `Tenant: ${invoice.rentee_name || 'N/A'}`,
        '',
        'INVOICE COMPONENTS:',
        ...componentLines,
        '',
        `Total Amount: ${formatCurrency(invoice.totalamount)}`,
        `Outstanding Balance: ${formatCurrency(outstandingBalance)}`
      ].join('\n');

      const blob = new Blob([invoiceContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Invoice-${invoice.id}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message || 'Failed to download invoice.');
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (String(status || '').toLowerCase()) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'verification_pending': return 'bg-blue-100 text-blue-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="text-lg">Loading invoice account...</div></div>;
  }

  if (error && !invoice) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert">{error}</div>
        <button onClick={() => navigate('/dashboard/invoices')} className="mt-4 px-4 py-2 border rounded-md">Back to Invoices</button>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-sm text-gray-500">Billing account</p>
          <h1 className="text-2xl font-semibold">Invoice #{invoice.id.substring(0, 8)}</h1>
        </div>
        <button onClick={() => navigate('/dashboard/invoices')} className="px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm">Back to Invoices</button>
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert">{error}</div>}
      {notice && <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded" role="status">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4"><div className="text-xs text-gray-500">Invoice total</div><div className="text-lg font-semibold">{formatCurrency(invoice.totalamount || 0)}</div></div>
        <div className="rounded-lg border bg-white p-4"><div className="text-xs text-gray-500">Outstanding</div><div className="text-lg font-semibold">{formatCurrency(outstandingBalance)}</div></div>
        <div className="rounded-lg border bg-white p-4"><div className="text-xs text-gray-500">Billing period</div><div className="text-lg font-semibold">{invoice.billingperiod || 'N/A'}</div></div>
        <div className="rounded-lg border bg-white p-4"><div className="text-xs text-gray-500">Status</div><span className={`mt-1 inline-block rounded-full px-2 py-1 text-sm font-medium ${getStatusBadgeColor(invoice.status)}`}>{String(invoice.status || '').replaceAll('_', ' ')}</span></div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border bg-white p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Invoice</h2>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 mb-5">
            <div><span className="text-gray-500">Property:</span> <strong>{invoice.property_name || 'N/A'}</strong></div>
            <div><span className="text-gray-500">Tenant:</span> <strong>{invoice.rentee_name || 'N/A'}</strong></div>
            <div><span className="text-gray-500">Issued:</span> <strong>{formatDate(invoice.issued_at || invoice.createdat)}</strong></div>
            <div><span className="text-gray-500">Due:</span> <strong>{formatDate(invoice.duedate)}</strong></div>
          </div>

          <h3 className="font-medium mb-2">Components</h3>
          {components.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Description</th><th className="py-2">Type</th><th className="py-2 text-right">Amount</th></tr></thead>
                <tbody>
                  {components.map((component) => (
                    <tr key={component.id} className="border-b last:border-0">
                      <td className="py-2">{component.description || component.component_type}</td>
                      <td className="py-2 capitalize">{String(component.component_type || '').replaceAll('_', ' ')}</td>
                      <td className="py-2 text-right">{formatCurrency(component.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No source-linked components are available for this invoice.</p>
          )}
        </section>

        <aside className="rounded-lg border bg-white p-5">
          <h2 className="text-lg font-semibold mb-4">Actions</h2>
          <div className="space-y-2">
            {canManagePayments && pendingPayment && (
              <button type="button" onClick={() => setShowPaymentVerification(true)} className="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Verify pending payment</button>
            )}
            {canManagePayments && outstandingBalance > 0 && !pendingPayment && (
              <button type="button" onClick={() => setShowManualPayment(true)} className="w-full px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Record manual payment</button>
            )}
            {canManageInvoices && outstandingBalance > 0 && (
              <button type="button" disabled={working} onClick={handleRecordReminder} className="w-full px-3 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:bg-gray-300">Record reminder follow-up</button>
            )}
            <button type="button" onClick={handleDownloadInvoice} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Download account summary</button>
          </div>
          {invoice.reminderdate && <p className="mt-3 text-xs text-gray-500">Last reminder follow-up: {formatDate(invoice.reminderdate)}</p>}
          <p className="mt-4 text-xs text-gray-500">Reminder follow-up records an audited action only. Email/SMS delivery is not yet attached to this control.</p>
        </aside>
      </div>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold mb-4">Payments</h2>
        {payments.length > 0 ? (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{formatCurrency(payment.amount)}</strong>
                  <span className="capitalize">{String(payment.status || '').replaceAll('_', ' ')}</span>
                </div>
                <div className="mt-1 text-gray-500">{formatDate(payment.paymentdate || payment.createdat)}</div>
                {payment.paymentmethod && <div className="mt-1">Method: {payment.paymentmethod}</div>}
                {payment.transactionreference && <div className="mt-1">Reference: {payment.transactionreference}</div>}
                {payment.rejection_reason && <div className="mt-1 text-red-700">Rejection: {payment.rejection_reason}</div>}
                {payment.proofurl && <a href={payment.proofurl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-blue-600 hover:underline">Open payment proof</a>}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500">No payment attempts recorded.</p>}
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold mb-4">Receipts</h2>
        {receipts.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {receipts.map((receipt) => (
              <div key={receipt.id} className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
                <div className="font-medium">Receipt {receipt.receipt_number}</div>
                <div>{formatCurrency(receipt.amount)} · {formatDate(receipt.issued_at)}</div>
                {receipt.paymentmethod && <div className="mt-1 text-gray-600">Method: {receipt.paymentmethod}</div>}
                {receipt.transactionreference && <div className="mt-1 text-gray-600">Reference: {receipt.transactionreference}</div>}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500">No verified receipts yet.</p>}
      </section>

      {showPaymentVerification && pendingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5">
            <PaymentVerification
              invoiceId={id}
              paymentProofUrl={paymentProofUrl}
              payment={pendingPayment}
              onSuccess={handleVerificationSuccess}
              onError={setError}
            />
            <button type="button" onClick={() => setShowPaymentVerification(false)} className="mt-4 w-full px-4 py-2 border rounded-md">Cancel</button>
          </div>
        </div>
      )}

      {showManualPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <form onSubmit={handleManualPayment} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Record manual payment</h2>
              <p className="mt-1 text-sm text-gray-500">Outstanding balance: {formatCurrency(outstandingBalance)}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Amount</label>
                <input type="number" min="0.01" step="0.01" max={outstandingBalance} required value={manualPayment.amount} onChange={(event) => setManualPayment((current) => ({ ...current, amount: event.target.value }))} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Payment date</label>
                <input type="date" required value={manualPayment.paymentDate} onChange={(event) => setManualPayment((current) => ({ ...current, paymentDate: event.target.value }))} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Method</label>
                <input type="text" placeholder="Cash, bank transfer..." value={manualPayment.paymentMethod} onChange={(event) => setManualPayment((current) => ({ ...current, paymentMethod: event.target.value }))} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Reference</label>
                <input type="text" value={manualPayment.transactionReference} onChange={(event) => setManualPayment((current) => ({ ...current, transactionReference: event.target.value }))} className="w-full rounded-md border px-3 py-2" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Notes</label>
              <textarea rows={2} value={manualPayment.notes} onChange={(event) => setManualPayment((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-md border px-3 py-2" />
            </div>
            <div className="flex gap-3">
              <button type="button" disabled={working} onClick={() => setShowManualPayment(false)} className="flex-1 px-4 py-2 border rounded-md">Cancel</button>
              <button type="submit" disabled={working} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md disabled:bg-gray-300">{working ? 'Recording…' : 'Record payment'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetails;
