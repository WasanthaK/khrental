import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import usePlatformAdminStatus from '../hooks/usePlatformAdminStatus';
import { getPortalLabel } from '../utils/accessPolicy.js';

const Settings = () => {
  const { user, membership, activeTenant, memberships } = useAuth();
  const { isPlatformAdmin } = usePlatformAdminStatus();
  const subject = { user, membership: membership || user?.membership || null };

  return (
    <div className="app-page">
      <div className="page-hero">
        <p className="page-kicker">Workspace Settings</p>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Workspace preferences and tenant context belong here. People onboarding stays in Tenants and Team; platform organization administration stays in Platform Admin.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="app-panel">
          <div className="app-panel-header">
            <h2 className="text-lg font-semibold text-slate-900">Current workspace</h2>
            <p className="text-sm text-slate-500">Quick context for the signed-in account and active organization.</p>
          </div>
          <div className="app-panel-body space-y-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Signed in as</div>
              <div className="mt-1 font-medium text-slate-900">{user?.email || 'Unknown user'}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Workspace role</div>
              <div className="mt-1 font-medium text-slate-900">{getPortalLabel(subject)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Active organization</div>
              <div className="mt-1 font-medium text-slate-900">{activeTenant?.name || activeTenant?.slug || 'No organization selected'}</div>
              <div className="mt-1 text-sm text-slate-500">{memberships?.length || 0} organization memberships available</div>
            </div>
          </div>
        </section>

        <section className="app-panel">
          <div className="app-panel-header">
            <h2 className="text-lg font-semibold text-slate-900">Administration</h2>
            <p className="text-sm text-slate-500">Business administration happens in the normal workspace. Platform administration is shown only to registered platform administrators.</p>
          </div>
          <div className="app-panel-body space-y-3">
            {isPlatformAdmin && (
              <Link to="/dashboard/tenant-admin" className="app-button w-full no-underline">
                Open Platform Admin
              </Link>
            )}
            <Link to="/dashboard" className="app-button-secondary w-full no-underline">
              Return to dashboard
            </Link>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Tenant administrators manage renters under Tenants and staff or contractors under Team. There is no separate generic user-onboarding screen.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Settings;