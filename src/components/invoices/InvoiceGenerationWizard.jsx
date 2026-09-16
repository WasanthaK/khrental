import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PropertySelector from '../properties/PropertySelector';
import { useProperty } from '../../contexts/PropertyContext';
import { generateTenancyMonthlyInvoices } from '../../services/platformClient';
import { formatCurrency } from '../../utils/helpers';

const getDefaultBillingPeriod = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};

const getDefaultDueDate = () => {
  const due = new Date();
  due.setDate(due.getDate() + 14);
  return due.toISOString().slice(0, 10);
};

const InvoiceGenerationWizard = () => {
  const navigate = useNavigate();
  const { selectedPropertyIds } = useProperty();
  const [selectedProperties, setSelectedProperties] = useState([]);
  const [billingPeriod, setBillingPeriod] = useState(getDefaultBillingPeriod());
  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (selectedPropertyIds.length > 0) {
      setSelectedProperties(selectedPropertyIds);
    }
  }, [selectedPropertyIds]);

  const summary = useMemo(() => {
    const created = result?.created || [];
    return {
      count: created.length,
      total: created.reduce((sum, invoice) => sum + (Number(invoice.totalAmount) || 0), 0),
      skipped: result?.skipped?.length || 0,
      errors: result?.errors?.length || 0
    };
  }, [result]);

  const handleGenerate = async () => {
    if (!selectedProperties.length) {
      setError('Select at least one property.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const aggregate = { created: [], skipped: [], errors: [] };
      for (const propertyId of selectedProperties) {
        const { data, error: requestError } = await generateTenancyMonthlyInvoices({
          propertyId,
          billingPeriod,
          dueDate,
          notes: notes || null
        });

        if (requestError) {
          aggregate.errors.push({ propertyId, error: requestError.message });
          continue;
        }

        aggregate.created.push(...(data?.created || []));
        aggregate.skipped.push(...(data?.skipped || []));
        aggregate.errors.push(...(data?.errors || []));
      }

      setResult(aggregate);
      if (!aggregate.created.length && aggregate.errors.length) {
        setError('No invoices were created. Review the errors below.');
      }
    } catch (generationError) {
      setError(generationError.message || 'Invoice generation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Monthly billing is generated from <strong>active tenancies</strong>. Rent comes from the active agreement and approved utility readings for the selected month are attached to the same invoice. Re-running the same property/month safely skips existing tenancy invoices.
      </div>

      <PropertySelector
        multiSelect
        value={selectedProperties}
        onChange={setSelectedProperties}
        label="Properties to bill"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Billing period</label>
          <input
            type="month"
            value={billingPeriod}
            onChange={(event) => setBillingPeriod(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Invoice notes</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional notes to place on newly generated invoices"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || selectedProperties.length === 0 || !billingPeriod || !dueDate}
          className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {loading ? 'Generating…' : 'Generate Monthly Invoices'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard/invoices')}
          className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          View invoices
        </button>
      </div>

      {result && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-lg font-semibold">Generation result</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded bg-green-50 p-3"><div className="text-xs text-gray-600">Created</div><div className="text-xl font-semibold">{summary.count}</div></div>
            <div className="rounded bg-blue-50 p-3"><div className="text-xs text-gray-600">Value</div><div className="text-xl font-semibold">{formatCurrency(summary.total)}</div></div>
            <div className="rounded bg-yellow-50 p-3"><div className="text-xs text-gray-600">Skipped</div><div className="text-xl font-semibold">{summary.skipped}</div></div>
            <div className="rounded bg-red-50 p-3"><div className="text-xs text-gray-600">Errors</div><div className="text-xl font-semibold">{summary.errors}</div></div>
          </div>

          {result.created.length > 0 && (
            <div>
              <h4 className="mb-2 font-medium">Created invoices</h4>
              <div className="space-y-2 text-sm">
                {result.created.map((entry) => (
                  <div key={entry.invoiceId} className="flex flex-wrap justify-between gap-2 rounded border border-gray-200 p-2">
                    <span>{entry.invoiceId}</span>
                    <span>{formatCurrency(entry.totalAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="text-sm text-gray-700">
              {result.skipped.length} tenancy invoice(s) were skipped because they already exist for this month or had no billable components.
            </div>
          )}

          {result.errors.length > 0 && (
            <div>
              <h4 className="mb-2 font-medium text-red-800">Errors</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
                {result.errors.map((entry, index) => (
                  <li key={`${entry.agreementId || entry.propertyId || 'error'}-${index}`}>{entry.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InvoiceGenerationWizard;
