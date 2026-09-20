import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createBillingAdjustment,
  getMonthlyBillingContext,
  voidBillingAdjustment
} from '../../services/platformClient';
import { formatCurrency } from '../../utils/helpers';

const TYPE_OPTIONS = [
  { value: 'arrears', label: 'Approved arrears / past due' },
  { value: 'tax', label: 'Tax' },
  { value: 'adjustment', label: 'Adjustment / credit' },
  { value: 'other', label: 'Other charge' }
];

const BillingAdjustmentsPanel = ({ propertyIds = [], billingPeriod }) => {
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    agreementId: '',
    componentType: 'arrears',
    amount: '',
    description: ''
  });

  const load = useCallback(async () => {
    if (!billingPeriod || propertyIds.length === 0) {
      setContexts([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(propertyIds.map(async (propertyId) => {
        const { data, error: requestError } = await getMonthlyBillingContext({ propertyId, billingPeriod });
        if (requestError) throw requestError;
        return data;
      }));
      setContexts(results.filter(Boolean));
    } catch (loadError) {
      setError(loadError.message || 'Failed to load additional tenancy charges.');
      setContexts([]);
    } finally {
      setLoading(false);
    }
  }, [billingPeriod, propertyIds]);

  useEffect(() => {
    load();
  }, [load]);

  const tenancies = useMemo(() => contexts.flatMap((context) => context?.tenancies || []), [contexts]);
  const adjustments = useMemo(() => contexts.flatMap((context) => context?.adjustments || []), [contexts]);
  const schemaAvailable = contexts.length === 0 || contexts.every((context) => context?.schemaAvailable !== false);

  useEffect(() => {
    if (!form.agreementId && tenancies.length > 0) {
      const available = tenancies.find((tenancy) => !tenancy.invoice_exists);
      if (available) {
        setForm((current) => ({ ...current, agreementId: available.id }));
      }
    }
  }, [form.agreementId, tenancies]);

  const handleAdd = async () => {
    if (!form.agreementId || !form.amount || !form.description.trim()) {
      setError('Choose a tenancy and enter an amount and description.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { error: requestError } = await createBillingAdjustment(form.agreementId, {
        billingPeriod,
        componentType: form.componentType,
        amount: Number(form.amount),
        description: form.description.trim()
      });
      if (requestError) throw requestError;
      setForm((current) => ({ ...current, amount: '', description: '' }));
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Failed to add the tenancy charge.');
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (adjustment) => {
    const reason = window.prompt('Reason for voiding this charge:');
    if (!reason?.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const { error: requestError } = await voidBillingAdjustment(adjustment.id, reason.trim());
      if (requestError) throw requestError;
      await load();
    } catch (voidError) {
      setError(voidError.message || 'Failed to void the tenancy charge.');
    } finally {
      setSaving(false);
    }
  };

  if (propertyIds.length === 0 || !billingPeriod) return null;

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div>
        <h3 className="font-semibold text-gray-900">Additional tenancy charges</h3>
        <p className="mt-1 text-sm text-gray-600">
          Add approved arrears, tax, credits or other one-off charges before generating the monthly invoice. Each entry is tied to one tenancy and can be consumed by one invoice only.
        </p>
      </div>

      {loading && <div className="text-sm text-gray-600">Loading tenancy charges…</div>}

      {!loading && !schemaAvailable && (
        <div className="rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
          The billing-adjustment database migration has not been applied yet.
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      {!loading && schemaAvailable && tenancies.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Tenancy</label>
            <select
              value={form.agreementId}
              onChange={(event) => setForm((current) => ({ ...current, agreementId: event.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select tenancy</option>
              {tenancies.map((tenancy) => (
                <option key={tenancy.id} value={tenancy.id} disabled={Boolean(tenancy.invoice_exists)}>
                  {tenancy.rentee_name || 'Tenant'} — {tenancy.property_name || 'Property'}{tenancy.invoice_exists ? ' (already invoiced)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
            <select
              value={form.componentType}
              onChange={(event) => setForm((current) => ({ ...current, componentType: event.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Amount</label>
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              placeholder={form.componentType === 'adjustment' ? 'Use - for a credit' : '0.00'}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !form.agreementId}
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {saving ? 'Saving…' : 'Add charge'}
            </button>
          </div>

          <div className="lg:col-span-5">
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <input
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Why is this charge or credit being applied?"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {!loading && schemaAvailable && tenancies.length === 0 && (
        <div className="text-sm text-gray-600">No active tenancy overlaps this billing period for the selected properties.</div>
      )}

      {adjustments.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Tenant / property</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {adjustments.map((adjustment) => (
                <tr key={adjustment.id}>
                  <td className="px-3 py-2">{adjustment.rentee_name || 'Tenant'} — {adjustment.property_name || 'Property'}</td>
                  <td className="px-3 py-2 capitalize">{String(adjustment.component_type || '').replace('_', ' ')}</td>
                  <td className="px-3 py-2">{adjustment.description}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(Number(adjustment.amount) || 0)}</td>
                  <td className="px-3 py-2 capitalize">{adjustment.invoice_id ? 'invoiced' : adjustment.status}</td>
                  <td className="px-3 py-2 text-right">
                    {!adjustment.invoice_id && adjustment.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() => handleVoid(adjustment)}
                        disabled={saving}
                        className="text-red-600 hover:text-red-800 disabled:text-gray-400"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BillingAdjustmentsPanel;
