import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  activateTenancy,
  getTenancyOnboarding,
  initializeMoveInChecklist,
  recordTenancyDeposit,
  updateMoveInChecklistItem
} from '../services/platformClient';
import { resendInvitation } from '../services/invitationService';
import { formatCurrency, formatDate } from '../utils/helpers';

const CheckRow = ({ label, complete }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
    <span className="text-sm text-gray-700">{label}</span>
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${complete ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
      {complete ? 'Complete' : 'Required'}
    </span>
  </div>
);

const TenancyOnboarding = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [deposit, setDeposit] = useState({
    transactionType: 'security_deposit',
    amount: '',
    paymentMethod: '',
    paymentReference: '',
    notes: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getTenancyOnboarding(id);
    if (result.error) {
      toast.error(result.error.message || 'Failed to load tenancy onboarding');
      setData(null);
    } else {
      setData(result.data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResendInvitation = async () => {
    if (!data?.rentee?.id) return;
    setWorking(true);
    const result = await resendInvitation(data.rentee.id, false);
    if (result.success) {
      toast.success(result.message || 'Invitation sent');
      await load();
    } else {
      toast.error(result.error || 'Invitation could not be sent');
    }
    setWorking(false);
  };

  const handleDepositSubmit = async (event) => {
    event.preventDefault();
    setWorking(true);
    const result = await recordTenancyDeposit(id, {
      ...deposit,
      amount: Number(deposit.amount)
    });
    if (result.error) {
      toast.error(result.error.message || 'Failed to record payment');
    } else {
      toast.success('Payment recorded');
      setDeposit((current) => ({ ...current, amount: '', paymentReference: '', notes: '' }));
      await load();
    }
    setWorking(false);
  };

  const handleCreateChecklist = async () => {
    setWorking(true);
    const result = await initializeMoveInChecklist(id);
    if (result.error) {
      toast.error(result.error.message || 'Failed to create move-in checklist');
    } else {
      toast.success('Move-in checklist created from the property checklist');
      await load();
    }
    setWorking(false);
  };

  const handleChecklistItem = async (item) => {
    setWorking(true);
    const result = await updateMoveInChecklistItem(id, item.id, {
      status: item.status === 'completed' ? 'pending' : 'completed'
    });
    if (result.error) {
      toast.error(result.error.message || 'Failed to update checklist item');
    } else {
      await load();
    }
    setWorking(false);
  };

  const handleActivate = async () => {
    setWorking(true);
    const result = await activateTenancy(id);
    if (result.error) {
      const reasons = result.error.details?.blockingReasons;
      toast.error(Array.isArray(reasons) && reasons.length > 0 ? reasons.join(' ') : result.error.message || 'Tenancy could not be activated');
    } else {
      toast.success('Tenancy activated');
      setData(result.data);
    }
    setWorking(false);
  };

  if (loading) {
    return <div className="p-8 text-gray-600">Loading tenancy onboarding...</div>;
  }

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-red-700">Tenancy onboarding could not be loaded.</p>
        <Link to="/dashboard/agreements" className="text-blue-600 hover:text-blue-800">Back to agreements</Link>
      </div>
    );
  }

  const { agreement, rentee, property, unit, invitation, readiness, checklist } = data;
  const isActive = agreement?.status === 'active';

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-500 mb-1">Phase 4 tenancy onboarding</p>
          <h1 className="text-2xl font-bold text-gray-900">{rentee?.name || 'Tenant'} · {property?.name || 'Property not assigned'}</h1>
          <p className="text-gray-600 mt-1">
            {unit?.unitnumber ? `Unit ${unit.unitnumber} · ` : ''}{property?.address || ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/dashboard/agreements/${agreement.id}`} className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50">Agreement</Link>
          <Link to="/dashboard/agreements" className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50">Back</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">1. Tenant invitation</h2>
                <p className="text-sm text-gray-500">Secure invitation acceptance establishes the tenant account and membership.</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${rentee?.auth_id ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {rentee?.auth_id ? 'Accepted' : invitation?.state || 'Not accepted'}
              </span>
            </div>
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>Tenant:</strong> {rentee?.name}</p>
              <p><strong>Email:</strong> {rentee?.email}</p>
              {invitation?.expires_at && !rentee?.auth_id && <p><strong>Invite expires:</strong> {formatDate(invitation.expires_at)}</p>}
            </div>
            {!rentee?.auth_id && (
              <button disabled={working} onClick={handleResendInvitation} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                {invitation ? 'Resend secure invitation' : 'Send secure invitation'}
              </button>
            )}
          </section>

          <section className="bg-white rounded-lg shadow p-5">
            <h2 className="text-lg font-semibold mb-1">2. Property and unit assignment</h2>
            <p className="text-sm text-gray-500 mb-4">The agreement is the authoritative tenancy relationship.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="border rounded-md p-3">
                <p className="text-gray-500">Property</p>
                <p className="font-medium">{property?.name || 'Not assigned'}</p>
                <p className="text-gray-600">{property?.address}</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-gray-500">Unit</p>
                <p className="font-medium">{unit?.unitnumber || 'Whole property / no unit'}</p>
                {unit?.floor && <p className="text-gray-600">Floor {unit.floor}</p>}
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-5">
            <h2 className="text-lg font-semibold mb-1">3. Advance and security deposit</h2>
            <p className="text-sm text-gray-500 mb-4">Contract amount stays on the agreement; actual collections are recorded in the tenancy ledger.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5 text-sm">
              <div className="border rounded p-3"><p className="text-gray-500">Required security deposit</p><p className="font-semibold">{formatCurrency(readiness.requiredDeposit || 0)}</p></div>
              <div className="border rounded p-3"><p className="text-gray-500">Security deposit received</p><p className="font-semibold">{formatCurrency(readiness.securityDepositReceived || 0)}</p></div>
              <div className="border rounded p-3"><p className="text-gray-500">Confirmation advance</p><p className="font-semibold">{formatCurrency(data.deposit?.confirmationAdvance || 0)}</p></div>
            </div>

            {!isActive && (
              <form onSubmit={handleDepositSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select value={deposit.transactionType} onChange={(e) => setDeposit((current) => ({ ...current, transactionType: e.target.value }))} className="border rounded-md px-3 py-2">
                  <option value="security_deposit">Security deposit</option>
                  <option value="confirmation_advance">Confirmation advance</option>
                </select>
                <input required type="number" min="0.01" step="0.01" placeholder="Amount" value={deposit.amount} onChange={(e) => setDeposit((current) => ({ ...current, amount: e.target.value }))} className="border rounded-md px-3 py-2" />
                <input placeholder="Payment method" value={deposit.paymentMethod} onChange={(e) => setDeposit((current) => ({ ...current, paymentMethod: e.target.value }))} className="border rounded-md px-3 py-2" />
                <input placeholder="Reference" value={deposit.paymentReference} onChange={(e) => setDeposit((current) => ({ ...current, paymentReference: e.target.value }))} className="border rounded-md px-3 py-2" />
                <input placeholder="Notes" value={deposit.notes} onChange={(e) => setDeposit((current) => ({ ...current, notes: e.target.value }))} className="border rounded-md px-3 py-2 md:col-span-2" />
                <button disabled={working} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 md:col-span-2">Record payment</button>
              </form>
            )}
          </section>

          <section className="bg-white rounded-lg shadow p-5">
            <h2 className="text-lg font-semibold mb-1">4. Agreement</h2>
            <p className="text-sm text-gray-500 mb-4">Agreement preparation and Evia signing remain in the existing agreement workflow.</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="border rounded px-3 py-2">Status: <strong>{agreement.status}</strong></span>
              <span className="border rounded px-3 py-2">Signature: <strong>{agreement.signature_status || 'not completed'}</strong></span>
              <Link to={`/dashboard/agreements/${agreement.id}`} className="px-3 py-2 bg-gray-900 text-white rounded hover:bg-gray-800">Open agreement</Link>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold">5. Move-in checklist</h2>
                <p className="text-sm text-gray-500">Creates a historical snapshot from the property's checklist items.</p>
              </div>
              {checklist && <span className={`text-xs font-medium px-2 py-1 rounded-full ${checklist.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{checklist.status}</span>}
            </div>

            {!checklist ? (
              <button disabled={working || !agreement.propertyid} onClick={handleCreateChecklist} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">Create move-in checklist</button>
            ) : checklist.items?.length > 0 ? (
              <div className="space-y-2">
                {checklist.items.map((item) => (
                  <label key={item.id} className="flex items-start gap-3 border rounded-md p-3 cursor-pointer">
                    <input type="checkbox" disabled={working || isActive} checked={item.status === 'completed'} onChange={() => handleChecklistItem(item)} className="mt-1" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      {item.notes && <p className="text-xs text-gray-500 mt-1">{item.notes}</p>}
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-green-700">This property has no configured checklist items; the empty checklist is complete.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="bg-white rounded-lg shadow p-5 lg:sticky lg:top-4">
            <h2 className="text-lg font-semibold mb-1">6. Activation readiness</h2>
            <p className="text-sm text-gray-500 mb-4">Activation is a server-controlled transition.</p>
            <div>
              <CheckRow label="Tenant assigned" complete={readiness.checks.tenantAssigned} />
              <CheckRow label="Invitation accepted" complete={readiness.checks.accountAccepted} />
              <CheckRow label="Tenant membership active" complete={readiness.checks.membershipActive} />
              <CheckRow label="Property assigned" complete={readiness.checks.propertyAssigned} />
              <CheckRow label="Agreement signed" complete={readiness.checks.agreementSigned} />
              <CheckRow label="Security deposit satisfied" complete={readiness.checks.securityDepositSatisfied} />
              <CheckRow label="Move-in checklist complete" complete={readiness.checks.moveInChecklistComplete} />
            </div>

            {readiness.blockingReasons?.length > 0 && !isActive && (
              <ul className="mt-4 text-xs text-amber-800 bg-amber-50 rounded-md p-3 space-y-1">
                {readiness.blockingReasons.map((reason) => <li key={reason}>• {reason}</li>)}
              </ul>
            )}

            <button
              disabled={working || !readiness.canActivate || isActive}
              onClick={handleActivate}
              className="mt-5 w-full px-4 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isActive ? 'Tenancy active' : 'Activate tenancy'}
            </button>

            {agreement.activated_at && <p className="text-xs text-gray-500 mt-3">Activated {formatDate(agreement.activated_at)}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default TenancyOnboarding;
