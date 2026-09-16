import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { formatCurrency, formatDate } from '../utils/helpers';
import {
  addTenancySettlementItem,
  approveTenancySettlement,
  closeTenancy,
  completeMoveOutInspection,
  createRenewalDraft,
  createTenancyNotice,
  getTenancyExit,
  initializeMoveOutInspection,
  reviewTenancySettlementItem,
  settleTenancy,
  updateMoveOutInspectionItem
} from '../services/tenancyExitService';

const badgeClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'accepted', 'acknowledged', 'approved', 'settled', 'completed', 'good'].includes(normalized)) {
    return 'bg-green-100 text-green-800';
  }
  if (['declined', 'rejected', 'damaged', 'missing'].includes(normalized)) {
    return 'bg-red-100 text-red-800';
  }
  if (['sent', 'draft', 'open', 'proposed', 'pending'].includes(normalized)) {
    return 'bg-yellow-100 text-yellow-800';
  }
  return 'bg-gray-100 text-gray-700';
};

const StatusBadge = ({ status }) => (
  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${badgeClass(status)}`}>
    {String(status || 'not started').replaceAll('_', ' ')}
  </span>
);

const InspectionItem = ({ agreementId, item, disabled, onSaved }) => {
  const [conditionStatus, setConditionStatus] = useState(item.condition_status || 'pending');
  const [notes, setNotes] = useState(item.notes || '');
  const [proposedDeduction, setProposedDeduction] = useState(item.proposed_deduction ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConditionStatus(item.condition_status || 'pending');
    setNotes(item.notes || '');
    setProposedDeduction(item.proposed_deduction ?? '');
  }, [item]);

  const save = async () => {
    setSaving(true);
    const result = await updateMoveOutInspectionItem(agreementId, item.id, {
      conditionStatus,
      notes,
      proposedDeduction: proposedDeduction === '' ? null : Number(proposedDeduction)
    });
    if (result.error) {
      toast.error(result.error.message || 'Failed to update inspection item');
    } else {
      toast.success(`${item.label} updated`);
      await onSaved();
    }
    setSaving(false);
  };

  return (
    <div className="border rounded-md p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900">{item.label}</p>
          <p className="text-xs text-gray-500">Checklist item {item.item_order}</p>
        </div>
        <StatusBadge status={item.condition_status} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          value={conditionStatus}
          onChange={(event) => setConditionStatus(event.target.value)}
          disabled={disabled || saving}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="good">Good</option>
          <option value="damaged">Damaged</option>
          <option value="missing">Missing</option>
          <option value="not_applicable">Not applicable</option>
        </select>
        <input
          value={proposedDeduction}
          onChange={(event) => setProposedDeduction(event.target.value)}
          disabled={disabled || saving}
          type="number"
          min="0"
          step="0.01"
          placeholder="Proposed deduction"
          className="border rounded-md px-3 py-2 text-sm"
        />
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={disabled || saving}
          placeholder="Inspection notes"
          className="border rounded-md px-3 py-2 text-sm"
        />
      </div>
      {!disabled && (
        <button onClick={save} disabled={saving || conditionStatus === 'pending'} className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50">
          {saving ? 'Saving...' : 'Save inspection item'}
        </button>
      )}
    </div>
  );
};

const TenancyExit = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [renewalDraft, setRenewalDraft] = useState(null);
  const [notice, setNotice] = useState({ noticeType: 'termination_notice', noticeDate: new Date().toISOString().slice(0, 10), effectiveDate: '', content: '' });
  const [renewal, setRenewal] = useState({ startDate: '', endDate: '', rentAmount: '', depositAmount: '', notes: '' });
  const [inspection, setInspection] = useState({ inspectionDate: '', notes: '' });
  const [settlementItem, setSettlementItem] = useState({ itemType: 'other', description: '', amount: '', notes: '' });
  const [settlementNotes, setSettlementNotes] = useState('');
  const [settlementReference, setSettlementReference] = useState('');
  const [closure, setClosure] = useState({ effectiveEndDate: '', reason: 'tenancy_closed' });

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getTenancyExit(id);
    if (result.error) {
      toast.error(result.error.message || 'Failed to load tenancy exit workspace');
      setData(null);
    } else {
      setData(result.data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (operation, successMessage, refresh = true) => {
    setWorking(true);
    const result = await operation();
    if (result.error) {
      toast.error(result.error.message || 'Action failed');
    } else {
      toast.success(successMessage);
      if (refresh) {
        await load();
      }
    }
    setWorking(false);
    return result;
  };

  const latestRenewal = useMemo(() => data?.notices?.find((item) => item.notice_type === 'renewal_offer') || null, [data]);
  const acceptedRenewal = useMemo(() => data?.notices?.find((item) => item.notice_type === 'renewal_offer' && item.status === 'accepted') || null, [data]);
  const terminationNotice = useMemo(() => data?.notices?.find((item) => item.notice_type === 'termination_notice') || null, [data]);
  const inspectionComplete = data?.inspection?.status === 'completed';
  const allInspectionItemsReviewed = Boolean(data?.inspection) && (data.inspection.items || []).every((item) => item.condition_status !== 'pending');
  const settlement = data?.settlement;
  const settlementItemsPending = (settlement?.items || []).some((item) => item.status === 'proposed');
  const canClose = data?.agreement?.status === 'active' && inspectionComplete && settlement?.status === 'settled';

  if (loading) {
    return <div className="p-8 text-gray-600">Loading renewal and exit workspace...</div>;
  }

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-red-700 mb-3">The tenancy exit workspace could not be loaded.</p>
        <Link to="/dashboard/agreements" className="text-blue-600 hover:text-blue-800">Back to agreements</Link>
      </div>
    );
  }

  const { agreement } = data;
  const isClosed = agreement.status === 'closed';

  const sendNotice = async (event) => {
    event.preventDefault();
    const result = await runAction(() => createTenancyNotice(id, notice), notice.noticeType === 'renewal_offer' ? 'Renewal offer sent' : 'Termination notice sent');
    if (!result.error) {
      setNotice((current) => ({ ...current, effectiveDate: '', content: '' }));
    }
  };

  const createDraft = async (event) => {
    event.preventDefault();
    const payload = {
      ...renewal,
      rentAmount: renewal.rentAmount === '' ? undefined : Number(renewal.rentAmount),
      depositAmount: renewal.depositAmount === '' ? undefined : Number(renewal.depositAmount)
    };
    const result = await runAction(() => createRenewalDraft(id, payload), 'Renewal draft created', false);
    if (!result.error) {
      setRenewalDraft(result.data);
      await load();
    }
  };

  const startInspection = async (event) => {
    event.preventDefault();
    await runAction(() => initializeMoveOutInspection(id, inspection), 'Move-out inspection initialized');
  };

  const completeInspection = async () => {
    await runAction(() => completeMoveOutInspection(id), 'Move-out inspection completed');
  };

  const addSettlementItem = async (event) => {
    event.preventDefault();
    const result = await runAction(() => addTenancySettlementItem(id, {
      ...settlementItem,
      amount: Number(settlementItem.amount)
    }), 'Settlement item added');
    if (!result.error) {
      setSettlementItem({ itemType: 'other', description: '', amount: '', notes: '' });
    }
  };

  const reviewSettlementItem = async (itemId, status) => {
    await runAction(() => reviewTenancySettlementItem(id, itemId, status), `Settlement item ${status}`);
  };

  const approveSettlement = async () => {
    await runAction(() => approveTenancySettlement(id, settlementNotes), 'Settlement approved');
  };

  const markSettled = async () => {
    await runAction(() => settleTenancy(id, settlementReference), 'Settlement marked as settled');
  };

  const finishTenancy = async (event) => {
    event.preventDefault();
    const result = await runAction(() => closeTenancy(id, closure), 'Tenancy closed and unit released');
    if (!result.error) {
      await load();
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-500 mb-1">Phase 7 tenancy lifecycle</p>
          <h1 className="text-2xl font-bold text-gray-900">Renewal, Exit & Settlement</h1>
          <p className="text-gray-600 mt-1">
            {agreement.rentee_name || 'Tenant'} · {agreement.property_name || 'Property'}{agreement.unit_name ? ` · Unit ${agreement.unit_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={agreement.status} />
          <Link to={`/dashboard/agreements/${agreement.id}`} className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50">Agreement</Link>
          <Link to="/dashboard/agreements" className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50">Back</Link>
        </div>
      </div>

      {isClosed && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-800 rounded-md p-4">
          This tenancy is closed. Historical notices, inspection and settlement records remain available below.
          {agreement.closed_at && <span className="ml-1">Closed {formatDate(agreement.closed_at)}.</span>}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <section className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold">1. Renewal or termination notice</h2>
                <p className="text-sm text-gray-500">Notices are persisted and the tenant responds from the tenant portal.</p>
              </div>
              <StatusBadge status={terminationNotice?.status || latestRenewal?.status || 'not started'} />
            </div>

            {data.notices?.length > 0 && (
              <div className="space-y-2 mb-5">
                {data.notices.map((item) => (
                  <div key={item.id} className="border rounded-md p-3 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <p className="font-medium capitalize">{item.notice_type.replaceAll('_', ' ')}</p>
                      <p className="text-xs text-gray-500">Notice {formatDate(item.notice_date)}{item.effective_date ? ` · Effective ${formatDate(item.effective_date)}` : ''}</p>
                      {item.content && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{item.content}</p>}
                      {item.response_notes && <p className="text-xs text-gray-600 mt-2">Tenant response: {item.response_notes}</p>}
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            )}

            {!isClosed && agreement.status === 'active' && (
              <form onSubmit={sendNotice} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select value={notice.noticeType} onChange={(event) => setNotice((current) => ({ ...current, noticeType: event.target.value }))} className="border rounded-md px-3 py-2">
                  <option value="termination_notice">Termination notice</option>
                  <option value="renewal_offer">Renewal offer</option>
                </select>
                <input type="date" value={notice.noticeDate} onChange={(event) => setNotice((current) => ({ ...current, noticeDate: event.target.value }))} className="border rounded-md px-3 py-2" />
                <input type="date" value={notice.effectiveDate} onChange={(event) => setNotice((current) => ({ ...current, effectiveDate: event.target.value }))} className="border rounded-md px-3 py-2" />
                <input value={notice.content} onChange={(event) => setNotice((current) => ({ ...current, content: event.target.value }))} placeholder="Notice message" className="border rounded-md px-3 py-2" />
                <button disabled={working} className="md:col-span-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50">Send notice</button>
              </form>
            )}
          </section>

          {acceptedRenewal && !isClosed && (
            <section className="bg-white rounded-lg shadow p-5">
              <h2 className="text-lg font-semibold mb-1">2A. Create renewal agreement</h2>
              <p className="text-sm text-gray-500 mb-4">An accepted renewal offer can create a linked draft that returns to the normal signing and activation workflow.</p>
              {renewalDraft && (
                <div className="mb-4 bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
                  Renewal draft created. <Link to={`/dashboard/agreements/${renewalDraft.id}`} className="font-medium underline">Open renewal agreement</Link>
                </div>
              )}
              <form onSubmit={createDraft} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input required type="date" value={renewal.startDate} onChange={(event) => setRenewal((current) => ({ ...current, startDate: event.target.value }))} className="border rounded-md px-3 py-2" />
                <input required type="date" value={renewal.endDate} onChange={(event) => setRenewal((current) => ({ ...current, endDate: event.target.value }))} className="border rounded-md px-3 py-2" />
                <input type="number" min="0" step="0.01" value={renewal.rentAmount} onChange={(event) => setRenewal((current) => ({ ...current, rentAmount: event.target.value }))} placeholder={`Rent amount (${agreement.rentamount ?? 'current'})`} className="border rounded-md px-3 py-2" />
                <input type="number" min="0" step="0.01" value={renewal.depositAmount} onChange={(event) => setRenewal((current) => ({ ...current, depositAmount: event.target.value }))} placeholder={`Deposit amount (${agreement.depositamount ?? 'current'})`} className="border rounded-md px-3 py-2" />
                <input value={renewal.notes} onChange={(event) => setRenewal((current) => ({ ...current, notes: event.target.value }))} placeholder="Renewal notes" className="md:col-span-2 border rounded-md px-3 py-2" />
                <button disabled={working} className="md:col-span-2 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50">Create linked renewal draft</button>
              </form>
            </section>
          )}

          {(terminationNotice || data.inspection || isClosed) && (
            <section className="bg-white rounded-lg shadow p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">2B. Move-out inspection</h2>
                  <p className="text-sm text-gray-500">The inspection begins from the move-in/property checklist and feeds proposed deductions into settlement.</p>
                </div>
                <StatusBadge status={data.inspection?.status || 'not started'} />
              </div>

              {!data.inspection && !isClosed ? (
                <form onSubmit={startInspection} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="datetime-local" value={inspection.inspectionDate} onChange={(event) => setInspection((current) => ({ ...current, inspectionDate: event.target.value }))} className="border rounded-md px-3 py-2" />
                  <input value={inspection.notes} onChange={(event) => setInspection((current) => ({ ...current, notes: event.target.value }))} placeholder="Inspection notes" className="border rounded-md px-3 py-2" />
                  <button disabled={working} className="md:col-span-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50">Initialize inspection</button>
                </form>
              ) : data.inspection ? (
                <div className="space-y-3">
                  {(data.inspection.items || []).length === 0 && <p className="text-sm text-gray-600">There are no checklist items for this property.</p>}
                  {(data.inspection.items || []).map((item) => (
                    <InspectionItem key={item.id} agreementId={id} item={item} disabled={working || inspectionComplete || isClosed} onSaved={load} />
                  ))}
                  {!inspectionComplete && !isClosed && (
                    <button disabled={working || !allInspectionItemsReviewed} onClick={completeInspection} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm disabled:opacity-50">
                      Complete move-out inspection
                    </button>
                  )}
                </div>
              ) : null}
            </section>
          )}

          {(settlement || inspectionComplete || isClosed) && (
            <section className="bg-white rounded-lg shadow p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">3. Deposit and financial settlement</h2>
                  <p className="text-sm text-gray-500">Approved deductions plus outstanding invoices are reconciled against security deposit received.</p>
                </div>
                <StatusBadge status={settlement?.status || 'draft'} />
              </div>

              {settlement && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5 text-sm">
                  <div className="border rounded p-3"><p className="text-gray-500">Deposit received</p><p className="font-semibold">{formatCurrency(settlement.deposit_received || 0)}</p></div>
                  <div className="border rounded p-3"><p className="text-gray-500">Deductions</p><p className="font-semibold">{formatCurrency(settlement.approved_deductions || 0)}</p></div>
                  <div className="border rounded p-3"><p className="text-gray-500">Outstanding invoices</p><p className="font-semibold">{formatCurrency(settlement.outstanding_invoices || 0)}</p></div>
                  <div className="border rounded p-3"><p className="text-gray-500">Refund</p><p className="font-semibold text-green-700">{formatCurrency(settlement.refund_amount || 0)}</p></div>
                  <div className="border rounded p-3"><p className="text-gray-500">Amount due</p><p className="font-semibold text-red-700">{formatCurrency(settlement.amount_due || 0)}</p></div>
                </div>
              )}

              {settlement?.items?.length > 0 && (
                <div className="space-y-2 mb-5">
                  {settlement.items.map((item) => (
                    <div key={item.id} className="border rounded-md p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.description}</p>
                        <p className="text-xs text-gray-500 capitalize">{item.item_type} · {formatCurrency(item.amount)}</p>
                        {item.notes && <p className="text-xs text-gray-600 mt-1">{item.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={item.status} />
                        {settlement.status === 'draft' && item.status === 'proposed' && !isClosed && (
                          <>
                            <button disabled={working} onClick={() => reviewSettlementItem(item.id, 'approved')} className="px-3 py-1 bg-green-600 text-white rounded text-xs">Approve</button>
                            <button disabled={working} onClick={() => reviewSettlementItem(item.id, 'rejected')} className="px-3 py-1 bg-red-600 text-white rounded text-xs">Reject</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(!settlement || settlement.status === 'draft') && !isClosed && (
                <form onSubmit={addSettlementItem} className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-4">
                  <select value={settlementItem.itemType} onChange={(event) => setSettlementItem((current) => ({ ...current, itemType: event.target.value }))} className="border rounded-md px-3 py-2">
                    <option value="damage">Damage</option>
                    <option value="arrears">Arrears</option>
                    <option value="utility">Utility</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="other">Other</option>
                  </select>
                  <input required type="number" min="0" step="0.01" value={settlementItem.amount} onChange={(event) => setSettlementItem((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="border rounded-md px-3 py-2" />
                  <input required value={settlementItem.description} onChange={(event) => setSettlementItem((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="border rounded-md px-3 py-2" />
                  <input value={settlementItem.notes} onChange={(event) => setSettlementItem((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" className="border rounded-md px-3 py-2" />
                  <button disabled={working} className="md:col-span-2 px-4 py-2 border border-blue-600 text-blue-700 rounded-md text-sm disabled:opacity-50">Add settlement item</button>
                </form>
              )}

              {settlement?.status === 'draft' && inspectionComplete && !isClosed && (
                <div className="mt-4 border-t pt-4">
                  <textarea value={settlementNotes} onChange={(event) => setSettlementNotes(event.target.value)} placeholder="Settlement approval notes" className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
                  <button disabled={working || settlementItemsPending} onClick={approveSettlement} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50">Approve settlement</button>
                </div>
              )}

              {settlement?.status === 'approved' && !isClosed && (
                <div className="mt-4 border-t pt-4 flex flex-col md:flex-row gap-3">
                  <input value={settlementReference} onChange={(event) => setSettlementReference(event.target.value)} placeholder="Payment/refund reference" className="flex-1 border rounded-md px-3 py-2" />
                  <button disabled={working} onClick={markSettled} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm disabled:opacity-50">Mark settlement settled</button>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="bg-white rounded-lg shadow p-5 xl:sticky xl:top-4">
            <h2 className="text-lg font-semibold mb-1">Closure readiness</h2>
            <p className="text-sm text-gray-500 mb-4">The server will only release the unit after inspection and settlement are complete.</p>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3"><span>Termination notice</span><StatusBadge status={terminationNotice?.status || 'not started'} /></div>
              <div className="flex justify-between gap-3"><span>Move-out inspection</span><StatusBadge status={data.inspection?.status || 'not started'} /></div>
              <div className="flex justify-between gap-3"><span>Settlement</span><StatusBadge status={settlement?.status || 'not started'} /></div>
              <div className="flex justify-between gap-3"><span>Agreement</span><StatusBadge status={agreement.status} /></div>
            </div>

            {!isClosed && (
              <form onSubmit={finishTenancy} className="mt-5 border-t pt-4 space-y-3">
                <input type="date" value={closure.effectiveEndDate} onChange={(event) => setClosure((current) => ({ ...current, effectiveEndDate: event.target.value }))} className="w-full border rounded-md px-3 py-2" />
                <input value={closure.reason} onChange={(event) => setClosure((current) => ({ ...current, reason: event.target.value }))} placeholder="Closure reason" className="w-full border rounded-md px-3 py-2" />
                <button disabled={working || !canClose} className="w-full px-4 py-2 bg-red-600 text-white rounded-md font-medium disabled:bg-gray-300 disabled:cursor-not-allowed">Close tenancy & release unit</button>
              </form>
            )}

            {!canClose && !isClosed && (
              <p className="text-xs text-amber-800 bg-amber-50 rounded-md p-3 mt-4">Complete the move-out inspection and mark the approved settlement as settled before closure.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default TenancyExit;
