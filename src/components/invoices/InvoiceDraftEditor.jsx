import { useEffect, useMemo, useState } from 'react';
import {
  addInvoiceDraftComponent,
  issueInvoiceDraft,
  removeInvoiceDraftComponent,
  updateInvoiceDraft,
  updateInvoiceDraftComponent
} from '../../services/platformClient';

const toDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const InvoiceDraftEditor = ({
  invoice,
  components = [],
  onChanged,
  setError,
  setNotice
}) => {
  const [working, setWorking] = useState(false);
  const [dueDate, setDueDate] = useState(toDateInput(invoice?.duedate));
  const [notes, setNotes] = useState(invoice?.notes || '');
  const [newLine, setNewLine] = useState({
    componentType: 'other',
    description: '',
    amount: ''
  });
  const [edits, setEdits] = useState({});

  useEffect(() => {
    setDueDate(toDateInput(invoice?.duedate));
    setNotes(invoice?.notes || '');
  }, [invoice?.id, invoice?.duedate, invoice?.notes]);

  useEffect(() => {
    setEdits(Object.fromEntries((components || []).map((component) => [
      component.id,
      {
        description: component.description || '',
        amount: String(component.amount ?? '')
      }
    ])));
  }, [components]);

  const total = useMemo(
    () => (components || []).reduce((sum, component) => sum + Number(component.amount || 0), 0),
    [components]
  );

  const run = async (operation, successMessage) => {
    try {
      setWorking(true);
      setError?.(null);
      setNotice?.(null);
      const result = await operation();
      if (result?.error) throw result.error;
      setNotice?.(successMessage);
      await onChanged?.();
      return true;
    } catch (error) {
      setError?.(error.message || 'Draft invoice update failed.');
      return false;
    } finally {
      setWorking(false);
    }
  };

  const saveDraftMeta = async () => {
    await run(
      () => updateInvoiceDraft(invoice.id, {
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : null,
        notes
      }),
      'Draft invoice details updated.'
    );
  };

  const saveComponent = async (component) => {
    const edit = edits[component.id] || {};
    await run(
      () => updateInvoiceDraftComponent(invoice.id, component.id, {
        description: edit.description,
        amount: Number(edit.amount)
      }),
      'Invoice line updated.'
    );
  };

  const removeComponent = async (component) => {
    if (!window.confirm(`Remove "${component.description || component.component_type}" from this draft invoice?`)) return;
    await run(
      () => removeInvoiceDraftComponent(invoice.id, component.id),
      'Invoice line removed from draft.'
    );
  };

  const addComponent = async (event) => {
    event.preventDefault();
    const amount = Number(newLine.amount);
    if (!newLine.description.trim() || !Number.isFinite(amount) || amount === 0) {
      setError?.('Enter a description and a non-zero amount for the new line item.');
      return;
    }
    const ok = await run(
      () => addInvoiceDraftComponent(invoice.id, {
        componentType: newLine.componentType,
        description: newLine.description.trim(),
        amount
      }),
      'Additional invoice line added.'
    );
    if (ok) {
      setNewLine({ componentType: 'other', description: '', amount: '' });
    }
  };

  const issue = async () => {
    if (!window.confirm('Issue this invoice and email it to the renter? After issue, line items are locked.')) return;
    await run(
      () => issueInvoiceDraft(invoice.id),
      'Invoice issued and sent to the renter.'
    );
  };

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-950">Draft invoice review</h2>
          <p className="text-sm text-blue-800">
            Review generated charges, add corrections or other items, then issue the final invoice.
          </p>
        </div>
        <div className="text-sm font-semibold text-blue-950">
          Draft total: {Number(total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Invoice notes</label>
          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional note for this invoice"
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
      </div>
      <button
        type="button"
        disabled={working}
        onClick={saveDraftMeta}
        className="mt-3 rounded-md border border-blue-300 bg-white px-3 py-2 text-sm text-blue-800 disabled:opacity-50"
      >
        Save due date & notes
      </button>

      <div className="mt-6 space-y-3">
        <h3 className="font-medium text-blue-950">Line items</h3>
        {(components || []).map((component) => {
          const edit = edits[component.id] || { description: '', amount: '' };
          return (
            <div key={component.id} className="grid grid-cols-1 gap-2 rounded-md border bg-white p-3 md:grid-cols-[1fr_160px_auto]">
              <div>
                <div className="mb-1 text-xs uppercase text-gray-500">
                  {String(component.component_type || 'other').replaceAll('_', ' ')}
                  {component.source_type ? ` · ${String(component.source_type).replaceAll('_', ' ')}` : ''}
                </div>
                <input
                  type="text"
                  value={edit.description}
                  onChange={(event) => setEdits((current) => ({
                    ...current,
                    [component.id]: { ...edit, description: event.target.value }
                  }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="mb-1 text-xs uppercase text-gray-500">Amount</div>
                <input
                  type="number"
                  step="0.01"
                  value={edit.amount}
                  onChange={(event) => setEdits((current) => ({
                    ...current,
                    [component.id]: { ...edit, amount: event.target.value }
                  }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  disabled={working}
                  onClick={() => saveComponent(component)}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={working}
                  onClick={() => removeComponent(component)}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={addComponent} className="mt-6 rounded-md border border-dashed border-blue-300 bg-white p-4">
        <h3 className="font-medium">Add another item or correction</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_160px_auto]">
          <select
            value={newLine.componentType}
            onChange={(event) => setNewLine((current) => ({ ...current, componentType: event.target.value }))}
            className="rounded-md border px-3 py-2"
          >
            <option value="other">Other charge</option>
            <option value="arrears">Past dues / arrears</option>
            <option value="tax">Tax</option>
            <option value="adjustment">Adjustment / correction</option>
          </select>
          <input
            type="text"
            required
            placeholder="Description"
            value={newLine.description}
            onChange={(event) => setNewLine((current) => ({ ...current, description: event.target.value }))}
            className="rounded-md border px-3 py-2"
          />
          <input
            type="number"
            required
            step="0.01"
            placeholder="Amount"
            value={newLine.amount}
            onChange={(event) => setNewLine((current) => ({ ...current, amount: event.target.value }))}
            className="rounded-md border px-3 py-2"
          />
          <button
            type="submit"
            disabled={working}
            className="rounded-md border border-blue-300 px-3 py-2 text-blue-800 disabled:opacity-50"
          >
            Add item
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Use Adjustment for a correction that may be negative. Other charge types must be positive.
        </p>
      </form>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={working || !components.length || total <= 0}
          onClick={issue}
          className="rounded-md bg-green-600 px-5 py-2.5 font-medium text-white disabled:bg-gray-300"
        >
          {working ? 'Working…' : 'Issue & Send Invoice'}
        </button>
      </div>
    </section>
  );
};

export default InvoiceDraftEditor;
