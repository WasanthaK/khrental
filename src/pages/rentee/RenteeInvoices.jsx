import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { INVOICE_STATUS } from '../../utils/constants';
import { findAppUserByAuthId } from '../../services/appUserService';
import { listProperties } from '../../services/agreementService';
import { listInvoices } from '../../services/invoiceService';
import { getInvoiceAccount } from '../../services/platformClient';
import InvoiceCard from '../../components/invoices/InvoiceCard';
import PaymentProofUpload from '../../components/invoices/PaymentProofUpload';

const RenteeInvoices = () => {
  const { user, activeTenantId } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPaymentUpload, setShowPaymentUpload] = useState(false);
  const [paymentLoadingId, setPaymentLoadingId] = useState(null);
  const [account, setAccount] = useState(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const dataFetched = useRef(false);

  useEffect(() => {
    dataFetched.current = false;
    setInvoices([]);
    setProperties([]);
    setError(null);
    setAccount(null);

    if (!user?.id) return;

    const fetchRenteeInvoices = async () => {
      try {
        setLoading(true);
        const renteeResult = await findAppUserByAuthId(user.id);
        if (!renteeResult.success || !renteeResult.data) {
          throw new Error(renteeResult.error || 'No tenant profile found for your account. Please contact support.');
        }

        const { data: invoicesData, error: invoicesError } = await listInvoices({
          renteeId: renteeResult.data.id,
          pageSize: 1000
        });
        if (invoicesError) throw invoicesError;

        setInvoices(invoicesData || []);
        if (invoicesData?.length) {
          const propertyIds = new Set(invoicesData.map((invoice) => invoice.propertyid).filter(Boolean));
          const propertyData = await listProperties();
          setProperties((propertyData || []).filter((property) => propertyIds.has(property.id)));
        }
        dataFetched.current = true;
      } catch (fetchError) {
        setError(fetchError.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRenteeInvoices();
  }, [user?.id, activeTenantId]);

  const filteredInvoices = invoices.filter((invoice) => {
    const propertyName = properties.find((property) => property.id === invoice.propertyid)?.name || '';
    const search = searchTerm.toLowerCase();
    const matchesSearch = String(invoice.id).toLowerCase().includes(search)
      || String(invoice.billingperiod || '').toLowerCase().includes(search)
      || propertyName.toLowerCase().includes(search);
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handlePaymentUploadSuccess = (updatedInvoice) => {
    if (updatedInvoice) {
      setInvoices((current) => current.map((invoice) => invoice.id === updatedInvoice.id ? updatedInvoice : invoice));
    }
    setShowPaymentUpload(false);
    setSelectedInvoice(null);
    setAccount(null);
  };

  const handleOpenPaymentUpload = async (invoice) => {
    try {
      setPaymentLoadingId(invoice.id);
      setError(null);
      const { data, error: accountError } = await getInvoiceAccount(invoice.id);
      if (accountError) throw accountError;
      if (!data || Number(data.outstandingBalance) <= 0) {
        throw new Error('This invoice has no outstanding balance to pay.');
      }
      setSelectedInvoice(invoice);
      setAccount(data);
      setShowPaymentUpload(true);
    } catch (paymentError) {
      setError(paymentError.message);
    } finally {
      setPaymentLoadingId(null);
    }
  };

  const handleViewAccount = async (invoice) => {
    try {
      setAccountLoading(true);
      setError(null);
      setSelectedInvoice(invoice);
      const { data, error: accountError } = await getInvoiceAccount(invoice.id);
      if (accountError) throw accountError;
      setAccount(data);
    } catch (accountError) {
      setError(accountError.message);
    } finally {
      setAccountLoading(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="text-lg">Loading your invoices...</div></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">My Invoices</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex items-center gap-2">
            <label htmlFor="statusFilter" className="text-sm font-medium text-gray-700">Status:</label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All</option>
              <option value={INVOICE_STATUS.PENDING}>Pending</option>
              <option value={INVOICE_STATUS.VERIFICATION_PENDING}>Verification Pending</option>
              <option value={INVOICE_STATUS.PAID}>Paid</option>
              <option value={INVOICE_STATUS.OVERDUE}>Overdue</option>
              <option value={INVOICE_STATUS.REJECTED}>Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-600">No invoices found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredInvoices.map((invoice) => {
            const property = properties.find((entry) => entry.id === invoice.propertyid);
            const canSubmit = [INVOICE_STATUS.PENDING, INVOICE_STATUS.OVERDUE, INVOICE_STATUS.REJECTED].includes(invoice.status);
            return (
              <div key={invoice.id} className="relative">
                <InvoiceCard
                  invoice={invoice}
                  property={property}
                  rentee={user}
                  showDetails={false}
                  showStatusActions={false}
                />
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleViewAccount(invoice)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Account & Receipts
                  </button>
                  {canSubmit && (
                    <button
                      type="button"
                      disabled={paymentLoadingId === invoice.id}
                      onClick={() => handleOpenPaymentUpload(invoice)}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {paymentLoadingId === invoice.id ? 'Loading Balance…' : 'Submit Payment Proof'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showPaymentUpload && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-2">Submit Payment Proof</h2>
            <p className="mb-4 text-sm text-gray-600">
              Invoice #{selectedInvoice.id.substring(0, 8)} · {formatCurrency(selectedInvoice.totalamount || 0)} total
            </p>
            <PaymentProofUpload
              invoiceId={selectedInvoice.id}
              outstandingBalance={account?.outstandingBalance}
              onSuccess={handlePaymentUploadSuccess}
              onError={setError}
            />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowPaymentUpload(false);
                  setSelectedInvoice(null);
                  setAccount(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {(accountLoading || account) && selectedInvoice && !showPaymentUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold">Invoice Account</h2>
                <p className="text-sm text-gray-600">Invoice #{selectedInvoice.id.substring(0, 8)}</p>
              </div>
              <button type="button" onClick={() => { setAccount(null); setSelectedInvoice(null); }} className="text-gray-500 hover:text-gray-800">Close</button>
            </div>

            {accountLoading ? (
              <p>Loading account history...</p>
            ) : account ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <div className="rounded bg-gray-50 p-3"><div className="text-xs text-gray-500">Invoice total</div><div className="font-semibold">{formatCurrency(account.invoice?.totalamount || 0)}</div></div>
                  <div className="rounded bg-gray-50 p-3"><div className="text-xs text-gray-500">Outstanding</div><div className="font-semibold">{formatCurrency(account.outstandingBalance || 0)}</div></div>
                  <div className="rounded bg-gray-50 p-3"><div className="text-xs text-gray-500">Status</div><div className="font-semibold capitalize">{String(account.invoice?.status || '').replace('_', ' ')}</div></div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Payments</h3>
                  {account.payments?.length ? (
                    <div className="space-y-2">
                      {account.payments.map((payment) => (
                        <div key={payment.id} className="rounded border border-gray-200 p-3 text-sm">
                          <div className="flex justify-between gap-2"><span>{formatCurrency(payment.amount)}</span><span className="capitalize">{payment.status}</span></div>
                          <div className="text-gray-500 mt-1">{formatDate(payment.paymentdate || payment.createdat)}</div>
                          {payment.paymentmethod && <div className="text-gray-500 mt-1">Method: {payment.paymentmethod}</div>}
                          {payment.transactionreference && <div className="text-gray-500 mt-1">Reference: {payment.transactionreference}</div>}
                          {payment.rejection_reason && <div className="text-red-700 mt-1">Reason: {payment.rejection_reason}</div>}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-500">No payments recorded.</p>}
                </div>

                <div>
                  <h3 className="font-medium mb-2">Receipts</h3>
                  {account.receipts?.length ? (
                    <div className="space-y-2">
                      {account.receipts.map((receipt) => (
                        <div key={receipt.id} className="rounded border border-green-200 bg-green-50 p-3 text-sm">
                          <div className="font-medium">Receipt {receipt.receipt_number}</div>
                          <div>{formatCurrency(receipt.amount)} · {formatDate(receipt.issued_at)}</div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-500">No verified receipts yet.</p>}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default RenteeInvoices;
